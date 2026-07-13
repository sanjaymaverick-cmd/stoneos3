-- Step 6A: Copilot database safety foundation.
-- Read-only Postgres role for the future AI Copilot (Step 6B), plus Row-Level
-- Security policies on every tenant-scoped table so that a query which
-- forgets to filter by factory cannot return another factory's rows, no
-- matter what SQL text the LLM generates.
--
-- Hand-written (not `prisma migrate diff`-generated): this is role/policy DDL,
-- not a schema change, so there is nothing for Prisma to diff.
--
-- NOTE on the tenant-scoping comparison: `id`/`factory_id` columns in this
-- schema are Prisma `String @id @default(uuid())` with no `@db.Uuid`, so
-- Postgres stores them as TEXT, not the native `uuid` type. Comparing
-- `text = uuid` has no implicit cast in Postgres and raises
-- "operator does not exist: text = uuid" (confirmed against the live dev DB).
-- All policies below therefore compare as TEXT, with no `::uuid` cast on the
-- current_setting() value. The fail-closed guarantee is unaffected:
-- NULLIF(current_setting('app.current_factory_id', true), '') still returns
-- NULL when the session variable is unset or empty, and `x = NULL` is never
-- true in SQL, so an unset session variable still yields zero rows.

-- ============================================================
-- 1. Read-only role
-- ============================================================
CREATE ROLE stoneos_copilot_ro LOGIN PASSWORD 'stoneos_dev_only';

GRANT CONNECT ON DATABASE stoneos TO stoneos_copilot_ro;
GRANT USAGE ON SCHEMA public TO stoneos_copilot_ro;

GRANT SELECT ON
  factory,
  app_user,
  supplier,
  customer,
  machine,
  cutting_session,
  polishing_session,
  vehicle,
  raw_block,
  slab,
  daily_production_report,
  consumable,
  invoice,
  sales_order,
  daily_sales_summary,
  expense,
  tally_import_batch,
  inventory_snapshot,
  utility_reading,
  cutting_day_log,
  polishing_session_slab,
  raw_block_photo,
  block_state_transition,
  slab_photo,
  slab_state_transition,
  block_reconciliation,
  machine_runtime_log,
  consumable_purchase,
  consumable_usage_log,
  payment,
  sales_line_item,
  expense_allocation,
  tally_ledger_entry,
  tally_voucher_item,
  tally_trial_balance_snapshot
TO stoneos_copilot_ro;

-- No INSERT/UPDATE/DELETE/TRUNCATE/DDL grants of any kind.
-- Not a superuser, not the owner of anything, no BYPASSRLS.

