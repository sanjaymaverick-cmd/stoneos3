# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 6B — AI Copilot: Gemini integration + owner-only chat page

Step 6A (merged, `94baf27`) built the security foundation: a `stoneos_copilot_ro` read-only
Postgres role and Row-Level Security on 35 tenant-scoped tables, enforced by a per-connection
`app.current_factory_id` session variable that fails closed when unset. **This step builds on
top of that — do not re-derive or re-verify the RLS policies themselves, they're already proven;
your job is to make sure every query you execute actually goes through that role and that
session-variable pattern, not to re-litigate whether RLS works.**

### What this delivers
The Owner asks a free-form business question in a chat page in the app (owner-only). The
question goes to Gemini along with a description of the queryable schema. Gemini returns a
single SQL `SELECT` statement. That statement is validated, then executed through the
`stoneos_copilot_ro` role with `app.current_factory_id` set to the caller's factory. The result
goes back to Gemini once more to be turned into a plain-language answer. Both the question and
the generated SQL are logged for audit. The chat page shows the answer and lets the Owner expand
to see the SQL that produced it.

### 1. Schema migration (normal Prisma this time — not hand-written SQL like Step 6A)
Add a new model:
```prisma
model CopilotQueryLog {
  id            String   @id @default(uuid())
  factoryId     String   @map("factory_id")
  factory       Factory  @relation(fields: [factoryId], references: [id])
  userId        String   @map("user_id")
  question      String
  generatedSql  String?  @map("generated_sql")
  rowCount      Int?     @map("row_count")
  answer        String?
  errorMessage  String?  @map("error_message")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("copilot_query_log")
}
```
Add the inverse relation on `Factory`. Generate this migration normally
(`prisma migrate dev`/the `migrate diff` fallback pattern used in prior steps if no interactive
TTY) — this is an ordinary additive schema change, no RLS/role work needed here.

**This table does NOT need Step-6A-style RLS.** It's only ever written/read through the normal
`PrismaService` connection with explicit `factoryId` scoping in the service layer, exactly like
every other table in this codebase (see README's "Multi-tenant enforcement" section) — it is
never touched by the `stoneos_copilot_ro` role or the LLM-generated SQL. Don't add it to any RLS
migration; that would be solving a problem that doesn't exist here and confusing the boundary of
what Step 6A actually protects.

### 2. New dependencies
`packages/backend/package.json`: add `pg` (+ `@types/pg` as a dev dependency) for raw
connection control — Prisma's client can't do `SET LOCAL` or connect as a different role, and
Step 6A's own verification already proved the raw-`pg` + `SET LOCAL` pattern works correctly.
Add `@google/generative-ai` (the official Gemini Node SDK).

### 3. Backend module — `packages/backend/src/modules/copilot/`
- `copilot.module.ts`, `copilot.controller.ts`, `copilot.service.ts` — follow this codebase's
  existing module conventions exactly (see `modules/tally/` for a recently-built comparable).
- `POST /copilot/ask` — `@UseGuards(ClerkAuthGuard, RolesGuard)`, `@Roles("owner")` **only** —
  not `"owner", "admin"` like the existing dashboard/admin patterns. The Owner's explicit choice
  this time was narrower: just the owner, not admin too. Body: `{ question: string }`. Response:
  `{ answer: string, sql: string | null }` — always return the generated SQL (or null if
  generation/validation failed before producing one) so the frontend can show it.

**Service flow (`copilot.service.ts`):**

a) **Schema context.** Build a human-readable description of the queryable schema to send to
   Gemini — table names, column names/types, and the key business-meaning notes that already
   exist as comments in `schema.prisma` (e.g. the RECOVERY RATIO comment above `RawBlock`, the
   "PROVISIONAL ONLY" note on `Slab.lengthFt`/`widthFt`, the SIMPLIFIED slab-registration note).
   **Derive this from the real schema and its real comments — do not invent table/column names
   or business rules that aren't actually there.** You may reasonably exclude tables that add
   noise without business value (e.g. `RawBlockPhoto`/`SlabPhoto` — just URLs;
   `BlockStateTransition`/`SlabStateTransition` — internal audit logs) if you think that keeps
   the prompt tighter, but don't exclude anything a real business question could plausibly need
   (expenses, sales, production, inventory, vehicles, customers, machines are all in scope).
   Note in your review request exactly which tables you included/excluded and why — this is a
   judgment call, flag it rather than silently deciding.

