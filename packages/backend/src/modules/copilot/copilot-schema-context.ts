// Human-readable description of the queryable schema, sent to Gemini as
// part of the prompt so it can generate a SELECT against real table/column
// names. Hand-built from packages/backend/prisma/schema.prisma directly —
// not queried from information_schema at runtime — because the point is to
// carry the real business-meaning comments already in that file (recovery
// ratio, provisional-only fields, etc.), which a raw catalog dump can't do.
//
// Table selection (35 of the 39 stoneos_copilot_ro/RLS-protected tables —
// see the Step 6A, inventory-ledger and opening-inventory migrations for
// the full 39):
// excludes raw_block_photo and
// slab_photo (URL-only tables, no business content) and
// block_state_transition / slab_state_transition (internal append-only
// audit logs of state changes, not something a business question would
// target directly). Every other RLS-protected table is included — production,
// inventory, sales, expenses, vehicles, customers, machines, and Tally
// import data are all represented, per the brief's explicit instruction not
// to exclude anything a real business question could plausibly need.
//
// Column names below are the real Postgres (snake_case) column names, since
// this text describes what the generated SQL will run against directly via
// the stoneos_copilot_ro role — not the Prisma camelCase field names.
export const COPILOT_SCHEMA_CONTEXT = `
You are generating a single read-only SQL SELECT statement for a PostgreSQL
database belonging to a granite quarry/processing business (StoneOS). All
tables below are already scoped to the caller's own factory by a database
row-level-security policy applied automatically outside this query — you do
NOT need to (and must not) filter by any factory/tenant id column yourself.

TABLES AND COLUMNS:

factory(id, name, location, created_at)
  — One row per business/site. In practice the caller only ever sees their own row.

app_user(id, factory_id, name, email, role, active, created_at)
  — Staff accounts. role is one of: owner, manager, supervisor, operator, accountant, auditor, admin.

supplier(id, factory_id, name, contact_info, created_at)
  — Raw block suppliers.

customer(id, factory_id, name, contact_info, credit_limit, created_at)

machine(id, factory_id, name, machine_type, blade_count, head_count, abrasives_per_head, installed_date, created_at)
  — machine_type is 'cutting' (the gangsaw, e.g. "B-21") or 'polishing' (the LPM line).

raw_block(id, factory_id, serial_number, variety_name, supplier_id, weight_tons,
  purchase_date, invoiced_amount, actual_amount_paid, gst_rate, current_status,
  current_location, entry_source, cost_status, source_factory_id,
  transferred_from_block_id, reconciled_at, reconciled_by, location_id, created_at)
  — A purchased rough granite block. entry_source is 'purchase' | 'opening_balance' | 'transfer_in'.
  cost_status is 'pending' | 'estimated' | 'confirmed'.
  RECOVERY RATIO business rule: yield = (sum of sales_line_item.quantity for slabs whose
  parent_block_id = this block) / weight_tons. Benchmark is 105 sqft per ton — below is
  under-target yield, above is good efficiency. ALWAYS compute recovery ratio from
  sales_line_item.quantity (the real, sale-time measurement) — NEVER from slab.length_ft/width_ft,
  which are provisional production-stage estimates only (see slab table note below).

opening_inventory_snapshot(id, factory_id, count_date, status, created_by, submitted_by,
  submitted_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
  created_at, updated_at)
  — The factory's opening stock count: what was standing in the yard when the books
  started. status is DRAFT | SUBMITTED | APPROVED | REJECTED; at most one APPROVED row
  per factory, and approving it is what sets factory.operating_status = 'LIVE'.

opening_inventory_line(id, snapshot_id, inventory_kind, raw_block_id, slab_id, area_sqft,
  opening_value, location_id, ownership_type, verification_status, notes, created_at)
  — One counted item. Exactly one of raw_block_id / slab_id is set. inventory_kind is
  RAW_BLOCK | UNPOLISHED_SLAB | POLISHED_SLAB. ownership_type OWNED | CUSTOMER_OWNED —
  CUSTOMER_OWNED stock is physically present but NOT the factory's, so exclude it when
  valuing inventory. verification_status PHYSICALLY_COUNTED | ESTIMATED.

inventory_location(id, factory_id, code, name, location_type, active, created_at)
  — The physical places stock sits. code is a stable identifier: RAW_YARD, B21_QUEUE,
  B21_WIP, UNPOLISHED_STOCK, LPM_QUEUE, LPM_WIP, FINISHED_STOCK, HOLD, DELIVERED, in
  roughly that order of flow. raw_block.location_id and slab.location_id say where an
  item is RIGHT NOW; join here to name the place.

inventory_movement(id, factory_id, movement_type, occurred_at, raw_block_id, slab_id,
  from_location_id, to_location_id, quantity, area_sqft, reference_type, reference_id,
  reverses_movement_id, created_by, reason, idempotency_key, created_at)
  — APPEND-ONLY stock ledger: how an item got to where it is. Exactly one of
  raw_block_id / slab_id is set on every row. Rows are NEVER updated or deleted — a
  mistake is corrected by inserting a REVERSAL row whose reverses_movement_id points at
  the original, with from/to locations swapped.
  COUNTING RULE: when totalling movements, EXCLUDE rows that have been reversed and the
  REVERSAL rows themselves, or corrections get double-counted. A movement is reversed if
  another row's reverses_movement_id equals its id.
  movement_type is OPENING_RECEIPT | TRANSFER | PRODUCTION_ISSUE | PRODUCTION_COMPLETION |
  POLISHING_ISSUE | POLISHING_COMPLETION | SALES_RESERVATION | RESERVATION_RELEASE |
  RETURN | ADJUSTMENT | REVERSAL.
  For "where is stock now" questions prefer raw_block.location_id / slab.location_id;
  use this table for history and "how did it get there".

cutting_session(id, factory_id, raw_block_id, machine_id, started_at, ended_at, status,
  expected_slab_count, total_slabs_cut, final_good_slab_count, damaged_slab_count,
  wastage_notes, created_at, is_backfilled)
  — One block's run on the cutting machine (may span multiple days — see cutting_day_log).
  status is 'in_progress' | 'completed' | 'aborted'. final_good_slab_count is how many
  became real slab inventory rows; damaged_slab_count never enters inventory and should be
  costed at raw-block cost allocation, not finished-slab price, if valuing wastage.
  is_backfilled = true means this session was reconstructed at opening-balance intake
  (approximate dates/machine), not observed live — exclude or flag for throughput/runtime analytics.
  SIMPLIFIED SLAB REGISTRATION: total_slabs_cut and final_good_slab_count are entered as two
  totals at session completion (not one row per physical slab counted individually) — this is
  the source of truth for how many slabs a block produced, not a count of slab rows filtered
  some other way.

cutting_day_log(id, cutting_session_id, operational_date, runtime_hours, power_cut_minutes,
  downtime_minutes, downtime_reason, power_consumption_kwh, slabs_produced_count,
  operator_id, notes, created_at)
  — Per operational-day (7am-to-7am) detail within a cutting_session.

polishing_session(id, factory_id, machine_id, operational_date, stage, finish_type,
  slabs_polished_count, runtime_hours, power_consumption_kwh, downtime_minutes,
  downtime_reason, operator_id, notes, created_at, is_backfilled)
  — Same LPM machine runs two distinct process stages: stage is 'grinding' | 'polishing'
  (grinding happens first, then epoxy is applied manually — untracked — then polishing).
  finish_type is 'glossy' | 'leather' and only ever set when stage = 'polishing' (null for
  grinding rows). One session = one day's run on a batch of slabs for one stage (join
  polishing_session_slab for which specific slabs).

polishing_session_slab(id, polishing_session_id, slab_id)
  — Join table: which slabs went through which polishing session.

vehicle(id, factory_id, name, vehicle_type, purchase_date, retired_date, active, created_at)

slab(id, factory_id, parent_block_id, cutting_session_id, slab_serial, variety_name,
  thickness_mm, length_ft, width_ft, finish, quality_note, current_location,
  sales_status, location_id, created_at, is_backfilled)
  — parent_block_id is NULLABLE: slabs counted in the opening inventory predate this
  system and have no known parent block. Join to raw_block with a LEFT JOIN, never an
  inner one, or opening stock silently disappears from the result.
  — length_ft/width_ft are PROVISIONAL ONLY (a rough ~85% estimate set once at cutting
  completion, for yard/WIP tracking) — NEVER the authoritative area or basis for recovery
  ratio; the true sqft figure is sales_line_item.quantity, measured once at sale. quality_note
  is informational only (pricing/grading notes) — by business rule a slab that clears cutting
  and enters polishing is ALWAYS sellable once polished, regardless of any defect found during
  or after polishing, so quality_note must never be treated as excluding a slab from being
  sellable/in-stock. sales_status reflects current inventory state (e.g. in_stock / sold).

block_reconciliation(id, raw_block_id, field_name, old_value, new_value, reconciled_by,
  reconciled_at, notes)
  — Append-only correction log for estimated opening-balance figures on a raw_block
  (e.g. weight_tons, invoiced_amount corrected to a real number later).

machine_runtime_log(id, machine_id, log_date, runtime_minutes, downtime_minutes,
  downtime_reason, operator_id, power_consumption_kwh, blade_or_head_usage, created_at)

daily_production_report(id, factory_id, report_date, department, production_qty,
  production_value, machine_utilisation_pct, recovery_pct, rejection_pct, rework_pct,
  downtime_minutes, labour_hours, labour_headcount, raw_block_consumption,
  finished_slab_count, dispatch_qty, is_derived, manual_notes, created_at)
  — department is 'gangsaw' | 'polishing' | 'cutting'. Mostly DERIVED from
  cutting/polishing sessions going forward; is_derived=false rows are historical backfill.

consumable(id, factory_id, name, unit, created_at)
  — e.g. epoxy, abrasives, rollers, cotton, chemicals.

consumable_purchase(id, consumable_id, quantity, invoiced_amount, actual_amount_paid, purchase_date, created_at)

consumable_usage_log(id, consumable_id, machine_id, quantity_used, usage_date, created_at)

invoice(id, factory_id, customer_id, invoice_number, invoice_date, invoiced_amount, gst_amount, created_at)

payment(id, invoice_id, amount, payment_mode, payment_date, created_at)
  — payment_mode is 'bank' | 'cash' | 'cheque' | 'upi'. NOTE: invoice_id is nullable in the
  underlying schema; a payment with no invoice_id will not appear in results scoped through
  invoice, which is a known data-completeness caveat, not something to work around by inventing
  a join that doesn't exist.

sales_order(id, factory_id, customer_id, order_date, invoice_id, created_at)

sales_line_item(id, sales_order_id, slab_id, variety_name, quantity, unit_price, gst_amount,
  loading_charge, transport_charge, invoiced_amount, actual_amount_received, payment_type, created_at)
  — quantity here is the true, authoritative sqft sold for a slab (see raw_block's recovery
  ratio note). payment_type is 'invoiced' | 'cash' | 'mixed'.

daily_sales_summary(id, factory_id, summary_date, total_qty_sqft, invoiced_amount,
  actual_amount_received, is_derived, created_at)
  — Daily rollup; is_derived=false rows are historical backfill (pre-launch), true rows are
  computed from sales_line_item going forward.

expense(id, factory_id, category, vehicle_id, amount, to_whom, expense_date, created_at)
  — vehicle_id is only set when category = 'vehicle'.

expense_allocation(id, expense_id, raw_block_id, allocated_amount, allocation_method, created_at)
  — allocation_method is 'by_weight' | 'by_area' | 'manual'. How an expense's cost is spread
  across one or more raw blocks.

tally_import_batch(id, factory_id, source_file, import_date, period_start, period_end)
  — One row per imported Tally export file; join target for the tally_* tables below.

tally_ledger_entry(id, tally_import_batch_id, voucher_type, entry_date, account, debit, credit, narration)
  — Ledger-account-level detail from a Tally Day Book export.

tally_voucher_item(id, tally_import_batch_id, voucher_type, entry_date, stock_item_name, quantity, amount)
  — Stock-item-level detail from the same Tally Day Book export (different granularity than
  tally_ledger_entry — one row per stock item per voucher, not per ledger account line).

tally_trial_balance_snapshot(id, tally_import_batch_id, account, debit, credit)
  — A point-in-time Tally Trial Balance import.

inventory_snapshot(id, factory_id, snapshot_date, item_type, quantity_on_hand, value_on_hand,
  days_since_last_movement, created_at)
  — item_type is 'raw_block' | 'slab' | 'consumable'.

utility_reading(id, factory_id, reading_date, solar_generation_kwh, grid_export_kwh,
  grid_import_kwh, machine_consumption_kwh, power_cut_minutes, created_at)

RULES:
- Output ONLY the SQL statement itself. No markdown code fences, no explanation before or
  after, no multiple statements separated by semicolons.
- It must be a single SELECT statement (read-only). Never INSERT/UPDATE/DELETE/DDL/anything else.
- Do not filter by factory_id or any tenant id column — that scoping is applied automatically
  and outside your control; a manual filter would be redundant at best.
- Prefer a LIMIT clause for anything that could return a large number of rows.
`.trim();
