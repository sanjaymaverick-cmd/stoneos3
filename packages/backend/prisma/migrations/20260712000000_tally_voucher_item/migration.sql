-- CreateTable
CREATE TABLE "tally_voucher_item" (
    "id" TEXT NOT NULL,
    "tally_import_batch_id" TEXT NOT NULL,
    "voucher_type" TEXT,
    "entry_date" DATE,
    "stock_item_name" TEXT,
    "quantity" DECIMAL(12,2),
    "amount" DECIMAL(14,2),

    CONSTRAINT "tally_voucher_item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tally_voucher_item" ADD CONSTRAINT "tally_voucher_item_tally_import_batch_id_fkey" FOREIGN KEY ("tally_import_batch_id") REFERENCES "tally_import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
