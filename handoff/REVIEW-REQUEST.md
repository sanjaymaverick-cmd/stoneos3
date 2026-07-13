# Review Request — Step 6B — AI Copilot: Gemini integration + owner-only chat page
*Written by Builder. Read by Reviewer.*

Date: 2026-07-13
Ready for Review: YES

---

## Files Changed

- `packages/backend/prisma/schema.prisma` — added `CopilotQueryLog` model (`copilot_query_log`
  block, ~15 lines, just before `model UtilityReading`) + inverse `Factory.copilotQueryLogs`
  relation (one line, in the `Factory` model's relations block). No RLS on this table by design —
  it's only ever written/read through `PrismaService` with explicit `factoryId` scoping, never
  touched by `stoneos_copilot_ro`.
- `packages/backend/prisma/migrations/20260713010000_copilot_query_log/migration.sql` (new, 17
  lines) — additive `CREATE TABLE copilot_query_log` + FK to `factory`. Generated via `prisma
  migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new> --script` (a pure
  two-schema-file diff, touches no DB) rather than `prisma migrate dev` — see "Open Questions"
  below for why, and the Builder Plan section of `handoff/ARCHITECT-BRIEF.md` for full reasoning.
  Applied directly via `psql` against the live dev DB, same pattern Step 6A used. Verified live:
  table exists with exactly the expected columns/FK (see Verification below).
- `packages/backend/package.json` — added `pg` (^8.13.1) + `@types/pg` (dev) + `@google/generative-ai`
  (^0.21.0). `npm install` run, no version conflicts.
- `packages/backend/src/modules/copilot/sql-validator.ts` (new, 103 lines) — pure
  `validateGeneratedSql(rawSql, defaultLimit = 500)`, no NestJS/DB dependency:
  - Lines 72-79: multi-statement rejection (`;` followed by non-whitespace content).
  - Lines 84-86: must start with `SELECT` after stripping leading whitespace/comments.
  - Lines 88-93: rejects 14 forbidden keywords (word-boundary matched, case-insensitive).
  - Lines 95-96: appends `LIMIT 500` only if none present.
- `packages/backend/src/modules/copilot/copilot-schema-context.ts` (new, 173 lines) — hand-built
  `COPILOT_SCHEMA_CONTEXT` string sent to Gemini as part of the prompt. See "Schema context
  inclusion/exclusion" below — this is a judgment call the brief asked to be flagged explicitly.
- `packages/backend/src/modules/copilot/copilot-readiness.service.ts` (new, 131 lines) —
  `CopilotReadinessService`, `OnModuleInit`:
  - Lines 13-46: `EXPECTED_RLS_TABLES`, the 35-table list copied verbatim from Step 6A's
    migration file (section headers preserved as comments so it's auditable against the source).
  - Lines 74-108: `checkRlsCoverage()` — queries `pg_class`/`pg_policies` via
    `PrismaService.$queryRaw` (using `Prisma.join` for the safe `IN (...)` list), sets `_ready`/
    `_reason`, logs loudly on any gap, never throws out of the module.
- `packages/backend/src/modules/copilot/copilot.service.ts` (new, 246 lines) — `CopilotService`:
  - Lines 47-141: `ask()` — the full orchestration, every exit path (readiness failure,
    generateSql failure, validation failure, execution failure, formatAnswer failure, success)
    calls `logAttempt()` before returning.
  - Lines 144-163: `generateSql()` — Gemini call #1 (not live-tested, see Flags).
  - Lines 173-193: `executeScoped()` — `BEGIN` → `SELECT set_config('app.current_factory_id',
    $1, true)` → `SET LOCAL statement_timeout = '5s'` → the validated query → `COMMIT` (or
    `ROLLBACK` + rethrow on error). **This is the single most important piece of code in this
    step** — see Verification below for how it was live-proven.
  - Lines 196-214: `formatAnswer()` — Gemini call #2 (not live-tested, see Flags).
  - Lines 216-235: `logAttempt()` — writes `CopilotQueryLog`; a logging failure itself is caught
    and logged, never allowed to crash the request.
- `packages/backend/src/modules/copilot/copilot.controller.ts` (new, 26 lines) — `POST
  /copilot/ask`, `@UseGuards(ClerkAuthGuard, RolesGuard)`, `@Roles("owner")` only.
- `packages/backend/src/modules/copilot/copilot.module.ts` (new, 11 lines).
- `packages/backend/src/app.module.ts` (13 lines total) — registers `CopilotModule`.
- `packages/frontend/app/copilot/page.tsx` (new, 183 lines) — owner-only chat page (`useRole()`
  gate, placeholder for everyone else including admin — narrower than `dashboard/page.tsx`'s
  gate), message list, textarea + submit with loading state, expandable "show query" per answer.
  No new CSS — reuses `.ticket`/`.field-input`/`.primary-btn`/`.mono`/`.empty-note`.
- `packages/frontend/components/AppNav.tsx` (34 lines total, ~2 lines changed) — added an
  owner-only "Copilot" nav link.
- `.env.example` (24 lines total) — `COPILOT_DATABASE_URL` uncommented (Step 6A left it
  commented-out/unused); added `GEMINI_API_KEY` placeholder + comment.
- `packages/backend/.env` (gitignored, not part of the repo diff) — added a real
  `COPILOT_DATABASE_URL` for local dev/testing against `stoneos_copilot_ro`.
- Scratchpad (throwaway, NOT committed, same pattern as Step 6A's
  `scratchpad/smoke-test-copilot-rls.js`): `test-sql-validator.js`,
  `test-copilot-rls-execution.js`, `test-copilot-readiness.js`, `test-copilot-ask-flow.js` — full
  results below.

## What and Why

1. **`CopilotQueryLog` + migration** — the audit trail the brief requires for every `/copilot/ask`
   attempt. Ordinary Prisma-shaped additive table, no RLS (out of scope for this table — see
   brief section 1).
2. **`sql-validator.ts`** — defense-in-depth so a bad Gemini generation fails fast with a friendly
   message instead of a raw Postgres error; not the real safety boundary (that's still
   `stoneos_copilot_ro`'s lack of write/DDL grants at the database level, from Step 6A).
3. **`copilot-schema-context.ts`** — gives Gemini real table/column names plus the business-
   meaning comments already in `schema.prisma`/`README.md`, so generated SQL is more likely to be
   both correct and to respect real business rules (e.g. never using `slab.length_ft`/`width_ft`
   for recovery ratio).
4. **`copilot-readiness.service.ts`** — the startup RLS-coverage assertion the brief requires to
   contain Step 6A's KG-8 (a future table silently missing RLS) to just this one feature.
5. **`copilot.service.ts`** — the actual generate → validate → execute → format → log pipeline,
   with `executeScoped()` being the piece that makes Step 6A's RLS guarantee actually apply to
   this feature's queries.
6. **`copilot.controller.ts`** — `@Roles("owner")` only, per the Owner's explicit narrower choice
   for this feature (not "owner, admin" like the dashboard).
7. **Frontend `/copilot` page + nav link** — the actual UI, with the SQL-transparency mechanism
   ("if a number ever looks wrong, you can see exactly what SQL produced it") the Owner was
   promised.

## Verification — what was actually run, live, against real local Postgres (`stoneos-postgres-1`)

All of the below used the REAL compiled code (`packages/backend/dist/...`, built via `npm run
build` immediately before each run) — not reimplementations — and cleaned up all seeded test
data afterward, confirmed via before/after row-count snapshots on `factory`/`expense`.

**1. SQL validator — 34/34 passed** (`test-sql-validator.js`):
- Valid SELECTs: bare (gets `LIMIT 500` appended), with an existing smaller `LIMIT` (left alone,
  not duplicated/overridden), case-insensitive `select` + trailing semicolon, leading whitespace,
  leading `--` comment, leading `/* */` comment, a realistic multi-line JOIN/GROUP BY/ORDER BY.
- Multi-statement rejection: `SELECT...; DROP TABLE...;`, semicolon + whitespace + more SQL,
  semicolon with no space before more SQL — all 3 rejected.
- Every one of the 14 forbidden keywords rejected in its own test case (INSERT, UPDATE, DELETE,
  DROP, ALTER, TRUNCATE, GRANT, REVOKE, CREATE, COPY, EXECUTE, CALL, VACUUM, SET, DO).
- False-positive guard: columns named `created_at`, `downtime_reason`, `invoiced_amount` do NOT
  trigger keyword rejection (word-boundary matching confirmed correct, not naive substring match).
- Empty string / whitespace-only input rejected.

**2. RLS-scoped execution path — 5/5 passed** (`test-copilot-rls-execution.js`, calling the real
`CopilotService.executeScoped` directly — TS `private` has no runtime effect):
- Factory A's query sees only factory A's seeded expense row; factory B's query (identical SQL
  text) sees only factory B's row.
- A nonexistent factory id returns zero rows (fail-closed), not an error.
- `SET LOCAL statement_timeout = '5s'` genuinely cancels a `pg_sleep(6)` query with a real
  `canceling statement due to statement timeout` error — not dead code.
- 8 alternating factory-A/factory-B requests through the same connection pool showed zero
  cross-tenant leakage, confirming `set_config(..., true)` inside each request's own
  `BEGIN`/`COMMIT` resets per-transaction as intended and cannot bleed into the next pooled
  connection reuse — this is the specific regression the brief was most worried about.

**3. Startup RLS-coverage assertion — 4/4 passed** (`test-copilot-readiness.js`, real
`PrismaService.$queryRaw` against real Postgres):
- `EXPECTED_RLS_TABLES` has exactly 35 entries.
- Correctly reports NOT ready given this dev DB's real, pre-existing state.
- Names exactly `tally_voucher_item` (the one genuine gap — that table doesn't exist yet in this
  dev DB; Step 6A's own BUILD-LOG entry already flagged this as KG-8, unrelated to this step) —
  not a false positive on any of the other 34 tables, which are all genuinely fine.

**4. Full `ask()` orchestration — 7/7 passed** (`test-copilot-ask-flow.js`, real compiled service
+ real Postgres, only the two literal Gemini network calls monkey-patched at that exact boundary):
- `moduleReady=false`: friendly "temporarily unavailable" message, `sql: null`, logged with no
  SQL attempted.
- Stacked-query injection returned by (stubbed) `generateSql`: rejected by the real validator,
  friendly "couldn't safely answer" message, `sql: null` in the response, but the actual rejected
  SQL + real reason ("Multiple statements detected...") logged server-side in `CopilotQueryLog`.
- Full success path: real SQL executed through the real RLS-scoped `executeScoped`, correct
  `rowCount`/answer logged, `sql` in the response includes the appended `LIMIT 500`.
- A nonexistent factory id inside the full `ask()` flow (not just the isolated executeScoped
  test) still yields zero rows via RLS — fail-closed holds mid-orchestration too.
- One expected/harmless side-effect: this test's own artificial nonexistent-factory-id case
  caused `logAttempt()`'s own `CopilotQueryLog.create()` to hit a real FK constraint violation
  (that factory id doesn't exist) — the code caught it internally exactly as designed (logged,
  did not crash the request, still returned the correct answer to the caller). Not a bug; flagged
  here because it also incidentally proves `logAttempt`'s own try/catch actually works.

**5. Build/typecheck** — `tsc --noEmit` clean in both packages; `npm run build` clean in both
packages (backend `nest build`, frontend `next build` including its own TypeScript pass).

**6. Frontend smoke check** — dev server (`npm run dev` on port 3010) boots; navigating to
`/copilot` unauthenticated correctly redirects to Clerk sign-in with zero console errors. Did NOT
attempt a live authenticated walkthrough of the actual chat UI — that would require entering real
Clerk credentials for the Owner's account, which is out of scope for an automated build step
(and prohibited outright for password entry). The gate logic itself (`role !== "owner"` → same
placeholder pattern as every other owner-gated page) is a straightforward reuse of an
already-proven pattern elsewhere in this codebase.

## Not Verified — Gemini calls themselves

**No Gemini API key exists anywhere in this environment** — checked before this step started
(per the brief), same conclusion holds now. `generateSql()` and `formatAnswer()` are implemented
correctly against the official `@google/generative-ai` SDK (model selection, system instructions,
prompt construction, response text extraction, defensive markdown-fence stripping) but were
**never actually invoked against Gemini's API**. Everything downstream of those two calls
(validation, execution, formatting, logging) was live-verified as described above by
monkey-patching only those two calls in the integration test — the real orchestration code around
them is proven, the two literal network calls are not.

## Schema context — tables included/excluded (judgment call, per the brief's explicit request to flag it)

Included 31 of the 35 `stoneos_copilot_ro`/RLS-protected tables. Excluded exactly the 4 the brief
itself gave as safe-to-exclude examples:
- `raw_block_photo`, `slab_photo` — URL-only tables, no business content.
- `block_state_transition`, `slab_state_transition` — internal append-only audit logs of state
  changes, not something a business question would target directly (the business-meaning
  content of block/slab lifecycle — e.g. damaged vs. good slab counts — is already carried by
  `cutting_session`/`slab` themselves).

Everything else is included: production (`cutting_session`, `cutting_day_log`,
`polishing_session`, `polishing_session_slab`, `machine`, `machine_runtime_log`,
`daily_production_report`), inventory (`raw_block`, `slab`, `block_reconciliation`,
`inventory_snapshot`, `consumable`, `consumable_purchase`, `consumable_usage_log`), sales
(`sales_order`, `sales_line_item`, `invoice`, `payment`, `daily_sales_summary`, `customer`),
expenses (`expense`, `expense_allocation`, `vehicle`), staff (`app_user`), utilities
(`utility_reading`), and Tally import (`tally_import_batch`, `tally_ledger_entry`,
`tally_voucher_item`, `tally_trial_balance_snapshot`) — nothing a real business question could
plausibly need was left out.

Business-meaning notes carried into the prompt: `raw_block`'s RECOVERY RATIO rule (105 sqft/ton
benchmark, must use `sales_line_item.quantity` not `slab.length_ft`/`width_ft`), `slab`'s
PROVISIONAL-ONLY note on `length_ft`/`width_ft`, `slab.quality_note`'s always-sellable-after-
polish rule, `cutting_session.damaged_slab_count`'s cost-allocation note, the SIMPLIFIED
slab-registration flow (found in `README.md`, not `schema.prisma` — the brief referenced this
note without specifying which file; confirmed by search this is where it actually lives), and a
caveat on `payment.invoice_id` nullability (from Step 6A's migration comment, so Gemini doesn't
silently under-count payments joined through invoice).

## Open Questions / Decisions Flagged for Review

1. **Migration generated via schema-diff instead of `prisma migrate dev`.** `_prisma_migrations`
   in the live dev DB only has 3 applied rows; both `20260712000000_tally_voucher_item` and
   `20260713000000_copilot_rls_readonly_role` exist as folders but aren't tracked as applied
   (confirmed: `tally_voucher_item` genuinely doesn't exist in the DB; `stoneos_copilot_ro` and
   34/35 RLS policies do exist, applied by hand per Step 6A's own log). Running `prisma migrate
   dev` would try to replay that pending/drifted history, including `CREATE ROLE
   stoneos_copilot_ro` a second time, which would fail. Used `prisma migrate diff
   --from-schema-datamodel --to-schema-datamodel --script` instead — a pure two-schema-file diff
   that never touches the DB or the drifted history — to generate the exact same SQL Prisma would
   have produced, then applied it directly via `psql`, same as Step 6A's own precedent. Flagging
   this because it's a deviation from the brief's literal suggestion of `prisma migrate dev`,
   even though the brief itself offered "the migrate diff fallback pattern used in prior steps"
   as an explicit alternative.
2. **A stale/pre-existing `node` process was already listening on port 4000** before this step
   started (not started by this build), returning 404 for `/copilot/ask` — meaning it predates
   this step's code. Left it untouched (not part of this step's scope to investigate/restart);
   all backend verification instead went through direct Node scripts against the real compiled
   code and real Postgres, which is a stronger verification of the actual logic than an HTTP
   round-trip would have been anyway, but means there's no live curl-level `POST /copilot/ask`
   HTTP transcript in this review. Worth a restart of the backend dev server before/during review
   if an HTTP-level check is wanted.
3. **`payment.invoice_id` nullability gap** (Step 6A's own flagged item, KG-3) means a payment
   with no invoice can never appear in Copilot query results scoped through `invoice` — carried
   forward as a caveat in the schema context sent to Gemini, not fixed (fixing it isn't in scope
   for this step and would require inventing a `factory_id` source on `payment` that doesn't
   exist today).
4. **`tally_voucher_item` missing from this dev DB** (Step 6A's KG-8) means the readiness check
   will correctly report the Copilot module as NOT READY in this exact environment until that
   table is created — this is proven-correct behavior of the coverage check, not a bug in this
   step, but it does mean `/copilot/ask` will return "temporarily unavailable" against this
   specific dev DB as-is. Not fixing it here — out of scope, and the brief was explicit that
   containing KG-8's blast radius to just this feature (rather than fixing the root cause) was
   the goal.

## Definition of Done — self-check

- [x] `CopilotQueryLog` model + migration (normal Prisma migration, no RLS)
- [x] `POST /copilot/ask`, `@Roles("owner")` only, full flow generate → validate → execute →
      format → log, every path logged
- [x] SQL validation rejects multi-statement/non-SELECT/write-DDL-keyword SQL, friendly error to
      user, real reason logged server-side only
- [x] Startup RLS-coverage assertion — fails only the Copilot module's readiness, not the whole app
- [x] Frontend chat page at `/copilot`, owner-only, shows generated SQL per answer, linked from
      `AppNav.tsx`
- [x] `tsc --noEmit` clean, `npm run build` clean, both packages
- [x] This review request states Gemini calls are implemented but not live-tested, and states
      exactly which tables were included/excluded from the schema context
- [x] `handoff/REVIEW-REQUEST.md` written
