# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 6A — Copilot database safety foundation (Row-Level Security + read-only role)

This is the first of two steps building the AI Business Analyst / Copilot (README item #10 —
the actual reason StoneOS exists). **This step is database-security-only — no NestJS module, no
LLM integration, no frontend.** Those come in Step 6B, and only after this step is reviewed and
cleared, because everything in 6B depends on this being airtight.

### Why this step exists, and why it's isolated
The Copilot (Step 6B) will let an LLM write free-form SQL against the database in response to
natural-language questions from the Owner, then execute it. That is a deliberate, informed
choice the Project Owner made after being shown the safer alternative (a fixed tool-calling
layer) and picking flexibility anyway. The mitigation is **not** "hope the LLM remembers to
scope every query by `factoryId`" — it's making cross-tenant access structurally impossible at
the database engine level, so a query that forgets to filter by factory simply cannot return
another factory's rows, no matter what SQL text was generated. That's what this step builds:
Postgres Row-Level Security (RLS) policies on every tenant-scoped table, plus a dedicated
read-only Postgres role that the Copilot will run all its generated queries through in Step 6B.
**Nothing in Step 6B ships if this step's guarantees aren't independently proven correct.**

### What to build

**1. New migration** (SQL-only — no Prisma schema changes, no new models/columns). Create the
migration folder by hand (matching the existing `packages/backend/prisma/migrations/
<timestamp>_<name>/migration.sql` convention — see e.g. `20260712000000_tally_voucher_item`)
since this is role/policy DDL that `prisma migrate diff` cannot generate from schema changes.
Suggested name: `20260713000000_copilot_rls_readonly_role`.

The migration must:

a) `CREATE ROLE stoneos_copilot_ro LOGIN PASSWORD '<dev-only password, matching the
   `stoneos_dev_only` convention already used in `docker-compose.yml`>';` — grant it `CONNECT`
   on the database and `USAGE` on the `public` schema, and `SELECT` on every table listed below.
   **No** `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/any DDL grant, ever. Do not make it a superuser,
   do not make it the owner of anything, do not grant it `BYPASSRLS`.

b) For **every** table below: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` and, as an
   extra safety layer, `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` (belt-and-suspenders —
   the role already can't bypass RLS by construction since it owns nothing and has no
   BYPASSRLS, but FORCE means even a future owner/superuser slip doesn't silently disable this).

c) **Tables with their own `factory_id` column** — direct policy:
   ```sql
   CREATE POLICY tenant_isolation ON <table>
     USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), '')::uuid);
   ```
   Table list (18): `factory` (use `id` instead of `factory_id` — `USING (id =
   NULLIF(current_setting('app.current_factory_id', true), '')::uuid)`), `app_user`, `supplier`,
   `customer`, `machine`, `cutting_session`, `polishing_session`, `vehicle`, `raw_block`, `slab`,
   `daily_production_report`, `consumable`, `invoice`, `sales_order`, `daily_sales_summary`,
   `expense`, `tally_import_batch`, `inventory_snapshot`, `utility_reading`.

   The `NULLIF(..., '')` + `true` (missing-ok) combination is deliberate: if
   `app.current_factory_id` is ever unset for a session, `current_setting(..., true)` returns
   NULL instead of erroring, and `factory_id = NULL` is never true in SQL — so an unset session
   variable means **zero rows returned, fail-closed**, not an error and not all rows. Verify
   this exact behavior in your smoke test (below), don't just assume it.