-- ============================================================
-- 2. Enable + force RLS on every tenant-scoped table (35 total:
--    19 with a direct factory_id/id column, 16 child tables scoped via a
--    subquery through their parent's factory_id).
-- ============================================================
ALTER TABLE factory ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory FORCE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier FORCE ROW LEVEL SECURITY;
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer FORCE ROW LEVEL SECURITY;
ALTER TABLE machine ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine FORCE ROW LEVEL SECURITY;
ALTER TABLE cutting_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutting_session FORCE ROW LEVEL SECURITY;
ALTER TABLE polishing_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE polishing_session FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle FORCE ROW LEVEL SECURITY;
ALTER TABLE raw_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_block FORCE ROW LEVEL SECURITY;
ALTER TABLE slab ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_production_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_production_report FORCE ROW LEVEL SECURITY;
ALTER TABLE consumable ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumable FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_summary FORCE ROW LEVEL SECURITY;
ALTER TABLE expense ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense FORCE ROW LEVEL SECURITY;
ALTER TABLE tally_import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_import_batch FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE utility_reading ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_reading FORCE ROW LEVEL SECURITY;

ALTER TABLE cutting_day_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutting_day_log FORCE ROW LEVEL SECURITY;
ALTER TABLE polishing_session_slab ENABLE ROW LEVEL SECURITY;
ALTER TABLE polishing_session_slab FORCE ROW LEVEL SECURITY;
ALTER TABLE raw_block_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_block_photo FORCE ROW LEVEL SECURITY;
ALTER TABLE block_state_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_state_transition FORCE ROW LEVEL SECURITY;
ALTER TABLE slab_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_photo FORCE ROW LEVEL SECURITY;
ALTER TABLE slab_state_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_state_transition FORCE ROW LEVEL SECURITY;
ALTER TABLE block_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_reconciliation FORCE ROW LEVEL SECURITY;
ALTER TABLE machine_runtime_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_runtime_log FORCE ROW LEVEL SECURITY;
ALTER TABLE consumable_purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumable_purchase FORCE ROW LEVEL SECURITY;
ALTER TABLE consumable_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumable_usage_log FORCE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_line_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_line_item FORCE ROW LEVEL SECURITY;
ALTER TABLE expense_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_allocation FORCE ROW LEVEL SECURITY;
ALTER TABLE tally_ledger_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_ledger_entry FORCE ROW LEVEL SECURITY;
ALTER TABLE tally_voucher_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_voucher_item FORCE ROW LEVEL SECURITY;
ALTER TABLE tally_trial_balance_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_trial_balance_snapshot FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 3a. Direct-column policies (19) — compared as TEXT, no ::uuid cast.
--     Unset/empty app.current_factory_id -> NULLIF returns NULL ->
--     `factory_id = NULL` is never true -> zero rows (fail-closed).
-- ============================================================
CREATE POLICY tenant_isolation ON factory
  USING (id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON app_user
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON supplier
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON customer
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON machine
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON cutting_session
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON polishing_session
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON vehicle
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON raw_block
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON slab
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON daily_production_report
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON consumable
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON invoice
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON sales_order
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON daily_sales_summary
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON expense
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON tally_import_batch
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON inventory_snapshot
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON utility_reading
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

-- ============================================================
-- 3b. Child-table policies (16) — subquery through the verified parent FK.
-- ============================================================
CREATE POLICY tenant_isolation ON cutting_day_log
  USING (cutting_session_id IN (
    SELECT id FROM cutting_session
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON polishing_session_slab
  USING (polishing_session_id IN (
    SELECT id FROM polishing_session
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON raw_block_photo
  USING (raw_block_id IN (
    SELECT id FROM raw_block
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON block_state_transition
  USING (raw_block_id IN (
    SELECT id FROM raw_block
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON slab_photo
  USING (slab_id IN (
    SELECT id FROM slab
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON slab_state_transition
  USING (slab_id IN (
    SELECT id FROM slab
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON block_reconciliation
  USING (raw_block_id IN (
    SELECT id FROM raw_block
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON machine_runtime_log
  USING (machine_id IN (
    SELECT id FROM machine
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON consumable_purchase
  USING (consumable_id IN (
    SELECT id FROM consumable
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON consumable_usage_log
  USING (consumable_id IN (
    SELECT id FROM consumable
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

-- payment.invoice_id is NULLABLE. A payment row with a null invoice_id will
-- not match this subquery and will be invisible under RLS to the copilot
-- role. This is fail-closed (not a security hole) but is a real
-- completeness gap for Step 6B's Copilot answers — flagged in
-- REVIEW-REQUEST.md, not "fixed" by inventing a factory_id source that
-- doesn't exist on payment/invoice today.
CREATE POLICY tenant_isolation ON payment
  USING (invoice_id IN (
    SELECT id FROM invoice
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON sales_line_item
  USING (sales_order_id IN (
    SELECT id FROM sales_order
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON expense_allocation
  USING (expense_id IN (
    SELECT id FROM expense
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON tally_ledger_entry
  USING (tally_import_batch_id IN (
    SELECT id FROM tally_import_batch
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON tally_voucher_item
  USING (tally_import_batch_id IN (
    SELECT id FROM tally_import_batch
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));

CREATE POLICY tenant_isolation ON tally_trial_balance_snapshot
  USING (tally_import_batch_id IN (
    SELECT id FROM tally_import_batch
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));
