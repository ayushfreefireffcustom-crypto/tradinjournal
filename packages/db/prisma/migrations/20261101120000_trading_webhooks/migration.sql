-- Additive only: two new tables for TradingView webhooks (D14, D15). No existing table changes.
CREATE TABLE "trading_webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretLast4" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "liveConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_webhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_webhook_event" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "alertId" TEXT,
    "payload" JSONB,
    "orderId" TEXT,

    CONSTRAINT "trading_webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trading_webhook_userId_key" ON "trading_webhook"("userId");
CREATE UNIQUE INDEX "trading_webhook_token_key" ON "trading_webhook"("token");
CREATE INDEX "trading_webhook_connectionId_idx" ON "trading_webhook"("connectionId");
CREATE INDEX "trading_webhook_event_webhookId_receivedAt_idx" ON "trading_webhook_event"("webhookId", "receivedAt");

ALTER TABLE "trading_webhook" ADD CONSTRAINT "trading_webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_webhook" ADD CONSTRAINT "trading_webhook_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_webhook_event" ADD CONSTRAINT "trading_webhook_event_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "trading_webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
