-- CreateTable
CREATE TABLE "trader_analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "timeframes" TEXT[],
    "direction" TEXT NOT NULL,
    "entryLow" DECIMAL(24,8) NOT NULL,
    "entryHigh" DECIMAL(24,8) NOT NULL,
    "stop" DECIMAL(24,8) NOT NULL,
    "t1" DECIMAL(24,8) NOT NULL,
    "t2" DECIMAL(24,8) NOT NULL,
    "t3" DECIMAL(24,8) NOT NULL,
    "support" JSONB NOT NULL,
    "resistance" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "invalidation" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "perTimeframe" JSONB NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "asOf" TIMESTAMP(3) NOT NULL,
    "engineVer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trader_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trader_analysis_symbol_asOf_idx" ON "trader_analysis"("symbol", "asOf" DESC);

-- CreateIndex
CREATE INDEX "trader_analysis_userId_createdAt_idx" ON "trader_analysis"("userId", "createdAt" DESC);
