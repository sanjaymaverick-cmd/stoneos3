-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'manager', 'supervisor', 'operator', 'accountant', 'auditor', 'admin');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('invoiced', 'cash', 'mixed');

-- CreateTable
CREATE TABLE "factory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_info" TEXT,
    "credit_limit" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machine_type" TEXT NOT NULL,
    "blade_count" INTEGER,
    "head_count" INTEGER,
    "abrasives_per_head" INTEGER,
    "installed_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_session" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "raw_block_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "expected_slab_count" INTEGER,
    "total_slabs_cut" INTEGER,
    "final_good_slab_count" INTEGER,
    "damaged_slab_count" INTEGER,
    "wastage_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_day_log" (
    "id" TEXT NOT NULL,
    "cutting_session_id" TEXT NOT NULL,
    "operational_date" DATE NOT NULL,
    "runtime_hours" DECIMAL(4,2),
    "power_cut_minutes" INTEGER,
    "downtime_minutes" INTEGER,
    "downtime_reason" TEXT,
    "power_consumption_kwh" DECIMAL(10,2),
    "slabs_produced_count" INTEGER,
    "operator_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_day_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polishing_session" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "operational_date" DATE NOT NULL,
    "finish_type" TEXT NOT NULL,
    "slabs_polished_count" INTEGER,
    "runtime_hours" DECIMAL(4,2),
    "power_consumption_kwh" DECIMAL(10,2),
    "downtime_minutes" INTEGER,
    "downtime_reason" TEXT,
    "operator_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polishing_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polishing_session_slab" (
    "id" TEXT NOT NULL,
    "polishing_session_id" TEXT NOT NULL,
    "slab_id" TEXT NOT NULL,

    CONSTRAINT "polishing_session_slab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "purchase_date" DATE,
    "retired_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_block" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "variety_name" TEXT NOT NULL,
    "supplier_id" TEXT,
    "weight_tons" DECIMAL(10,3),
    "purchase_date" DATE,
    "invoiced_amount" DECIMAL(14,2),
    "actual_amount_paid" DECIMAL(14,2),
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "current_status" TEXT NOT NULL DEFAULT 'in_stock',
    "current_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_block_photo" (
    "id" TEXT NOT NULL,
    "raw_block_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_block_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_state_transition" (
    "id" TEXT NOT NULL,
    "raw_block_id" TEXT NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "machine_id" TEXT,
    "user_id" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_state_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slab" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "parent_block_id" TEXT NOT NULL,
    "cutting_session_id" TEXT,
    "slab_serial" TEXT NOT NULL,
    "variety_name" TEXT NOT NULL,
    "thickness_mm" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "length_ft" DECIMAL(6,2),
    "width_ft" DECIMAL(6,2),
    "finish" TEXT,
    "quality_note" TEXT,
    "current_location" TEXT,
    "sales_status" TEXT NOT NULL DEFAULT 'in_stock',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slab_photo" (
    "id" TEXT NOT NULL,
    "slab_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slab_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slab_state_transition" (
    "id" TEXT NOT NULL,
    "slab_id" TEXT NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "machine_id" TEXT,
    "user_id" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slab_state_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_runtime_log" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "runtime_minutes" INTEGER,
    "downtime_minutes" INTEGER,
    "downtime_reason" TEXT,
    "operator_id" TEXT,
    "power_consumption_kwh" DECIMAL(10,2),
    "blade_or_head_usage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_runtime_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_production_report" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "department" TEXT NOT NULL,
    "production_qty" DECIMAL(10,2),
    "production_value" DECIMAL(14,2),
    "machine_utilisation_pct" DECIMAL(5,2),
    "recovery_pct" DECIMAL(5,2),
    "rejection_pct" DECIMAL(5,2),
    "rework_pct" DECIMAL(5,2),
    "downtime_minutes" INTEGER,
    "labour_hours" DECIMAL(8,2),
    "labour_headcount" INTEGER,
    "raw_block_consumption" DECIMAL(10,3),
    "finished_slab_count" INTEGER,
    "dispatch_qty" DECIMAL(10,2),
    "is_derived" BOOLEAN NOT NULL DEFAULT true,
    "manual_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_production_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_purchase" (
    "id" TEXT NOT NULL,
    "consumable_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,2),
    "invoiced_amount" DECIMAL(14,2),
    "actual_amount_paid" DECIMAL(14,2),
    "purchase_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_usage_log" (
    "id" TEXT NOT NULL,
    "consumable_id" TEXT NOT NULL,
    "machine_id" TEXT,
    "quantity_used" DECIMAL(10,2),
    "usage_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "invoiced_amount" DECIMAL(14,2) NOT NULL,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_mode" TEXT,
    "payment_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_line_item" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "slab_id" TEXT,
    "variety_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loading_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transport_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiced_amount" DECIMAL(14,2),
    "actual_amount_received" DECIMAL(14,2),
    "payment_type" "PaymentType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sales_summary" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "summary_date" DATE NOT NULL,
    "total_qty_sqft" DECIMAL(12,2),
    "invoiced_amount" DECIMAL(14,2),
    "actual_amount_received" DECIMAL(14,2),
    "is_derived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_sales_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "to_whom" TEXT,
    "expense_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_allocation" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "raw_block_id" TEXT,
    "allocated_amount" DECIMAL(14,2) NOT NULL,
    "allocation_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_import_batch" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "source_file" TEXT,
    "import_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" DATE,
    "period_end" DATE,

    CONSTRAINT "tally_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_ledger_entry" (
    "id" TEXT NOT NULL,
    "tally_import_batch_id" TEXT NOT NULL,
    "voucher_type" TEXT,
    "entry_date" DATE,
    "account" TEXT,
    "debit" DECIMAL(14,2),
    "credit" DECIMAL(14,2),
    "narration" TEXT,

    CONSTRAINT "tally_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_trial_balance_snapshot" (
    "id" TEXT NOT NULL,
    "tally_import_batch_id" TEXT NOT NULL,
    "account" TEXT,
    "debit" DECIMAL(14,2),
    "credit" DECIMAL(14,2),

    CONSTRAINT "tally_trial_balance_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshot" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity_on_hand" DECIMAL(12,2),
    "value_on_hand" DECIMAL(14,2),
    "days_since_last_movement" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_reading" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "reading_date" DATE NOT NULL,
    "solar_generation_kwh" DECIMAL(10,2),
    "grid_export_kwh" DECIMAL(10,2),
    "grid_import_kwh" DECIMAL(10,2),
    "machine_consumption_kwh" DECIMAL(10,2),
    "power_cut_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_reading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cutting_day_log_cutting_session_id_operational_date_key" ON "cutting_day_log"("cutting_session_id", "operational_date");

-- CreateIndex
CREATE UNIQUE INDEX "polishing_session_slab_polishing_session_id_slab_id_key" ON "polishing_session_slab"("polishing_session_id", "slab_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_block_factory_id_serial_number_key" ON "raw_block"("factory_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "slab_factory_id_slab_serial_key" ON "slab"("factory_id", "slab_serial");

-- CreateIndex
CREATE UNIQUE INDEX "machine_runtime_log_machine_id_log_date_key" ON "machine_runtime_log"("machine_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_production_report_factory_id_report_date_department_key" ON "daily_production_report"("factory_id", "report_date", "department");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_factory_id_invoice_number_key" ON "invoice"("factory_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_summary_factory_id_summary_date_key" ON "daily_sales_summary"("factory_id", "summary_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_snapshot_factory_id_snapshot_date_item_type_key" ON "inventory_snapshot"("factory_id", "snapshot_date", "item_type");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine" ADD CONSTRAINT "machine_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_session" ADD CONSTRAINT "cutting_session_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_session" ADD CONSTRAINT "cutting_session_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_day_log" ADD CONSTRAINT "cutting_day_log_cutting_session_id_fkey" FOREIGN KEY ("cutting_session_id") REFERENCES "cutting_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polishing_session" ADD CONSTRAINT "polishing_session_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polishing_session_slab" ADD CONSTRAINT "polishing_session_slab_polishing_session_id_fkey" FOREIGN KEY ("polishing_session_id") REFERENCES "polishing_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polishing_session_slab" ADD CONSTRAINT "polishing_session_slab_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_block" ADD CONSTRAINT "raw_block_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_block" ADD CONSTRAINT "raw_block_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_block_photo" ADD CONSTRAINT "raw_block_photo_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_state_transition" ADD CONSTRAINT "block_state_transition_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_state_transition" ADD CONSTRAINT "block_state_transition_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab" ADD CONSTRAINT "slab_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab" ADD CONSTRAINT "slab_parent_block_id_fkey" FOREIGN KEY ("parent_block_id") REFERENCES "raw_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab" ADD CONSTRAINT "slab_cutting_session_id_fkey" FOREIGN KEY ("cutting_session_id") REFERENCES "cutting_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab_photo" ADD CONSTRAINT "slab_photo_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab_state_transition" ADD CONSTRAINT "slab_state_transition_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab_state_transition" ADD CONSTRAINT "slab_state_transition_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_runtime_log" ADD CONSTRAINT "machine_runtime_log_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_report" ADD CONSTRAINT "daily_production_report_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable" ADD CONSTRAINT "consumable_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_purchase" ADD CONSTRAINT "consumable_purchase_consumable_id_fkey" FOREIGN KEY ("consumable_id") REFERENCES "consumable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_usage_log" ADD CONSTRAINT "consumable_usage_log_consumable_id_fkey" FOREIGN KEY ("consumable_id") REFERENCES "consumable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_usage_log" ADD CONSTRAINT "consumable_usage_log_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_line_item" ADD CONSTRAINT "sales_line_item_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_line_item" ADD CONSTRAINT "sales_line_item_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales_summary" ADD CONSTRAINT "daily_sales_summary_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocation" ADD CONSTRAINT "expense_allocation_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocation" ADD CONSTRAINT "expense_allocation_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_import_batch" ADD CONSTRAINT "tally_import_batch_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_ledger_entry" ADD CONSTRAINT "tally_ledger_entry_tally_import_batch_id_fkey" FOREIGN KEY ("tally_import_batch_id") REFERENCES "tally_import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_trial_balance_snapshot" ADD CONSTRAINT "tally_trial_balance_snapshot_tally_import_batch_id_fkey" FOREIGN KEY ("tally_import_batch_id") REFERENCES "tally_import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshot" ADD CONSTRAINT "inventory_snapshot_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_reading" ADD CONSTRAINT "utility_reading_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
