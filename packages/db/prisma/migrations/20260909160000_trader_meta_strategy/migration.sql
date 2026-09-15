-- Meta-label feature snapshot + confidence provenance on TraderAnalysis.
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "featureSnapshot" JSONB;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "confidenceSource" TEXT;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "rawConfidence" INTEGER;

-- Strategy builder (Phase 4): user-defined rules compiled from plain English.
CREATE TABLE IF NOT EXISTS "trader_strategy" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "lastBacktest" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trader_strategy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trader_strategy_userId_createdAt_idx" ON "trader_strategy"("userId", "createdAt" DESC);
