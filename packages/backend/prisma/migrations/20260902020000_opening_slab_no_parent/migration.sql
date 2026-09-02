-- Opening-inventory slabs have no parent block.
--
-- Stock counted when a factory goes live predates this system: those slabs
-- were cut before StoneOS existed, so their parent block genuinely is unknown
-- rather than missing by mistake. Recording a fake parent would corrupt the
-- recovery-ratio report, which divides sold sqft by the parent block's tonnage.
--
-- Slabs produced BY this system (CuttingSession.complete) still always set it;
-- only the opening-count path leaves it null. Widening NOT NULL to nullable
-- cannot fail on existing rows.

-- DropForeignKey
ALTER TABLE "slab" DROP CONSTRAINT "slab_parent_block_id_fkey";

-- AlterTable
ALTER TABLE "slab" ALTER COLUMN "parent_block_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "slab" ADD CONSTRAINT "slab_parent_block_id_fkey" FOREIGN KEY ("parent_block_id") REFERENCES "raw_block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

