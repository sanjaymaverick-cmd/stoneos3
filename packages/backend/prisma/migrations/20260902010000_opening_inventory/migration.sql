-- CreateEnum
CREATE TYPE "FactoryOperatingStatus" AS ENUM ('SETUP', 'OPENING_COUNT_IN_PROGRESS', 'OPENING_PENDING_APPROVAL', 'LIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "OpeningSnapshotStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryKind" AS ENUM ('RAW_BLOCK', 'UNPOLISHED_SLAB', 'POLISHED_SLAB');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNED', 'CUSTOMER_OWNED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PHYSICALLY_COUNTED', 'ESTIMATED');

-- AlterTable
ALTER TABLE "factory" ADD COLUMN     "operating_status" "FactoryOperatingStatus" NOT NULL DEFAULT 'SETUP';

-- CreateTable
CREATE TABLE "opening_inventory_snapshot" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "count_date" DATE NOT NULL,
    "status" "OpeningSnapshotStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_inventory_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_inventory_line" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "inventory_kind" "InventoryKind" NOT NULL,
    "raw_block_id" TEXT,
    "slab_id" TEXT,
    "area_sqft" DECIMAL(12,2),
    "opening_value" DECIMAL(14,2),
    "location_id" TEXT NOT NULL,
    "ownership_type" "OwnershipType" NOT NULL DEFAULT 'OWNED',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PHYSICALLY_COUNTED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_inventory_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "opening_inventory_snapshot" ADD CONSTRAINT "opening_inventory_snapshot_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_inventory_line" ADD CONSTRAINT "opening_inventory_line_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "opening_inventory_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_inventory_line" ADD CONSTRAINT "opening_inventory_line_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_inventory_line" ADD CONSTRAINT "opening_inventory_line_slab_id_fkey" FOREIGN KEY ("slab_id") REFERENCES "slab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_inventory_line" ADD CONSTRAINT "opening_inventory_line_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Integrity constraints (hand-added)
-- ============================================================

-- A counted line is about EITHER a raw block OR a slab, matching the same
-- rule the movement ledger enforces.
ALTER TABLE "opening_inventory_line"
  ADD CONSTRAINT "opening_inventory_line_exactly_one_subject"
  CHECK (("raw_block_id" IS NULL) <> ("slab_id" IS NULL));

-- A raw block line must be RAW_BLOCK; a slab line must be one of the slab
-- kinds. Without this the guided flow could file a block under a slab step.
ALTER TABLE "opening_inventory_line"
  ADD CONSTRAINT "opening_inventory_line_kind_matches_subject"
  CHECK (
    ("raw_block_id" IS NOT NULL AND "inventory_kind" = 'RAW_BLOCK')
    OR ("slab_id" IS NOT NULL AND "inventory_kind" IN ('UNPOLISHED_SLAB', 'POLISHED_SLAB'))
  );

ALTER TABLE "opening_inventory_line"
  ADD CONSTRAINT "opening_inventory_line_positive_amounts"
  CHECK (
    ("area_sqft" IS NULL OR "area_sqft" > 0)
    AND ("opening_value" IS NULL OR "opening_value" >= 0)
  );

-- The same physical item cannot be counted twice in one snapshot.
CREATE UNIQUE INDEX "opening_inventory_line_snapshot_raw_block_key"
  ON "opening_inventory_line" ("snapshot_id", "raw_block_id")
  WHERE "raw_block_id" IS NOT NULL;
CREATE UNIQUE INDEX "opening_inventory_line_snapshot_slab_key"
  ON "opening_inventory_line" ("snapshot_id", "slab_id")
  WHERE "slab_id" IS NOT NULL;

-- At most ONE approved opening snapshot per factory. The opening count is the
-- moment the books start; a second approved one would mean two beginnings.
CREATE UNIQUE INDEX "opening_inventory_snapshot_one_approved_per_factory"
  ON "opening_inventory_snapshot" ("factory_id")
  WHERE "status" = 'APPROVED';

-- A rejected snapshot must say why.
ALTER TABLE "opening_inventory_snapshot"
  ADD CONSTRAINT "opening_inventory_snapshot_rejection_has_reason"
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- ============================================================
-- Row-Level Security (extends 20260713000000 and 20260902000000)
-- ============================================================
-- opening_inventory_snapshot carries factory_id directly. opening_inventory_line
-- does NOT — it is scoped through its parent snapshot, the same child-table
-- pattern section 3b of the Step 6A migration uses.
--
-- EXPECTED_RLS_TABLES in copilot-readiness.service.ts must list both.

GRANT SELECT ON opening_inventory_snapshot, opening_inventory_line TO stoneos_copilot_ro;

ALTER TABLE opening_inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_inventory_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE opening_inventory_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_inventory_line FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON opening_inventory_snapshot
  USING (factory_id = NULLIF(current_setting('app.current_factory_id', true), ''));

CREATE POLICY tenant_isolation ON opening_inventory_line
  USING (snapshot_id IN (
    SELECT id FROM opening_inventory_snapshot
    WHERE factory_id = NULLIF(current_setting('app.current_factory_id', true), '')
  ));
