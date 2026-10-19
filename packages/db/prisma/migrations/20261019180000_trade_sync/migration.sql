-- Trade sync: store MT5 deals per account (Phase 1). Additive except the execution
-- ticket uniqueness, which moves from global to per-account (table is unused/empty until now).

-- DropIndex
DROP INDEX "execution_brokerAccountId_idx";

-- DropIndex
DROP INDEX "execution_dealTicket_key";

-- AlterTable
ALTER TABLE "broker_account" ADD COLUMN     "dataVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDealAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "syncLockedUntil" TIMESTAMP(3),
ADD COLUMN     "syncRetryAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "broker_account_lastSyncAt_idx" ON "broker_account"("lastSyncAt");

-- CreateIndex
CREATE INDEX "execution_brokerAccountId_dealTime_idx" ON "execution"("brokerAccountId", "dealTime");

-- CreateIndex
CREATE UNIQUE INDEX "execution_brokerAccountId_dealTicket_key" ON "execution"("brokerAccountId", "dealTicket");

