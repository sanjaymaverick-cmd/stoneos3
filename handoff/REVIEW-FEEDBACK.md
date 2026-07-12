# Review Feedback — Step 5A (Recovery ratio report)
Date: 2026-07-12
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- `packages/frontend/app/reports/recovery-ratio/page.tsx:79` — Empty-state message uses an
  inline style block (`color: #857c6c`, `font-family: IBM Plex Mono, monospace`) instead of a
  shared CSS class, because no `.empty-state` class exists in `globals.css` yet. Bob flagged
  this himself in REVIEW-REQUEST.md. Not worth blocking on — the colors/fonts are correctly
  reused, it's just duplicated inline rather than extracted. If a second report page needs an
  empty state, extract a `.empty-state` class then; not worth doing solely for this one page.
  Log to BUILD-LOG if not addressed now.

## Escalate to Architect
- Route path naming — Bob used `/reports/recovery-ratio` (frontend) taken from the brief's own
  "e.g." example, nested under a `/reports/` namespace that has no other precedent in this
  codebase (every other page — `/sales`, `/expenses`, `/dpr`, `/polishing` — is flat). Low-risk
  either way and a one-line change if Arch wants it flattened to `/recovery-ratio` for
  consistency, but this is a navigation/IA convention decision, not something I should decide at
  the code level. Bob already flagged this in REVIEW-REQUEST.md's Open Questions.

## Cleared — independent verification performed

