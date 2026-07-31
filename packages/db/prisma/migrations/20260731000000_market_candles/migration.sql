-- CreateTable
CREATE TABLE "candle" (
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(18,8) NOT NULL,
    "low" DECIMAL(18,8) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "volume" DECIMAL(24,8) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "candle_pkey" PRIMARY KEY ("symbol","timeframe","openTime")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "userId" TEXT NOT NULL,
    "symbols" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "candle_symbol_timeframe_openTime_idx" ON "candle"("symbol", "timeframe", "openTime" DESC);
