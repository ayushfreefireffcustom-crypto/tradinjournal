-- CreateEnum
CREATE TYPE "ExchangeVenue" AS ENUM ('DELTA_INDIA');

-- CreateEnum
CREATE TYPE "ExchangeEnvironment" AS ENUM ('TESTNET', 'LIVE');

-- CreateEnum
CREATE TYPE "ExchangeConnectionStatus" AS ENUM ('ACTIVE', 'INVALID', 'REVOKED');

-- CreateEnum
CREATE TYPE "CopyLeaderStatus" AS ENUM ('PENDING', 'VERIFIED', 'PAUSED', 'DELISTED');

-- CreateEnum
CREATE TYPE "CopyFollowStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "CopySizingMode" AS ENUM ('PROPORTIONAL', 'FIXED_NOTIONAL', 'MULTIPLIER');

-- CreateEnum
CREATE TYPE "ExchangeOrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "ExchangeOrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT_MARKET', 'TAKE_PROFIT_LIMIT');

-- CreateEnum
CREATE TYPE "ExchangeOrderStatus" AS ENUM ('PENDING', 'SUBMITTED', 'OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExchangeOrderSource" AS ENUM ('MANUAL', 'COPY', 'STRATEGY', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "PositionDirection" AS ENUM ('LONG', 'SHORT');

-- CreateTable
CREATE TABLE "exchange_connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" "ExchangeVenue" NOT NULL,
    "environment" "ExchangeEnvironment" NOT NULL,
    "label" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "apiSecretEnc" TEXT NOT NULL,
    "passphraseEnc" TEXT,
    "keyLast4" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "accountRef" TEXT,
    "canTrade" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExchangeConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_leader" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "status" "CopyLeaderStatus" NOT NULL DEFAULT 'PENDING',
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "maxFollowers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_leader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leader_equity_point" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "equityUsd" DECIMAL(20,2) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_equity_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leader_stat" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "roiPct" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "winRatePct" DECIMAL(6,2),
    "maxDrawdownPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "totalCopiedUsd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leader_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_follow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sizingMode" "CopySizingMode" NOT NULL DEFAULT 'PROPORTIONAL',
    "sizingValue" DECIMAL(20,8) NOT NULL DEFAULT 1,
    "leverage" INTEGER,
    "maxPositionUsd" DECIMAL(20,2),
    "dailyLossLimitUsd" DECIMAL(20,2),
    "copyReverse" BOOLEAN NOT NULL DEFAULT false,
    "residuals" JSONB NOT NULL DEFAULT '{}',
    "status" "CopyFollowStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leader_fill" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "ExchangeOrderSide" NOT NULL,
    "qty" DECIMAL(30,10) NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
    "positionAfter" DECIMAL(30,10),
    "exchTs" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "source" "ExchangeOrderSource" NOT NULL,
    "followId" TEXT,
    "leaderFillId" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "ExchangeOrderSide" NOT NULL,
    "type" "ExchangeOrderType" NOT NULL,
    "timeInForce" TEXT,
    "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
    "qty" DECIMAL(30,10) NOT NULL,
    "limitPrice" DECIMAL(30,10),
    "stopPrice" DECIMAL(30,10),
    "status" "ExchangeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "filledQty" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "avgFillPrice" DECIMAL(30,10),
    "leaderPrice" DECIMAL(30,10),
    "slippageBps" DECIMAL(12,4),
    "fees" DECIMAL(20,8),
    "errorCode" TEXT,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_position" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "followId" TEXT,
    "positionKey" TEXT NOT NULL,
    "source" "ExchangeOrderSource" NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "PositionDirection" NOT NULL,
    "qty" DECIMAL(30,10) NOT NULL,
    "avgEntry" DECIMAL(30,10) NOT NULL,
    "markPrice" DECIMAL(30,10),
    "unrealizedPnl" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "exchangeQty" DECIMAL(30,10),
    "driftDetectedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_fill" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderId" TEXT,
    "exchangeOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "ExchangeOrderSide" NOT NULL,
    "qty" DECIMAL(30,10) NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "fee" DECIMAL(20,8),
    "exchTs" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_fill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_connection_userId_status_idx" ON "exchange_connection"("userId", "status");

-- CreateIndex
CREATE INDEX "exchange_connection_exchange_environment_keyFingerprint_idx" ON "exchange_connection"("exchange", "environment", "keyFingerprint");

-- CreateIndex
CREATE INDEX "exchange_connection_exchange_environment_accountRef_idx" ON "exchange_connection"("exchange", "environment", "accountRef");

-- CreateIndex
CREATE UNIQUE INDEX "copy_leader_connectionId_key" ON "copy_leader"("connectionId");

-- CreateIndex
CREATE INDEX "copy_leader_status_listed_idx" ON "copy_leader"("status", "listed");

-- CreateIndex
CREATE INDEX "leader_equity_point_leaderId_ts_idx" ON "leader_equity_point"("leaderId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "leader_stat_leaderId_window_key" ON "leader_stat"("leaderId", "window");

-- CreateIndex
CREATE INDEX "copy_follow_leaderId_status_idx" ON "copy_follow"("leaderId", "status");

-- CreateIndex
CREATE INDEX "copy_follow_connectionId_idx" ON "copy_follow"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "copy_follow_userId_leaderId_key" ON "copy_follow"("userId", "leaderId");

-- CreateIndex
CREATE INDEX "leader_fill_leaderId_exchTs_idx" ON "leader_fill"("leaderId", "exchTs");

-- CreateIndex
CREATE INDEX "leader_fill_exchTs_idx" ON "leader_fill"("exchTs");

-- CreateIndex
CREATE UNIQUE INDEX "leader_fill_leaderId_externalId_key" ON "leader_fill"("leaderId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_order_clientOrderId_key" ON "exchange_order"("clientOrderId");

-- CreateIndex
CREATE INDEX "exchange_order_followId_requestedAt_idx" ON "exchange_order"("followId", "requestedAt");

-- CreateIndex
CREATE INDEX "exchange_order_connectionId_status_idx" ON "exchange_order"("connectionId", "status");

-- CreateIndex
CREATE INDEX "exchange_order_leaderFillId_idx" ON "exchange_order"("leaderFillId");

-- CreateIndex
CREATE INDEX "exchange_order_userId_requestedAt_idx" ON "exchange_order"("userId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_order_connectionId_exchangeOrderId_key" ON "exchange_order"("connectionId", "exchangeOrderId");

-- CreateIndex
CREATE INDEX "exchange_position_followId_idx" ON "exchange_position"("followId");

-- CreateIndex
CREATE INDEX "exchange_position_closedAt_idx" ON "exchange_position"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_position_connectionId_symbol_positionKey_key" ON "exchange_position"("connectionId", "symbol", "positionKey");

-- CreateIndex
CREATE INDEX "exchange_fill_connectionId_exchTs_idx" ON "exchange_fill"("connectionId", "exchTs");

-- CreateIndex
CREATE INDEX "exchange_fill_orderId_idx" ON "exchange_fill"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_fill_connectionId_externalId_key" ON "exchange_fill"("connectionId", "externalId");

-- AddForeignKey
ALTER TABLE "exchange_connection" ADD CONSTRAINT "exchange_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_leader" ADD CONSTRAINT "copy_leader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_leader" ADD CONSTRAINT "copy_leader_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_equity_point" ADD CONSTRAINT "leader_equity_point_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "copy_leader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_stat" ADD CONSTRAINT "leader_stat_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "copy_leader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_follow" ADD CONSTRAINT "copy_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_follow" ADD CONSTRAINT "copy_follow_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "copy_leader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_follow" ADD CONSTRAINT "copy_follow_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leader_fill" ADD CONSTRAINT "leader_fill_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "copy_leader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_order" ADD CONSTRAINT "exchange_order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_order" ADD CONSTRAINT "exchange_order_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_order" ADD CONSTRAINT "exchange_order_followId_fkey" FOREIGN KEY ("followId") REFERENCES "copy_follow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_order" ADD CONSTRAINT "exchange_order_leaderFillId_fkey" FOREIGN KEY ("leaderFillId") REFERENCES "leader_fill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_position" ADD CONSTRAINT "exchange_position_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_position" ADD CONSTRAINT "exchange_position_followId_fkey" FOREIGN KEY ("followId") REFERENCES "copy_follow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_fill" ADD CONSTRAINT "exchange_fill_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "exchange_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_fill" ADD CONSTRAINT "exchange_fill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "exchange_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
