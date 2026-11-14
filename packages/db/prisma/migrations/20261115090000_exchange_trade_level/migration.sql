-- Additive only: stop loss / take profit levels for exchange (crypto) trades.
CREATE TABLE IF NOT EXISTS "exchange_trade_level" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "sl" DECIMAL(30,10),
  "tp" DECIMAL(30,10),
  "trail" DECIMAL(30,10),
  "source" TEXT NOT NULL,
  "exchangeOrderId" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_trade_level_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exchange_trade_level_connectionId_exchangeOrderId_observedA_key" ON "exchange_trade_level"("connectionId", "exchangeOrderId", "observedAt");
CREATE INDEX IF NOT EXISTS "exchange_trade_level_connectionId_symbol_observedAt_idx" ON "exchange_trade_level"("connectionId", "symbol", "observedAt");

DO $$ BEGIN
  ALTER TABLE "exchange_trade_level" ADD CONSTRAINT "exchange_trade_level_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