d) **Child tables with no `factory_id` of their own** — policy via a subquery through the
   parent's `factory_id`. Exact parent relationship for each (verified against the real schema,
   not guessed):
   - `cutting_day_log` → `cutting_session_id` → `cutting_session.factory_id`
   - `polishing_session_slab` → `polishing_session_id` → `polishing_session.factory_id`
   - `raw_block_photo` → `raw_block_id` → `raw_block.factory_id`
   - `block_state_transition` → `raw_block_id` → `raw_block.factory_id`
   - `slab_photo` → `slab_id` → `slab.factory_id`
   - `slab_state_transition` → `slab_id` → `slab.factory_id`
   - `block_reconciliation` → `raw_block_id` → `raw_block.factory_id`
   - `machine_runtime_log` → `machine_id` → `machine.factory_id`
   - `consumable_purchase` → `consumable_id` → `consumable.factory_id`
   - `consumable_usage_log` → `consumable_id` → `consumable.factory_id`
   - `payment` → `invoice_id` → `invoice.factory_id` — **`invoice_id` is nullable.** A
     `payment` row with a null `invoice_id` will not match any subquery result and will be
     invisible under RLS. This is fail-closed (not a security hole) but is a real completeness
     gap — flag it explicitly in your review request rather than silently accepting it; do not
     try to "fix" it by inventing a factory_id source that doesn't exist in the schema.
   - `sales_line_item` → `sales_order_id` → `sales_order.factory_id`
   - `expense_allocation` → `expense_id` → `expense.factory_id`
   - `tally_ledger_entry` → `tally_import_batch_id` → `tally_import_batch.factory_id`
   - `tally_voucher_item` → `tally_import_batch_id` → `tally_import_batch.factory_id`
   - `tally_trial_balance_snapshot` → `tally_import_batch_id` → `tally_import_batch.factory_id`

   Example shape for one of these (adapt per table):
   ```sql
   CREATE POLICY tenant_isolation ON sales_line_item
     USING (sales_order_id IN (
       SELECT id FROM sales_order
       WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')::uuid
     ));
   ```

   That's 33 tables total (18 direct + 15 child). If you find a table in the real schema not
   covered by either list above, stop and escalate rather than guessing which category it's in
   — an uncovered tenant-scoped table is a real security gap, not a minor omission.

**2. Verification script** (not committed as a permanent script — throwaway, matching the
`scratchpad/smoke-test-*.js` pattern already used in this codebase for Steps 2/3/4). Connect
directly with the `pg` driver (not Prisma — this needs raw control over `SET LOCAL` and the
role) as `stoneos_copilot_ro`, and prove all of the following against real seeded test data (two
factories, some overlapping-shaped data in each):

- With `app.current_factory_id` set (via `BEGIN; SET LOCAL app.current_factory_id = '<factory A
  uuid>';`) and a bare `SELECT * FROM expense` (no `WHERE` at all): only factory A's rows come
  back, never factory B's, even though the query itself has no tenant filter.
- Same for at least 2 of the child tables (e.g. `sales_line_item`, `payment`) — prove the
  subquery-based policies work too, not just the direct-column ones.
- With `app.current_factory_id` deliberately **not set** at all in a fresh connection/session:
  the same bare `SELECT * FROM expense` returns **zero rows**, not all rows and not an error.
  This is the fail-closed check — it's the single most important assertion in this script.
- Attempt `INSERT INTO expense (...) VALUES (...)` as `stoneos_copilot_ro`: must fail with a
  permissions error. Same for `UPDATE`/`DELETE` on any table, and `DROP TABLE`.
- Attempt to query a table NOT in the 33-table list above (e.g. `factory` itself, or any table
  you're unsure about): confirm your assumption about whether it should be readable — `factory`
  should be, scoped by `id`, per (c) above.

Report the full pass/fail results in `handoff/REVIEW-REQUEST.md`, not just "smoke test passed."

### Flags
- Do not touch any NestJS code (`src/`) this step — no controller, no service, no module. This
  step is migration + verification script only.
- Do not add `COPILOT_DATABASE_URL` to any runtime `.env` usage yet — document it in
  `.env.example` as a new variable (for Step 6B to actually wire up), but nothing in the running
  app should read it this step.
- Do not attempt to run this migration against any database other than local Postgres — no
  production environment exists for this project.
- If local Postgres isn't reachable in your environment, you cannot run the verification script
  live — say so plainly in the review request rather than claiming it passed. Write the
  migration and script correctly, verified by careful reading against the real schema, and flag
  live verification as pending if you can't reach a database.

### Definition of Done
- [ ] Migration creates `stoneos_copilot_ro` with SELECT-only grants, no write/DDL access
- [ ] RLS enabled + forced on all 33 tenant-scoped tables (18 direct + 15 child)
- [ ] Every child-table policy verified against the real parent-FK relationship (not assumed)
- [ ] `payment.invoice_id` nullability gap explicitly flagged, not silently patched over
- [ ] Verification script proves: cross-tenant isolation (direct + child tables), fail-closed
      behavior when the session variable is unset, write rejection, and reports real results
- [ ] `.env.example` documents `COPILOT_DATABASE_URL` as a new variable, not yet wired into the app
- [ ] `handoff/REVIEW-REQUEST.md` written with full verification results

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*
