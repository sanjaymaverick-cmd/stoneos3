-- AlterTable
ALTER TABLE "cutting_session" ADD COLUMN     "is_backfilled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "polishing_session" ADD COLUMN     "is_backfilled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "raw_block" ADD COLUMN     "cost_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "entry_source" TEXT NOT NULL DEFAULT 'purchase',
ADD COLUMN     "reconciled_at" TIMESTAMP(3),
ADD COLUMN     "reconciled_by" TEXT,
ADD COLUMN     "source_factory_id" TEXT,
ADD COLUMN     "transferred_from_block_id" TEXT;

-- AlterTable
ALTER TABLE "slab" ADD COLUMN     "is_backfilled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "block_reconciliation" (
    "id" TEXT NOT NULL,
    "raw_block_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "reconciled_by" TEXT NOT NULL,
    "reconciled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "block_reconciliation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "raw_block" ADD CONSTRAINT "raw_block_source_factory_id_fkey" FOREIGN KEY ("source_factory_id") REFERENCES "factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_block" ADD CONSTRAINT "raw_block_transferred_from_block_id_fkey" FOREIGN KEY ("transferred_from_block_id") REFERENCES "raw_block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_reconciliation" ADD CONSTRAINT "block_reconciliation_raw_block_id_fkey" FOREIGN KEY ("raw_block_id") REFERENCES "raw_block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every block already carrying a real invoiced_amount is
-- explicitly a confirmed purchase — so historical data isn't
-- accidentally treated as estimated/opening-balance by default.
UPDATE raw_block
SET entry_source = 'purchase', cost_status = 'confirmed'
WHERE invoiced_amount IS NOT NULL;
