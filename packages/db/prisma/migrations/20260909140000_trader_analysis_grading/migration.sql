-- Triple-barrier grading + optional multi-lane breakdown on Trader Master analyses.
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "laneBreakdown" JSONB;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "hitLevel" TEXT;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "gradedAt" TIMESTAMP(3);
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "horizonBars" INTEGER;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "horizonTf" TEXT;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "mfePct" DOUBLE PRECISION;
ALTER TABLE "trader_analysis" ADD COLUMN IF NOT EXISTS "maePct" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "trader_analysis_outcome_asOf_idx" ON "trader_analysis"("outcome", "asOf");
