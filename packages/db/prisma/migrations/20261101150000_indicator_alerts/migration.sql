-- Additive only: two new tables for indicator alerts (E3, E4).
CREATE TABLE "indicator_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "left" JSONB NOT NULL,
    "operator" TEXT NOT NULL,
    "right" JSONB NOT NULL,
    "cooldownSec" INTEGER NOT NULL DEFAULT 3600,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "lastBarTime" TIMESTAMP(3),
    "lastLeft" DOUBLE PRECISION,
    "lastRight" DOUBLE PRECISION,
    "lastFiredAt" TIMESTAMP(3),
    "fireSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicator_alert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "indicator_alert_firing" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "barTime" TIMESTAMP(3) NOT NULL,
    "leftValue" DOUBLE PRECISION NOT NULL,
    "rightValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "indicator_alert_firing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "indicator_alert_status_symbol_timeframe_idx" ON "indicator_alert"("status", "symbol", "timeframe");
CREATE INDEX "indicator_alert_userId_idx" ON "indicator_alert"("userId");
CREATE INDEX "indicator_alert_firing_alertId_firedAt_idx" ON "indicator_alert_firing"("alertId", "firedAt");

ALTER TABLE "indicator_alert" ADD CONSTRAINT "indicator_alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "indicator_alert_firing" ADD CONSTRAINT "indicator_alert_firing_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "indicator_alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
