-- CreateTable
CREATE TABLE "copilot_query_log" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "generated_sql" TEXT,
    "row_count" INTEGER,
    "answer" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_query_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "copilot_query_log" ADD CONSTRAINT "copilot_query_log_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
