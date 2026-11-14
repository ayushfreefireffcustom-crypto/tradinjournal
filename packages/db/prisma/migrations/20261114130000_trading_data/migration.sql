-- Additive only: new tables + one nullable column.
ALTER TABLE "ai_conversation" ADD COLUMN IF NOT EXISTS "kind" TEXT;

CREATE TABLE IF NOT EXISTS "trade_level" (
  "id" TEXT NOT NULL,
  "brokerAccountId" TEXT NOT NULL,
  "positionId" BIGINT NOT NULL,
  "sl" DECIMAL(18,8),
  "tp" DECIMAL(18,8),
  "source" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trade_level_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trade_level_brokerAccountId_positionId_observedAt_idx" ON "trade_level"("brokerAccountId", "positionId", "observedAt");

CREATE TABLE IF NOT EXISTS "trade_excursion" (
  "id" TEXT NOT NULL,
  "brokerAccountId" TEXT NOT NULL,
  "positionId" BIGINT NOT NULL,
  "maePrice" DECIMAL(18,8) NOT NULL,
  "mfePrice" DECIMAL(18,8) NOT NULL,
  "maeMoney" DECIMAL(18,8),
  "mfeMoney" DECIMAL(18,8),
  "timeframe" TEXT NOT NULL,
  "bars" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trade_excursion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trade_excursion_brokerAccountId_positionId_key" ON "trade_excursion"("brokerAccountId", "positionId");

CREATE TABLE IF NOT EXISTS "trading_prefs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rules" JSONB NOT NULL DEFAULT '{}',
  "riskCapPct" DECIMAL(6,3) NOT NULL DEFAULT 2,
  "layouts" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trading_prefs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trading_prefs_userId_key" ON "trading_prefs"("userId");