**(a) Route ordering** — Read `raw-block.controller.ts` directly (not just Bob's summary).
`@Get("recovery-ratio")` is declared at line 20, `@Get(":id")` at line 25 — the specific route
is genuinely first in declaration order, so Nest will match it before falling through to the
`:id` handler. Confirmed via `git diff` that this is a pure insertion between the existing
`@Get()` and `@Get(":id")` — nothing about the existing `:id` route was altered.

**(b) Multi-tenant scoping** — `findRecoveryRatios(factoryId)` calls
`this.prisma.rawBlock.findMany({ where: { factoryId }, ... })` — same scoping shape as the
existing `findAll`/`findOne`. The controller passes `user.factoryId` (from `@CurrentUser()`),
never a client-supplied id. `slabs`/`salesLines` are pulled via Prisma `include` off the
already-`factoryId`-filtered `RawBlock` rows (relation traversal via `parentBlockId`/`slabId`
FKs, not a second independent query), so there is no path for another factory's slabs or sales
lines to enter the result. Confirmed `RawBlock.slabs` in `schema.prisma` (line 293) is the
correct inverse of `Slab.parentBlockId` (line 331-332), and `Slab.salesLines` (line 366) is the
correct inverse of `SalesLineItem.slabId` (line 552-553). No global/unscoped query anywhere in
the new code.

**(c) Null-handling correctness** — Hand-verified the logic in `computeRecoveryRatio`
(`raw-block.service.ts:128-145`):
- `recoveryRatio = weightTons != null && weightTons > 0 && soldSqft > 0 ? soldSqft / weightTons : null`
  — correctly `null` (not `0`/`NaN`) when `weightTons` is null, when `weightTons` is `0`, and
  when `soldSqft` is `0`. No division-by-zero path exists.
- `belowBenchmark = recoveryRatio != null ? recoveryRatio < benchmark : null` — correctly `null`
  exactly when `recoveryRatio` is `null`, never `false` as a stand-in.
- `soldSqft = block.slabs.reduce((sum, slab) => sum + slab.salesLines.reduce((s, line) => s +
  Number(line.quantity), 0), 0)` — this is a nested reduce across *every* slab on the block and
  *every* sales line on each slab, not just the first slab or first line. Confirmed against
  schema: `SalesLineItem.slabId` is nullable (`schema.prisma:552`), and because the query
  navigates `block → slabs → salesLines` (the inverse relation), a `SalesLineItem` with a null
  `slabId` is structurally unreachable from this path and correctly never contributes — matches
  the brief's "handle gracefully" instruction without needing an explicit filter.

**(d) `GET /raw-blocks/:id` / `computeDamagedSlabLoss` untouched** — `git diff HEAD --
raw-block.service.ts raw-block.controller.ts` shows a purely additive diff: the new
`findRecoveryRatios`/`computeRecoveryRatio` block and the new controller route are pure
insertions. `findOne` (service) and `computeDamagedSlabLoss` are byte-for-byte identical to
before.

**(e) `schema.prisma` untouched** — Not present in `git status`/`git diff` output for this
worktree; confirmed no schema or migration changes.

**Build verification (independently run, not just trusting Bob's claim):**
- Backend: `npx prisma generate` (required once, fresh worktree, matches Bob's note) →
  `npx tsc --noEmit` clean, `npm run build` (`nest build`) clean, no errors.
- Frontend: `npx tsc --noEmit` clean, `npm run build` clean — `✓ Compiled successfully`, all 11
  routes generated including `/reports/recovery-ratio` at `1.71 kB, 148 kB First Load JS`,
  matching Bob's reported numbers exactly.

**Other checks:**
- `AppNav.tsx` diff is exactly the one line described (`{ href: "/reports/recovery-ratio",
  label: "Recovery Ratio" }` appended to the unconditional `LINKS` array) — no role-gating
  added or removed elsewhere.
- Frontend page follows the established `apiFetch(path, token)` / `safeGetToken(getToken)`
  pattern from `lib/api.ts` correctly; no new fetch library introduced.
- Badge classes `.badge.invoiced`, `.badge.cash`, `.badge.mixed` all exist in `globals.css`
  (lines 126-128) with the colors Bob described (moss/rust/brass) — no new CSS introduced.
- `BUILD-LOG.md` was updated with a Step 5A entry consistent with REVIEW-REQUEST.md; the
  existing `Known Gaps` section was not touched.
- No drift found — nothing was added beyond what the brief asked for (no date-range filtering,
  no charting library, no extra routes).

---

# Review Feedback — Step 5B — Per-slab dimension overrides
Date: 2026-07-12
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- `packages/backend/src/modules/production/cutting-session.service.ts:143-154` — `slabOverrides[i].sequence`
  is validated (integer, range, uniqueness), but `lengthFt`/`widthFt`/`thicknessMm` inside each override
  are never type/range-checked (no rejection of negative, NaN-producing, or non-numeric values before
  they reach `tx.slab.create`). This is not a regression — the pre-existing session-level
  `input.lengthFt`/`widthFt`/`thicknessMm` have the identical gap, and this file has no class-validator
  anywhere — but the override array multiplies the number of attacker/typo-controlled numeric fields per
  request (up to `finalGoodSlabCount` sets instead of one). Not blocking; log to BUILD-LOG as a
  pre-existing pattern this step extends, worth a project-wide pass later.

## Escalate to Architect
None.

## Cleared

**Files reviewed:** `packages/backend/src/modules/production/cutting-session.service.ts` (full diff vs.
`HEAD~1`) and `packages/frontend/app/dpr/page.tsx` (full diff vs. `HEAD~1`), plus confirmation that
`packages/backend/prisma/schema.prisma` has zero diff and that no files outside the two listed were
touched (`git status` / `git diff --stat` against `HEAD~1`).

**Default-path-unchanged claim — independently confirmed, not just trusted.** Hand-traced the actual
diff hunk (not Bob's paraphrase of it):
- Before: `lengthFt: input.lengthFt, widthFt: input.widthFt, thicknessMm: input.thicknessMm ?? 18.0`
- After: `lengthFt: override?.lengthFt ?? input.lengthFt, widthFt: override?.widthFt ?? input.widthFt,
  thicknessMm: override?.thicknessMm ?? input.thicknessMm ?? 18.0`, with `override = overridesBySeq.get(seq)`.

When `input.slabOverrides` is absent/empty, `overridesBySeq` is built as an empty `Map` (guarded by
`if (input.slabOverrides && input.slabOverrides.length > 0)` at line 141), so `override` is `undefined`
for every `seq` in the loop. `undefined?.lengthFt` short-circuits to `undefined` via optional chaining
on the `override` variable itself (not a property access on a defined object), so `undefined ?? input.lengthFt`
evaluates to exactly `input.lengthFt` — same for `widthFt`. For `thicknessMm`, the chain collapses to
exactly `input.thicknessMm ?? 18.0`, the same two-step fallback as before. Confirmed byte-identical to
the pre-change code for the default path.

**Validation runs before `$transaction` opens.** The `overridesBySeq` construction and both
`BadRequestException` throws (lines 140-155) execute before `this.prisma.$transaction(...)` is called
(line 167). The only work between validation and the transaction is two read-only calls
(`findFirstOrThrow`, status check) — no writes occur before or after validation failure, so a bad
request cannot leave partial writes.

**Sequence validation edge cases — all correctly rejected, traced by hand against the actual code:**
- `sequence: 0` — fails `override.sequence < 1` → 400.
- `sequence: finalGoodSlabCount + 1` — fails `override.sequence > input.finalGoodSlabCount` → 400.
- `sequence: 3.5` (non-integer) — fails `!Number.isInteger(override.sequence)` → 400.
- `sequence: NaN` / `Infinity` — `Number.isInteger` returns `false` for both → 400.
- Duplicate `sequence` (e.g. two entries with `sequence: 3`) — second occurrence hits
  `seenSequences.has(override.sequence)` → 400, thrown before the first is ever added to `overridesBySeq`
  in a way that would mask the duplicate.

**Frontend toggle defaults off and sends no `slabOverrides` key on the default path.**
`slabOverridesEnabled` initializes as `{}`, so `slabOverridesEnabled[s.id]` is `undefined` and
`!!undefined` renders the checkbox unchecked. In `submitCompletion` (page.tsx:167),
`overrides = slabOverridesEnabled[sessionId] ? buildSlabOverrides(...) : []`, and the request body
spreads `...(overrides.length > 0 ? { slabOverrides: overrides } : {})` (line 177) — when off, `overrides`
is `[]`, so the spread contributes nothing and `slabOverrides` is genuinely absent from the JSON body,
not sent as `[]`. Checked whether that distinction matters to the backend: it does not — the backend's
guard at line 141 is `if (input.slabOverrides && input.slabOverrides.length > 0)`, which treats
`undefined` and `[]` identically (both skip straight to an empty `Map`). No discrepancy either way.

**No `schema.prisma` changes** — confirmed via `git diff HEAD~1 -- packages/backend/prisma/schema.prisma`,
zero output.

**No scope drift** — `git status`/`git diff --stat` against `HEAD~1` show only
`cutting-session.service.ts`, `dpr/page.tsx`, and the three `handoff/*.md` files changed. No touch to
`raw-block.service.ts`, `computeDamagedSlabLoss`, or anything sales/expense-related, matching the brief's
explicit flag. The frontend diff is purely additive (new state, new helper functions, new JSX block) —
none of the pre-existing dimension-input JSX or the pre-existing request-body fields
(`totalSlabsCut`/`finalGoodSlabCount`/`lengthFt`/`widthFt`/`thicknessMm`/`wastageNotes`) were touched.

**Mixed-size path traced by hand** (finalGoodSlabCount=5, override `{sequence:3, lengthFt:7.5}`): seq 3
resolves to `lengthFt: 7.5` (from override) with `widthFt`/`thicknessMm` falling through to session
defaults (override's fields are `undefined` for those two); seq 1,2,4,5 all get pure session defaults via
the empty-lookup path. Matches spec.

**`buildSlabOverrides` (frontend) diff-only-payload logic verified**: a row whose parsed value equals the
parsed session default (whether because it was never touched, or because the supervisor typed the same
value back) is excluded field-by-field; an entry is only pushed when at least one field's parsed value
differs from the corresponding session default. `row-card`/`row-grid` CSS classes exist in `globals.css`
(reused from the existing `sales/page.tsx` pattern, no new design system introduced).

**Independent build verification** — ran directly in this worktree, not taken from Bob's report:
- `npx tsc --noEmit` in `packages/backend` — clean, zero output.
- `npx tsc --noEmit` in `packages/frontend` — clean, zero output.
- `npm run build` in `packages/backend` (`nest build`) — clean, zero output.
- `npm run build` in `packages/frontend` (`next build`) — compiled successfully, own lint/type pass
  passed, all 10 routes generated including `/dpr` at exactly 5.14 kB / 151 kB First Load JS — matches
  Bob's reported numbers exactly.

One sentence: reviewed the full backend/frontend diffs against `HEAD~1`, independently re-derived (not
just trusted) the default-path-identical claim and all validation edge cases by hand-tracing the actual
code, confirmed no schema changes and no scope drift, and independently reproduced clean `tsc`/build
results in both packages — step is clear to ship, with one non-blocking Should Fix logged for later.


---

# Review Feedback — Step 5C: Item-level Tally detail
Date: 2026-07-12
Ready for Builder: YES

---

## Must Fix
None.

---

## Should Fix

- `packages/backend/prisma/migrations/20260712000000_tally_voucher_item/migration.sql` — Bob
  hand-wrote this because "no reachable `DATABASE_URL` exists in this worktree." I tested that
  claim: `npx prisma migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma
  --script` runs to completion in this same DB-less worktree with **no DATABASE_URL and no live
  Postgres connection at all** — it's a pure schema-to-SQL compile, not a live diff. I ran it and
  extracted the `tally_voucher_item` `CREATE TABLE`/`AddForeignKey` section from the output; it is
  byte-for-byte identical to Bob's hand-written file (same column order, same types, same FK
  clause, same `-- CreateTable`/`-- AddForeignKey` comment lines). So the migration content is
  correct — verified, not just trusted. But the *reasoning* in REVIEW-REQUEST.md ("no DB, so must
  hand-write") is not accurate, and hand-transcription is a strictly more failure-prone path than
  running the tool, even when no live DB is reachable. Recommendation: log to BUILD-LOG that
  `migrate diff --from-empty --to-schema-datamodel --script` is available and should be the
  first-choice fallback (not hand-writing) whenever `--from-url` isn't available in a future
  worktree with no DB access. (Note: it produces the full-schema DDL from scratch, not an
  incremental diff against migration history — `--from-migrations` would give the incremental
  form but requires `--shadow-database-url`, which does need a DB — so for a DB-less worktree,
  `--from-empty` + manually isolating the new table's section, as I did here, is the right
  pattern.) Not blocking — the SQL itself is confirmed correct this time.

- `TallyImportController.itemCrossCheck` / `TallyImportService.itemCrossCheck`
  (`tally-import.controller.ts:31-35`, `tally-import.service.ts:273-303`) — `from`/`to` are
  checked only for presence (`!from || !to`), not for being parseable dates. A malformed value
  (e.g. `?from=banana&to=2026-07-01`) produces `new Date("banana")` → `Invalid Date`, which will
  reach the Prisma query and most likely surface as an unhandled 500 rather than a clean
  `BadRequestException`. Low severity given this is an internal diagnostic endpoint the brief says
  is fine to hit via curl/Postman, not a user-facing flow, but worth a one-line `isNaN` guard if
  Bob touches this file again.

---

## Escalate to Architect

- **Sales-voucher-type filter specificity** (Bob's open question 3, `tally-import.service.ts:281`)
  — `voucherType: { equals: "Sales", mode: "insensitive" }` may not match a real Tally
  installation's actual voucher-type strings (e.g. "Sales - Local", "Sales - GST"). Bob flagged
  this transparently and I can't resolve it either without a real export — genuine product/data
  decision, not a code defect. Recommend leaving as `equals` until the Owner's manual real-data
  verification pass reports the actual `voucherType` strings, rather than guessing at `contains`
  now (a `contains` guess is no more grounded than `equals`).

- **Quantity field precedence** (Bob's open question 4, `parseTallyQuantity(inv?.ACTUALQTY ??
  inv?.BILLEDQTY)`, `tally-import.service.ts:144`) — `ACTUALQTY` preferred over `BILLEDQTY` is an
  unverified assumption about which field this Tally installation populates. Same category as
  above: needs the Owner's real-export verification pass, not a reviewer-level code decision.

Both of these are already flagged clearly and prominently by Bob in REVIEW-REQUEST.md and
BUILD-LOG.md — escalating for Arch/Owner awareness, not because Bob hid or softened them.

---

## Independent verification performed (per review brief's scrutiny points)

**(a) Hand-written migration vs. `tally_ledger_entry` precedent** — confirmed. Column order,
`DATE`/`DECIMAL(12,2)`/`DECIMAL(14,2)` types, and `ON DELETE RESTRICT ON UPDATE CASCADE` FK style
all match `20260709122654_init/migration.sql`'s `tally_ledger_entry` table exactly. Beyond that, I
independently regenerated the DDL via `prisma migrate diff --from-empty --to-schema-datamodel
--script` (confirmed this runs without any DB connection) and diffed it against Bob's file byte
for byte — identical. See Should Fix above for the one process note (the "no DB" justification for
hand-writing wasn't quite right, even though the output happened to be correct).

**(b) `parseDaybook` return-shape change and zero-regression claim** — confirmed by hand via
`git diff` on `tally-import.service.ts`, not by trusting Bob's summary. Grepped the full repo for
`parseDaybook` callers: exactly one (`TallyImportService.importDaybook`), and it was updated to
destructure `{ lines, items }`. Read the diff directly: the existing `for (const le of allEntries)
{ ... lines.push({...}) }` block (now at lines 122-135) has **zero changed lines** — every field
(`voucherType`, `entryDate`, `account`, `debit`, `credit`, `narration`) and the debit/credit sign
logic are untouched. All new code (the `items` array, the `parseTallyQuantity` helper, the second
`for (const inv of inventoryEntries)` loop) is additive, appended after the existing loop closes.
The only change to the existing loop's surroundings is the wrapper return statement (`return
lines` → `return { lines, items }`). Ledger-line output is genuinely byte-for-byte unchanged, not
"probably fine."

**Multi-tenant scoping** — confirmed. `TallyImportController` has class-level
`@UseGuards(ClerkAuthGuard)` (covers the new endpoint too), and `itemCrossCheck` scopes both
queries by the caller's `factoryId`: `tallyVoucherItem.aggregate({ where: { batch: { factoryId },
... } })` and `salesLineItem.aggregate({ where: { salesOrder: { factoryId, ... } } })`. The direct
`SalesOrder.factoryId` scoping matches the existing pattern in `sales-order.service.ts`
(`findAll`/`findOne` both filter `where: { factoryId }` directly) — Bob's deviation from the
brief's suggested customer/factory relation path is a reasonable simplification, not a scoping
gap.

**Real-data-not-verified disclosure** — confirmed clearly and prominently stated, not buried.
REVIEW-REQUEST.md leads with a dedicated "Important upfront: real-data verification is NOT done"
section before the file-by-file changes. BUILD-LOG.md repeats it in its own "Verification"
subsection with the same explicit wording. Both also enumerate exactly which Tally tag names are
inferred vs. verified, per the brief's explicit ask.

**Build verification** — ran independently, not trusted from Bob's claim:
- `npx tsc --noEmit` in `packages/backend` — clean, exit code 0.
- `npm run build` (`nest build`) in `packages/backend` — clean, no errors/warnings.
- `npx prisma generate` — clean; confirmed `TallyVoucherItem`/`tallyVoucherItem` compiles
  correctly against the generated client (implicit in the clean `tsc` pass, which uses the new
  model in `tally-import.service.ts`).

**Scope/drift check** — `git diff --stat` shows exactly the files Bob's REVIEW-REQUEST.md lists
(`schema.prisma`, `tally-import.controller.ts`, `tally-import.service.ts`, the new migration, plus
the two handoff docs) — no undisclosed files touched, no frontend changes despite the frontend
`npm run build` having been run as an extra check.

## Cleared

Schema addition, hand-written migration DDL (independently re-verified byte-for-byte against a
tool-generated equivalent), parser extension and its zero-regression claim on existing ledger-line
output, transactional storage of both ledger entries and voucher items, and the
`item-cross-check` endpoint's multi-tenant scoping were all reviewed and passed; `tsc --noEmit`
and `npm run build` were independently re-run and are clean.

---
# Step 4 (Round 2)
*Preserved below for the full trail.*

---

## Must Fix
*None.*

## Should Fix

- `packages/frontend/app/dashboard/page.tsx:80-81` (`OwnerDashboard`'s `load()`) — the
  Round 1 Must Fix is genuinely fixed for the path it targeted (the `Promise.all` of 5
  `apiFetch` calls and the aggregation after it: verified the `try` now opens at `:82`, wraps
  through `:130`, and `setLoaded(true)` moved into a real `finally` at `:136-138` that runs
  regardless of what happens in `try`/`catch` — this is strictly more robust than
  `admin/users/page.tsx`'s bare "`setLoaded(true)` after the `try`/`catch`" precedent, since a
  `finally` also covers a `return`/throw from inside `catch`, which the precedent doesn't need
  to but Bob's version handles anyway). Confirmed live: re-ran `npx tsc --noEmit` and
  `npm run build` independently — both clean, `/dashboard` at 3.73 kB / 150 kB First Load JS,
  matching Bob's numbers exactly, not just taking them on faith. Also independently confirmed
  `main.ts:6` does default `FRONTEND_URL` to `http://localhost:3000`, corroborating the
  CORS-triggered "Couldn't load dashboard data: Failed to fetch" live-browser finding Bob
  reported — that really is the escalated port issue surfacing, not a new bug.

  But one line above the fix is still exposed to the identical symptom: `const token = await
  safeGetToken(getToken); if (!token) return;` sits *before* the `try`, not inside it. `lib/
  api.ts:9-16`'s `safeGetToken` swallows `ClerkOfflineError` into a `null` return (explicitly
  documented there as "callers... treat a null token as 'skip this load'") but re-throws
  anything else. Either path — a caught-offline `null` token, or an uncaught non-offline
  `getToken()` error — hits `return`/an unhandled rejection *before* `:136`'s `finally` ever
  runs, so `loaded` stays `false` forever: the exact "stuck on Loading… permanently, no
  explanation" failure Round 1 flagged, just reachable now only via the auth step instead of
  the 5 data fetches. This is not a new regression Bob introduced — `admin/users/page.tsx:26-
  28`'s `loadUsers` (the pattern Round 1 explicitly told Bob to match) has the identical
  structure, and Round 1 didn't scope the token line into the Must Fix, so Bob matched exactly
  what was asked. Not blocking this round for that reason. But going offline mid-load is a real
  scenario (laptop sleep/wake, a spotty factory-floor connection), not a hypothetical, and it
  reproduces the very failure mode this step exists to close off — worth closing now while
  this code is already open, or logging to `BUILD-LOG.md` as a deferred follow-up (applies
  equally to `loadUsers`). Fix is small: move `setLoaded(true)` into a `finally` that wraps the
  token fetch too, or add `if (!token) { setLoaded(true); return; }`.

## Escalate to Architect
*None new this round.* `.claude/launch.json`'s port change (3000 → 3010) — confirmed via `git
diff` it is byte-identical to Round 1's version, untouched this round, correctly left alone
per instruction. Round 1's escalation to the Owner stands, still open.

## Cleared

Re-verified both Round 1 items directly against the current code, not just Bob's summary:

- **Must Fix (try/catch/finally around the 5-call `Promise.all`)** — structurally correct as
  described above; the render branch order (`:155-161`) is `!loaded` → "Loading…" → `errorMsg`
  → real widgets, so the error ticket only ever shows after the loading gate clears, and
  `errorMsg` is reset to `""` on a successful run (`:130`) so a stale error can't survive a
  future successful reload of the same mounted instance.
- **Should Fix (loading state while Clerk resolves)** — `Dashboard` (`:24-29`) now reads
  `isLoaded` via `useUser()` and renders the new `LoadingDashboard` (`:35-48`) instead of
  falling through to `useRole()`'s `undefined` → `PlaceholderDashboard` branch. `useRole.ts` is
  confirmed untouched (no diff) and its contract (role string, or `undefined` while loading)
  still matches the brief exactly — the fix lives entirely in `dashboard/page.tsx` as claimed.
  `LoadingDashboard` reuses only pre-existing CSS classes (`app-shell`, `stamp*`, `ticket*`) —
  no new `globals.css` hunk was needed or added this round, confirmed via `git diff
  packages/frontend/app/globals.css` showing only Round 1's addition, nothing new.
- Both fixes compile and build clean (independently re-run, see above), and the live-browser
  CORS finding is internally consistent with `main.ts:6`.

One Should Fix above (the token-fetch line still exposed to the same hang class) — not
blocking, recommend closing it now or logging it, since it's a 1-2 line fix and directly
relevant to the bug class this step exists to eliminate. Step 4 is otherwise clear.

---

# Round 1
*Preserved below for the full trail.*

---

## Must Fix
*Blocks the step. Bob fixes before anything moves forward.*

- `packages/frontend/app/dashboard/page.tsx:57-109` (`OwnerDashboard`'s `load()`) — no
  `try`/`catch` around the `Promise.all` of 5 `apiFetch` calls or the aggregation that follows,
  and `setLoaded(true)` (`:108`) only executes if every step above it succeeds. `apiFetch`
  (`lib/api.ts:27-30`) throws on any non-2xx response. If even one of the 5 endpoints returns a
  transient error (a cold-start 500, a momentary 401 if the token is near expiry, a 429, a
  network blip), the whole `load()` throws, `loaded` stays `false` forever, and the Owner's
  dashboard is stuck on "Loading…" (`:126`) permanently — no error message, no retry, no way to
  tell what happened. This is the page a user checks first to gauge business health; silently
  hanging there is worse than either of the codebase's two existing precedents for this exact
  situation: `admin/users/page.tsx:26-37` (`loadUsers`) wraps its fetch in `try`/`catch` and
  calls `setLoaded(true)` unconditionally afterward specifically so a failed fetch still resolves
  the loading gate; `sales/page.tsx` and `expenses/page.tsx` also skip `try`/`catch` but don't
  use a `loaded`-gated "Loading…" screen at all, so a failure there just leaves lists empty
  rather than showing a permanent spinner. `dashboard/page.tsx` combined a `loaded` gate (which
  needs the safety net) with the fetch pattern that doesn't have one. Fix: wrap the body of
  `load()` (from the `Promise.all` through the last `set*` call) in `try`/`catch`, and move
  `setLoaded(true)` so it always runs — matching `admin/users/page.tsx`'s established pattern.
  A caught error should at minimum log/surface something rather than leaving `loaded` at
  `false` with no explanation.

## Should Fix

- `packages/frontend/lib/useRole.ts:9-12` / `dashboard/page.tsx:24-27` — Bob's own Open
  Question #1 is legitimate and I agree it's not a Must Fix: because `useRole()` returns
  `undefined` while `!isLoaded` and `Dashboard` treats `undefined` identically to "not
  owner/admin," a signed-in owner sees the placeholder message flash for one render before the
  real dashboard appears. This matches the brief's literal hook contract, so it's not a bug
  against spec — but it is a real, slightly janky first impression for the one role this whole
  step was built for. Worth a dedicated "loading" branch in a follow-up rather than reusing the
  placeholder for two different meanings ("not your dashboard" vs. "we don't know yet"). Log to
  `handoff/BUILD-LOG.md` as a deferred follow-up if not picked up now.

## Escalate to Architect

- `.claude/launch.json` port change (3000 → 3010), flagged by Bob in Open Question #2 — not a
  code correctness issue, but a dev-environment workflow question only the Owner can answer:
  does the Owner's normal local workflow expect this frontend on port 3000? If so, the other
  process ("STONEOS CONTROL ROOM") needs to move, not this one, and that's outside Bob's
  authority to decide unilaterally. Bob's investigation before touching it (curling the
  conflicting process, reading its rendered page to confirm it's a different app, not a stale
  instance of this one) was the right level of care — no concern with the diagnosis, only with
  who gets to decide the resolution.

## Cleared

Reviewed the 4 files Bob listed (`useRole.ts` in full; `dashboard/page.tsx` in full — it's a
full-file rewrite at 246 lines; `globals.css:151-186`; `.claude/launch.json` in full) plus the
Step 4 section of `handoff/ARCHITECT-BRIEF.md` (brief text only, not the wider spec) to check
spec compliance:

- **Scope discipline** — `git diff --stat` against `HEAD` shows exactly the files Bob claimed
  and nothing else (`.claude/launch.json`, `handoff/*.md`, `dashboard/page.tsx`, `globals.css`,
  new `useRole.ts`); no backend files touched, no drift into other frontend pages. The
  `globals.css` diff is a single contiguous hunk at the claimed location, nothing scattered
  elsewhere in the file.
- **Field-name verification against schema** — spot-checked the claim that Bob verified real
  shapes rather than assuming them: `totalQtySqft`/`invoicedAmount`/`actualAmountReceived`
  (`schema.prisma:576-578`, `DailySalesSummary`), `currentStatus`/`serialNumber`/`varietyName`
  (`schema.prisma:258-267`, `RawBlock`), `rawBlockId`/`rawBlock`/`startedAt`
  (`schema.prisma:133-139`, `CuttingSession`), `orderDate`/`customer`
  (`schema.prisma:536-538`, `SalesOrder`) all match what's read in `dashboard/page.tsx`.
  `cutting-session.service.ts:49-54`'s `findActive` confirms it already filters
  `status: "in_progress"` and includes `rawBlock`, matching widget 3's assumptions exactly —
  Bob didn't need to (and didn't) re-filter or guess at the relation.
- **CSS additions** — every class referenced in the new JSX (`stat-row`, `stat-card`,
  `stat-number`, `stat-label`, `mini-bar-list/row/label/track/fill/value`, `session-grid/card/
  serial/variety/days`, `recent-columns/col-title`, `empty-note`, `dashboard-fade-in`) is
  defined in the `globals.css:151-186` addition; `list-table` and `.mono` (also used in the new
  JSX) are pre-existing classes, not new. The `#857c6c` literal used repeatedly in the new CSS
  is the same literal already used 4 other places in the file (`:71,76,107,121`) — "no new
  colors" checks out, not just asserted. `Ticket`'s `accent` prop (`components/Ticket.tsx:8`)
  accepts exactly `"brass" | "moss" | "rust"`, matching all 5 call sites.
- **Backend authorization (pre-existing, not this step's scope)** — confirmed all 5 endpoints
  the dashboard calls (`raw-blocks`, `cutting-sessions`, `expenses`, `daily-sales-summary`,
  `sales-orders`) carry `@UseGuards(ClerkAuthGuard[, RolesGuard])` at the controller level, so
  this step doesn't newly expose anything unauthenticated. Role-gating on this data is
  UI-only (any authenticated factory user could already call these endpoints directly
  regardless of role) — that's a pre-existing condition across the whole app, not introduced or
  worsened by this diff, so not raised as a finding against Step 4 specifically.
- **`npx tsc --noEmit -p packages/frontend`** — re-ran independently, clean. Matches Bob's
  claim, not just taken on faith.
- **`scratchpad/verify-dashboard-widgets.js`** — confirmed the file exists as claimed (not
  committed, as expected); did not re-run it since its logged output in
  `handoff/BUILD-LOG.md`'s Step 4 entry is detailed enough to cross-check against the schema
  work above and against `SESSION-CHECKPOINT.md`'s documented empty states.
- **No credential entry** — Bob's refusal to sign in through Clerk for a live browser check is
  correct per the hard-prohibited-action rule; the alternative verification (signed-out gate +
  read-only DB script) is a reasonable substitute given the constraint.

Everything else — widget field mappings, empty-state handling, `Ticket`/`AppNav` reuse, the
`PlaceholderDashboard` extraction being verbatim — checks out against the brief. One Must Fix
above blocks the step; fix it and this is ready to re-review as a small, targeted diff.

---

# Step 3
*Preserved below for the full trail.*

---

## Must Fix
*None.*

## Should Fix

- `raw-block.service.ts:99-101` — `reportedSessions` is filtered on `totalSlabsCut != null`,
  and `damagedSlabCount` is then read with `?? 0` inside the same filtered set. This assumes
  `totalSlabsCut` and `damagedSlabCount` are always written together. Today that assumption
  holds — `cutting-session.service.ts:141-152`'s `complete()` is the only code path that ever
  sets either field, and it always sets `status: "completed"`, `totalSlabsCut`,
  `finalGoodSlabCount`, and `damagedSlabCount` atomically in one `update()` inside a
  transaction, so the two fields can never be out of sync in the current codebase. But the
  schema comment for `CuttingSession.status` (`schema.prisma:139`) documents a third value,
  `aborted`, that no code path sets yet. If an `aborted` (or any future) state is ever
  introduced that writes `totalSlabsCut` without `damagedSlabCount`, this would silently
  under-count loss (treating a real null as 0) rather than excluding the session the way the
  `in_progress` case is deliberately excluded. Not a bug against today's data or the Definition
  of Done — no fix required now — but worth a one-line comment noting the assumption, or a
  `BUILD-LOG.md` entry, so it isn't rediscovered the hard way when `aborted` gets wired up.

## Escalate to Architect
*None.*

## Cleared

Reviewed `raw-block.service.ts:67-107` (the only file/lines Bob listed) against the schema
comment cited in the brief (`schema.prisma:130-151` for `CuttingSession`, `:254-298` for
`RawBlock`), and traced all 4 Definition-of-Done scenarios plus the two extra edge cases by
hand rather than taking the smoke-test summary on faith:

1. **6 fields present** — `costBasis`, `totalCost`, `totalSlabsCut`, `damagedSlabCount`,
   `costPerSlab`, `lossAmount` are all returned unconditionally from `computeDamagedSlabLoss`.
2. **Zero-damage block → `lossAmount: 0`, not null** — confirmed by hand: when
   `damagedSlabCount` sums to `0` but `costPerSlab` is non-null, `lossAmount = costPerSlab * 0
   = 0`, and the null-guard on `lossAmount` is keyed off `costPerSlab`, not `damagedSlabCount`
   — the one place a careless implementation gets this wrong, correctly handled here.
3. **No cost recorded → all three cost fields null** — `costBasis` falls through both
   `!= null` checks to `null`; `totalCost` inherits `null` from `costBasis === null`;
   `costPerSlab`'s guard (`totalCost != null && totalSlabsCut > 0`) short-circuits on the
   first clause. `totalSlabsCut`/`damagedSlabCount` are correctly independent of cost and
   still populate from sessions.
4. **No completed session → `totalSlabsCut: 0`, `costPerSlab: null`** — empty
   `cuttingSessions` (or all-null-`totalSlabsCut`) produces an empty `reportedSessions`,
   `reduce` over `[]` correctly yields `0` (not `NaN`/undefined), and the `totalSlabsCut > 0`
   guard correctly forces `costPerSlab` to `null` rather than dividing by zero.
5. **`actualAmountPaid` preferred over `invoicedAmount`** — ternary checks
   `actualAmountPaid != null` first; confirmed this is a `!= null` check (not truthy), so a
   genuine `actualAmountPaid: 0` (block received free) is correctly treated as a present cost
   basis rather than falling through to `invoicedAmount`.
6. **Multi-session summing excludes in-progress** — `reportedSessions` filter on
   `totalSlabsCut != null` correctly drops an `in_progress` session with null counts while
   summing two `completed` sessions; verified this is currently equivalent to filtering on
   `status === "completed"` given point above (see Should Fix).

**Multi-tenancy**: `findOne`'s `findFirst({ where: { id, factoryId } })` is unchanged and still
scopes correctly; the new `cuttingSessions: true` include adds no additional query and no
cross-factory read (`CuttingSession.factoryId` isn't referenced or leaked — only
`totalSlabsCut`/`damagedSlabCount` are read). No conflict with the no-cross-factory-access
rule.

**`Number(x)` precedent claim verified** — repo-wide check confirms `daily-sales-summary.service.ts:38-40`
and `expense.service.ts:67` are the only other Decimal→number conversions in the backend, both
using plain `Number(x)`, no `.toNumber()` anywhere. Bob's claim that this is "the closer match"
is accurate, not just asserted.

**`async findOne` change is safe** — the only caller (`raw-block.controller.ts:19-20`) does a
bare `return this.service.findOne(...)`; Nest awaits controller return values regardless of
whether they're a plain value or a `Promise`, so making the method `async` is transparent to
the controller. Confirmed no other internal call site in the service calls `this.findOne`
(grepped the file) that could be affected by the shape change (extra `cuttingSessions`/
`damagedSlabLoss` keys on the returned object).

**`findAll` untouched** — confirmed, no diff.

Step 3 is clear.

---

# Step 2 (Round 2)
*Preserved below for the full trail.*

---

## Must Fix
*None.*

## Should Fix
*None new. Prior open items (missing `opening_balance` minimum-data validation, `createMany`
vs `Promise.all` for finished_stock slabs) remain correctly logged in `handoff/BUILD-LOG.md`
as deferred follow-ups, not re-raised here.*

## Escalate to Architect
*None. Round 1's escalation was resolved directly by the Project Owner (verbatim decision
recorded in `handoff/ARCHITECT-BRIEF.md`); verified below that the resolution was actually
implemented, not just asserted.*

## Cleared

Re-verified all 3 Round 1 Must Fix bugs directly against the current
`raw-block.service.ts`/`raw-block.controller.ts` (diffed against `HEAD`, not just taking the
review request's word for it):

1. **`entrySource` allowlist** (`:13,48,76-80`) — `ENTRY_SOURCES = ["purchase",
   "opening_balance"] as const` is checked immediately on entry to `create()`, before any
   role/branch logic, throwing `BadRequestException` on anything else (including the literal
   string `"transfer_in"`). Same pattern as `RECONCILE_FIELDS`, as prescribed.
2. **`validateMachineType` factory scoping** (`:258-266`) — now takes `factoryId` as a
   parameter and calls `this.prisma.machine.findFirst({ where: { id: machineId, factoryId } })`.
   Confirmed this matches `machine.service.ts`'s own scoping pattern
   (`findMany({ where: { factoryId } })`) — same shape, not a look-alike. Both call sites
   (`:97`, `:113-114`) pass the correct `factoryId`.
3. **`reconcile()` cost_status graduation rule** (`:315-316`) — now reads
   `block.costStatus !== "estimated" ? block.costStatus : (fieldName === "weightTons" ?
   "estimated" : "confirmed")`. Traced the logic by hand: a block whose `costStatus` is
   anything other than `"estimated"` (e.g. an ordinary `"pending"` purchase block awaiting
   its invoice) now always keeps its existing status untouched, regardless of which field is
   reconciled — the original bug (unconditional promotion to `"confirmed"`) is gone. The
   `"estimated"` branch's own behavior (weight alone stays `"estimated"`; invoiced/actual
   amount graduates to `"confirmed"`) is unchanged from what Round 1 already cleared.

**`transfer_in` removal — verified complete, not just claimed:**
- Repo-wide grep (`packages/`) for `transfer_in`, `transferIn`, `validateTransferIn`,
  `sourceFactoryId`, `transferredFromBlockId`, `transferredToBlocks`, `blockTransfersOut`
  returns matches in exactly two files: `raw-block.service.ts` (two hits, both comments
  documenting the Project Owner's decision — no executable reference) and `schema.prisma`
  (the fields/relations themselves, left in place deliberately per the brief — not flagged).
  No frontend, DTO, or other service file references any of these names.
- `validateTransferIn` method is gone entirely (not present, not commented out).
- `CreateRawBlockInput` no longer declares `sourceFactoryId`/`transferredFromBlockId`; the
  `tx.rawBlock.create()` data object doesn't reference either field.
- No remaining code path in `raw-block.service.ts` queries a `Factory` or `RawBlock` row
  outside the caller's own `factoryId` — every Prisma call in the file is scoped.
- `npx tsc --noEmit` on `packages/backend` run directly (not just taking the build claim on
  faith): clean, no errors.
- Cross-checked `handoff/BUILD-LOG.md`: the deferred Should-Fix items (opening_balance
  minimum-data validation, `createMany` nit) are logged there as claimed, not silently dropped.

No leftover dead code, unused imports, or partial-removal artifacts found. Round 1's other
"Cleared" findings (schema/migration correctness, role-gating mechanics, mid_cutting/
finished_stock FK wiring) are untouched by this round's diff and still stand.

Step 2 is clear.

---

# Round 1 (original)
*Preserved below for the full trail.*

---

## Must Fix
*Blocks the step. Builder fixes before anything moves forward.*

- `packages/backend/src/modules/inventory/raw-block.service.ts:68-74` (and the `EntrySource`
  type at `:5`) — `entrySource` is read from the request body and used directly with no
  runtime check that it's actually `"purchase"` / `"opening_balance"` / `"transfer_in"`.
  `raw_block.entry_source` is a plain `TEXT` column (not a Postgres enum, unlike `UserRole`/
  `PaymentType`), so any elevated-role caller passing e.g. `entrySource: "backdoor"` sails
  past the role check (it only requires `entrySource !== "purchase"`), skips both the
  `opening_balance` and `transfer_in` validation branches entirely (neither `if` matches),
  and lands on `costStatus: "confirmed"` / `currentStatus: "in_stock"` by falling through
  the ternaries' final `else`. This persists junk into a column other code (reporting,
  reconciliation) will assume is one of three known values. Fix: validate `entrySource`
  against a fixed allowlist up front, same pattern already used for `RECONCILE_FIELDS` in
  `reconcile()`, and throw `BadRequestException` otherwise.

- `packages/backend/src/modules/inventory/raw-block.service.ts:278-286`, called from `:87` and
  `:103-104` — `validateMachineType` looks up the machine with
  `this.prisma.machine.findUnique({ where: { id: machineId } })` — **no `factoryId` filter at
  all**. This is the only unscoped `Machine` lookup in the codebase; `machine.service.ts:18`
  (the established pattern) always scopes by `factoryId`. Unlike `transfer_in` (which is
  cross-factory by design), an `opening_balance` intake has no legitimate reason to reference
  another factory's machine. As written, a caller can pass a `cuttingMachineId`/
  `polishingMachineId` belonging to a *different* factory and it validates successfully as
  long as `machineType` matches — creating a `CuttingSession`/`PolishingSession` row for this
  factory's new block that points at another factory's physical machine. This is exactly the
  kind of gap README.md's "Multi-tenant enforcement" section warns against ("every service
  method filters on [factoryId]... if you add [an unscoped query], you've broken tenant
  isolation"). Fix: pass `factoryId` into `validateMachineType` and use
  `findFirst({ where: { id: machineId, factoryId } })`.

- `packages/backend/src/modules/inventory/raw-block.service.ts:317-354`, specifically `:331`
  and `:348` — the cost_status graduation rule only special-cases blocks that are *already*
  `costStatus === "estimated"`. For any block that is not currently `"estimated"` — e.g. an
  ordinary purchase block still sitting at `"pending"` because no invoice has been entered
  yet — correcting *any* of the three reconcilable fields unconditionally forces
  `costStatus` to `"confirmed"` (line 348: `stillEstimated` is `false` whenever
  `block.costStatus !== "estimated"`, and the ternary's only other branch is `"confirmed"`).
  Example: calling `reconcile(blockId, "weightTons", 5.2)` on a still-`pending` purchase block
  flips it straight to `"confirmed"` even though `invoicedAmount` may still be null — the exact
  state `"confirmed"` is supposed to mean it *isn't*. Per the brief, this endpoint exists for
  "correcting estimated figures" — it should leave `costStatus` alone for blocks that aren't
  already `estimated`, not force them to `confirmed`. Fix along the lines of:
  `costStatus: block.costStatus !== "estimated" ? block.costStatus : (fieldName === "weightTons" ? "estimated" : "confirmed")`.

## Should Fix
*Does not block. Fix inline if under 5 minutes, otherwise log to BUILD-LOG.*

- `raw-block.service.ts:80-105` — no minimum-data validation for `opening_balance`/
  `transfer_in`: nothing requires `weightTons` (or any financial figure) actually be supplied.
  A block can be created with `costStatus: "estimated"` (or `"confirmed"` for transfer_in) and
  a null `weightTons`/`invoicedAmount`, defeating the point of tracking a real-vs-approximate
  number. Consider requiring `weightTons` for `opening_balance`.
- `raw-block.service.ts:260-274` (`validateTransferIn`) fetches the source block but never
  copies its `weightTons`/`invoicedAmount` onto the new block, yet `:114` hardcodes
  `costStatus: "confirmed"` for every `transfer_in` regardless of whether the caller actually
  supplied real numbers in the request body. Worth confirming intent — should the source
  block's own values be carried forward automatically?
- `raw-block.service.ts:22` (`StartingState`) — like `entrySource`, `input.startingState` isn't
  validated against its 3-value union either; an unrecognized value silently behaves as
  `raw_yard`. Lower severity than the `entrySource` gap (same class of issue) since nothing
  bad happens beyond silent mis-defaulting.
- `raw-block.service.ts:221-240` — finished_stock creates N `Slab` rows one at a time via
  `Promise.all(...create())` rather than `createMany`; pure efficiency nit, not a correctness
  bug (needed the individual ids for `PolishingSessionSlab` linking, so not a trivial swap).
- `raw-block.service.ts:252-276` — no check preventing `sourceFactoryId === factoryId` (a
  transfer targeting one's own factory). Harmless today, just confusing; a one-line guard
  would close it off.

## Escalate to Architect
*Product or business decision required.*

- `raw-block.service.ts:252-276` (`validateTransferIn`) — its `Factory`/`RawBlock` lookups are,
  by design, unscoped by the caller's `factoryId`, because the whole point of `transfer_in` is
  to reference a *different* factory. But README.md's stated tenant-isolation invariant is
  literally "every service method filters on `factoryId`... if you add [an unscoped query],
  you've broken tenant isolation," and there is no `Company`/`Organization` model above
  `Factory` constraining which factories are legitimate transfer partners for a given caller.
  Today, with a single pilot customer and one `Factory` row, this is moot. But as written, any
  authenticated user at any factory can probe for the existence of any other factory or
  raw_block row in the deployment (the 404-vs-400 responses are distinguishable) and, given a
  correct id, complete a cross-factory transfer against it — nothing establishes the two
  factories are actually related. This isn't a fixable code bug at this step (it's inherent to
  what the feature does), but it does directly conflict with the codebase's own documented
  enforcement model and deserves an explicit call: is unrestricted factory-to-factory transfer
  the intended long-term model once this deployment might host more than one customer, or does
  transfer eligibility need a grouping concept before then? Not resolving this myself — it's a
  product decision, not a code-level one.

## Cleared

Schema/migration: the new `RawBlock`/`CuttingSession`/`PolishingSession`/`Slab` fields, the
`BlockReconciliation` model, and all new relations are well-formed; `migration.sql` matches the
schema exactly (column types, defaults, and FK `ON DELETE` actions all consistent with the
project's existing `RESTRICT`/`SET NULL` conventions — checked against
`block_state_transition_raw_block_id_fkey` in the `init` migration); the backfill `UPDATE`'s
`WHERE invoiced_amount IS NOT NULL` scoping is correct and intentionally applies across all
factories, not per-tenant. Role-gating mechanics are sound: `create()`'s manual
body-conditional check and `reconcile()`'s declarative `@Roles()` + class-level `RolesGuard`
(guard ordering, and `RolesGuard` correctly no-op'ing when no `@Roles()` metadata is present on
a handler) both work as intended — no bypass path found in either. The
`mid_cutting`/`finished_stock` FK wiring (`CuttingSession` → `Slab`, `PolishingSession` →
`PolishingSessionSlab` → `Slab`) is internally consistent: counts, required fields, and
statuses line up with each other and with the brief's corrected field names
(`cuttingMachineId`/`polishingMachineId`, `totalSlabsCut`/`finalGoodSlabCount`/
`damagedSlabCount`, required `operationalDate`/`finishType`).