b) **Generate SQL.** Call Gemini with the schema context + the question + a system instruction
   that it must output ONLY a single SQL `SELECT` statement — no markdown fences, no
   explanation, no multiple statements. (`GEMINI_API_KEY`/`GOOGLE_API_KEY` env var — see Flags.)

c) **Validate the generated SQL before executing anything:**
   - Must be exactly one statement (reject if it contains a `;` followed by more non-whitespace
     content — stacked queries are a red flag regardless of what they contain).
   - Must start with `SELECT` (case-insensitive, after trimming whitespace/comments).
   - Reject if it contains any of (case-insensitive, word-boundary matched, not substring):
     `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `CREATE`,
     `COPY`, `EXECUTE`, `CALL`, `DO`, `VACUUM`, `SET` (the LLM should never need to `SET`
     anything itself — you set the session variable, not it).
   - This is defense-in-depth, not the sole safety net — `stoneos_copilot_ro` already can't
     write/DDL at the database level regardless. But failing fast with a clear "I couldn't
     safely answer that" beats a raw Postgres permission-denied error reaching the user.
   - If the query has no `LIMIT`, append one (500 rows) before execution, to bound response
     size. If it does have one, leave it — don't override a smaller explicit limit.
   - On any validation failure: log it to `CopilotQueryLog` with the question,
     `generatedSql` set to what was rejected, `errorMessage` explaining why, no execution
     attempted, and return a friendly "I couldn't safely answer that — try rephrasing" to the
     user. Never surface the raw validation reason or raw SQL error text to the frontend (match
     this codebase's existing "never surface raw errors to end users" standard); log the real
     detail server-side/in the audit row only.

d) **Execute, through the RLS-protected role, correctly scoped.** Open a `pg` client/pool
   connected via a new `COPILOT_DATABASE_URL` env var (already documented, commented-out, in
   `.env.example` from Step 6A — pointed at the `stoneos_copilot_ro` role). For each request:
   ```
   BEGIN;
   SET LOCAL app.current_factory_id = '<caller's factoryId, from @CurrentUser()>';
   SET LOCAL statement_timeout = '5s';
   <the validated SELECT>
   COMMIT;  -- (or ROLLBACK; doesn't matter, it's read-only either way)
   ```
   **Must be `SET LOCAL` inside an explicit transaction, never a bare `SET`.** `SET LOCAL` is
   scoped to the transaction and automatically resets on commit/rollback — a bare `SET` on a
   pooled connection would leak the factory scoping to whatever request reuses that connection
   next, which would be a real cross-tenant bug, not a hypothetical one. This is the single most
   important correctness detail in this step — get it wrong and Step 6A's guarantee doesn't
   actually apply to this feature's queries. If the query errors (timeout, malformed SQL Gemini
   produced that passed your regex checks but isn't valid Postgres, etc.), catch it, log to
   `CopilotQueryLog` with the error, and return the same friendly "couldn't answer that" message.

e) **Format the answer.** Send the question + the query results (as structured data, not raw SQL
   output) back to Gemini in a second call, asking for a short plain-language answer. Don't build
   a separate template-formatting system — a second LLM call matches what "chat that answers
   your questions" actually implies and is simpler to get right than hand-rolling formatters for
   every possible result shape.

f) **Log every attempt** to `CopilotQueryLog` — success or failure, always — with `factoryId`
   and `userId` from `@CurrentUser()`, the question, the generated SQL (or null), row count,
   the final answer (or null on failure), and any error message.

### 4. Startup-time RLS coverage assertion (mitigates the operational trap Richard flagged after
   Step 6A's review — KG-8 could silently leave a future table unprotected)
On the `CopilotModule`'s initialization (e.g. `OnModuleInit`), query `pg_policies`/`pg_class`
directly (via the same `pg` connection, or a one-off check using `PrismaService.$queryRaw`) to
confirm every table in a hardcoded list of the 35 expected tenant-scoped tables (same list as
Step 6A's migration — copy it from there, don't re-derive it by hand and risk drifting from the
actual migration) has `rowsecurity = true` AND a `tenant_isolation` policy present. **If any
expected table is missing either, do not crash the whole app** — the rest of StoneOS doesn't
depend on the Copilot to function. Instead, fail the Copilot module's own readiness (e.g. a
flag the controller checks before accepting any `/copilot/ask` request, returning a clear
"Copilot is temporarily unavailable" error) and log loudly (a startup error visible in server
logs). This is specifically about containing KG-8's blast radius to the one feature whose safety
it threatens, not about taking down Sales/Expenses/Production over it.

### 5. Frontend — `packages/frontend/app/copilot/page.tsx`
- Owner-only: gate with `useRole()` exactly like `dashboard/page.tsx` does (redirect/placeholder
  for everyone else, including admin this time — narrower than the dashboard's gate).
- Simple chat UI: message list (question/answer pairs), text input + submit, loading state while
  waiting. Reuse `.ticket`/`.list-table`/existing palette — no new design system, matching every
  prior frontend step's instruction.
- Show the generated SQL per answer, collapsed/expandable (e.g. a "show query" toggle) — this is
  the transparency mechanism promised to the Owner ("if a number ever looks wrong, you can see
  exactly what SQL produced it").
- Add a nav link in `AppNav.tsx`, owner-only (same conditional pattern already used for "Team").
- `"use client"`, `useAuth()` + `apiFetch`/`safeGetToken` from `lib/api.ts` — same pattern as
  every other page, no new fetch library.

### Flags
- **No Gemini API key exists anywhere in this environment** (checked `.env`, `packages/backend/
  .env`, and shell env vars directly before writing this brief — confirmed absent, not assumed).
  Build everything so it's correct and reviewable without a live key: the SQL validation logic,
  the RLS-scoped execution path (testable against real local Postgres with a manually-supplied
  SQL string standing in for what Gemini would produce), and the audit logging can all be
  verified without ever calling the real Gemini API. The actual `generateSql()`/`formatAnswer()`
  Gemini calls should be written correctly against the SDK but can't be live-tested end-to-end
  this step — say so plainly in your review request, don't claim more verification than you
  actually did.
- Do not touch anything from Step 6A's migration or the `stoneos_copilot_ro` role's grants.
- Do not build role-based Copilot access for admin or any other role — owner only, per the
  Owner's explicit choice.
- Do not add a persistent multi-turn conversation/session-memory system — each question is
  independent for v1 (simpler, and nothing in the direction conversation asked for memory across
  questions).

### Definition of Done
- [ ] `CopilotQueryLog` model + migration (normal Prisma migration, no RLS needed on this table)
- [ ] `POST /copilot/ask`, `@Roles("owner")` only, full flow: generate → validate → execute
      (via `stoneos_copilot_ro` + `SET LOCAL app.current_factory_id` inside an explicit
      transaction) → format answer → log, every path (success and failure) logged
- [ ] SQL validation rejects multi-statement, non-SELECT, and write/DDL-keyword-containing
      generated SQL before execution, with a friendly error to the user and the real reason
      logged server-side only
- [ ] Startup RLS-coverage assertion — fails the Copilot module's own readiness (not the whole
      app) if any expected table is missing RLS
- [ ] Frontend chat page at `/copilot`, owner-only, shows generated SQL per answer, linked from
      `AppNav.tsx`
- [ ] `tsc --noEmit` clean, `npm run build` clean, both packages
- [ ] Review request explicitly states Gemini calls are implemented but not live-tested (no key
      available), and states exactly which tables were included/excluded from the schema context
- [ ] `handoff/REVIEW-REQUEST.md` written

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*
