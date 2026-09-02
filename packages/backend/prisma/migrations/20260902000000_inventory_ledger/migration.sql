-- CreateEnum
CREATE TYPE "InventoryLocationType" AS ENUM ('RAW_YARD', 'B21_QUEUE', 'B21_WIP', 'UNPOLISHED_STOCK', 'LPM_QUEUE', 'LPM_WIP', 'FINISHED_STOCK', 'HOLD', 'DELIVERED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_RECEIPT', 'TRANSFER', 'PRODUCTION_ISSUE', 'PRODUCTION_COMPLETION', 'POLISHING_ISSUE', 'POLISHING_COMPLETION', 'SALES_RESERVATION', 'RESERVATION_RELEASE', 'RETURN', 'ADJUSTMENT', 'REVERSAL');

-- AlterTable
ALTER TABLE "raw_block" ADD COLUMN     "location_id" TEXT;

-- AlterTable
ALTER TABLE "slab" ADD COLUMN     "location_id" TEXT;

-- CreateTable
CREATE TABLE "inventory_location" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_type" "InventoryLocationType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_block_id" TEXT,
    "slab_id" TEXT,
    "from_location_id" TEXT,
    "to_location_id" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "area_sqft" DECIMAL(12,2),
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "reverses_movement_id" TEXT,
    "created_by" TEXT NOT NULL,
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_location_factory_id_code_key" ON "inventory_location"("factory_id", "code");

-- CreateIndex
CREATE INDEX "inventory_movement_factory_id_raw_block_id_idx" ON "inventory_movement"("factory_id", "raw_block_id");

-- CreateIndex
CREATE INDEX "inventory_movement_factory_id_slab_id_idx" ON "inventory_movement"("factory_id", "slab_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movement_factory_id_idempotency_key_key" ON "inventory_movement"("factory_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "raw_block" ADD CONSTRAINT "raw_block_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slab" ADD CONSTRAINT "slab_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory_location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory_location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_reverses_movement_id_fkey" FOREIGN KEY ("reverses_movement_id") REFERENCES "inventory_movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- Integrity constraints (hand-added — Prisma cannot express these)
-- ============================================================

-- A movement is about EITHER a raw block OR a slab, never both and never
-- neither. Without this the ledger can hold rows that describe nothing.
ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_exactly_one_subject"
  CHECK (("raw_block_id" IS NULL) <> ("slab_id" IS NULL));

-- Quantities are magnitudes; direction is carried by movement_type and the
-- from/to locations. A negative quantity would silently invert a movement.
ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_positive_quantity"
  CHECK ("quantity" > 0);

ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_positive_area"
  CHECK ("area_sqft" IS NULL OR "area_sqft" > 0);

-- A REVERSAL must name what it reverses; nothing else may.
ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_reversal_targets"
  CHECK (
    ("movement_type" = 'REVERSAL' AND "reverses_movement_id" IS NOT NULL)
    OR ("movement_type" <> 'REVERSAL' AND "reverses_movement_id" IS NULL)
  );

-- A movement must go somewhere or come from somewhere.
ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_has_direction"
  CHECK ("from_location_id" IS NOT NULL OR "to_location_id" IS NOT NULL);

-- ============================================================
-- Append-only enforcement
-- ============================================================
-- The ledger's audit value depends on rows never changing. Corrections are
-- made by INSERTing a REVERSAL that points at the original, never by editing
-- or deleting history. Enforced in the database so it holds even for a
-- direct psql session, not only for application code.
CREATE OR REPLACE FUNCTION inventory_movement_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'inventory_movement is append-only: use a REVERSAL row instead of % ', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movement_no_update
  BEFORE UPDATE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_append_only();

CREATE TRIGGER inventory_movement_no_delete
  BEFORE DELETE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_append_only();

-- ============================================================
-- Row-Level Security (extends migration 20260713000000)
-- ============================================================
-- Both new tables are tenant-scoped and carry their own factory_id, so they
-- take the same direct-column policy as the original 19. Compared as TEXT
-- with no ::uuid cast — see the note in 20260713000000's header. An unset
-- app.current_factory_id yields NULL, and `factory_id = NULL` is never true,
-- so the policy fails closed.
--
-- EXPECTED_RLS_TABLES in copilot-readiness.service.ts must list these two as
-- well, or the Copilot module will refuse to start.

-- ENABLE but deliberately not FORCE — the app owns these tables and is
-- exempt by ordinary Postgres semantics; the copilot role does not own
-- them and stays fully enforced. See the note in 20260713000000.
GRANT SELECT ON inventory_location, inventory_movement TO stoneos_copilot_ro;

ALTER TABLE inventory_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON inventory_location
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));
CREATE POLICY tenant_isolation ON inventory_movement
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));
