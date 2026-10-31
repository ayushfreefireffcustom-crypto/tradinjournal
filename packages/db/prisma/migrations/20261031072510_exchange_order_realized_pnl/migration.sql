-- AlterTable
ALTER TABLE "exchange_order" ADD COLUMN     "realizedPnl" DECIMAL(20,2);

-- CreateIndex
CREATE INDEX "exchange_order_followId_filledAt_idx" ON "exchange_order"("followId", "filledAt");
