-- Paper book for promoted Trader Master strategies. Educational fills only.
CREATE TABLE IF NOT EXISTS "trader_paper_position" (
  "id" TEXT NOT NULL,
  "strategyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "entry" DECIMAL(24,8) NOT NULL,
  "stop" DECIMAL(24,8) NOT NULL,
  "target" DECIMAL(24,8) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "entryBarTime" TIMESTAMP(3) NOT NULL,
  "exit" DECIMAL(24,8),
  "exitBarTime" TIMESTAMP(3),
  "mfePct" DOUBLE PRECISION,
  "maePct" DOUBLE PRECISION,
  "pnlPct" DOUBLE PRECISION,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "trader_paper_position_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trader_paper_position_strategyId_symbol_entryBarTime_key"
  ON "trader_paper_position"("strategyId", "symbol", "entryBarTime");
CREATE INDEX IF NOT EXISTS "trader_paper_position_status_strategyId_idx"
  ON "trader_paper_position"("status", "strategyId");
CREATE INDEX IF NOT EXISTS "trader_paper_position_userId_openedAt_idx"
  ON "trader_paper_position"("userId", "openedAt" DESC);

CREATE INDEX IF NOT EXISTS "trader_strategy_status_idx" ON "trader_strategy"("status");
