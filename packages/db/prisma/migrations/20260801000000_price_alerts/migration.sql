-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN "priceAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "price_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "accountId" TEXT,
    "direction" TEXT NOT NULL,
    "threshold" DECIMAL(18,8) NOT NULL,
    "lastPrice" DECIMAL(18,8),
    "status" TEXT NOT NULL DEFAULT 'active',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "fireSeq" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_alert_status_symbol_idx" ON "price_alert"("status", "symbol");

-- CreateIndex
CREATE INDEX "price_alert_userId_idx" ON "price_alert"("userId");
