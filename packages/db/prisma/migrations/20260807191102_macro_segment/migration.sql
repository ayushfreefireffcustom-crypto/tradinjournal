-- CreateEnum
CREATE TYPE "MacroMemberStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "macro_indicator" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(24,8) NOT NULL,
    "prev" DECIMAL(24,8),
    "forecast" DECIMAL(24,8),
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macro_market_quote" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "changePct" DECIMAL(12,6),
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_market_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bias_score" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "engineVer" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bias_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macro_member" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "exchangeUid" TEXT NOT NULL,
    "status" "MacroMemberStatus" NOT NULL DEFAULT 'PENDING',
    "plan" TEXT NOT NULL DEFAULT 'tradeai',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "macro_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macro_signal" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryLow" DECIMAL(24,8) NOT NULL,
    "entryHigh" DECIMAL(24,8) NOT NULL,
    "stop" DECIMAL(24,8) NOT NULL,
    "t1" DECIMAL(24,8) NOT NULL,
    "t2" DECIMAL(24,8) NOT NULL,
    "t3" DECIMAL(24,8) NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "invalidation" TEXT NOT NULL,
    "accountSize" DECIMAL(18,2) NOT NULL DEFAULT 100000,
    "qty" DECIMAL(24,8),
    "asOf" TIMESTAMP(3) NOT NULL,
    "engineVer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "macro_indicator_key_asOf_idx" ON "macro_indicator"("key", "asOf" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "macro_indicator_key_asOf_key" ON "macro_indicator"("key", "asOf");

-- CreateIndex
CREATE INDEX "macro_market_quote_symbol_asOf_idx" ON "macro_market_quote"("symbol", "asOf" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "macro_market_quote_symbol_asOf_key" ON "macro_market_quote"("symbol", "asOf");

-- CreateIndex
CREATE INDEX "bias_score_asset_asOf_idx" ON "bias_score"("asset", "asOf" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "macro_member_userId_key" ON "macro_member"("userId");

-- CreateIndex
CREATE INDEX "macro_member_status_idx" ON "macro_member"("status");

-- CreateIndex
CREATE INDEX "macro_signal_asset_asOf_idx" ON "macro_signal"("asset", "asOf" DESC);

