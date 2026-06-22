-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MarginMode" AS ENUM ('NETTING', 'HEDGING');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('BUY', 'SELL', 'BALANCE');

-- CreateEnum
CREATE TYPE "DealEntry" AS ENUM ('IN', 'OUT', 'INOUT', 'OUT_BY');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "mt5Login" BIGINT NOT NULL,
    "server" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "marginMode" "MarginMode" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "dealTicket" BIGINT NOT NULL,
    "orderTicket" BIGINT NOT NULL,
    "positionId" BIGINT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "DealType" NOT NULL,
    "entry" "DealEntry" NOT NULL,
    "volume" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "profit" DECIMAL(18,8) NOT NULL,
    "commission" DECIMAL(18,8) NOT NULL,
    "swap" DECIMAL(18,8) NOT NULL,
    "fee" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "dealTime" TIMESTAMP(3) NOT NULL,
    "magic" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "reason" INTEGER NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "tradeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3),
    "volume" DECIMAL(18,8) NOT NULL,
    "avgEntry" DECIMAL(18,8) NOT NULL,
    "avgExit" DECIMAL(18,8),
    "grossPnl" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "commission" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "netPnl" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "riskAmount" DECIMAL(18,8),
    "rMultiple" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_metric" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "mae" DECIMAL(18,8),
    "mfe" DECIMAL(18,8),
    "captureRate" DECIMAL(8,4),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_event" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "ticket" BIGINT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "comment" TEXT,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "dealsPulled" INTEGER NOT NULL DEFAULT 0,
    "tradesBuilt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "broker_account_userId_idx" ON "broker_account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "broker_account_mt5Login_server_key" ON "broker_account"("mt5Login", "server");

-- CreateIndex
CREATE UNIQUE INDEX "execution_dealTicket_key" ON "execution"("dealTicket");

-- CreateIndex
CREATE INDEX "execution_brokerAccountId_idx" ON "execution"("brokerAccountId");

-- CreateIndex
CREATE INDEX "execution_positionId_idx" ON "execution"("positionId");

-- CreateIndex
CREATE INDEX "execution_symbol_idx" ON "execution"("symbol");

-- CreateIndex
CREATE INDEX "execution_dealTime_idx" ON "execution"("dealTime");

-- CreateIndex
CREATE INDEX "trade_brokerAccountId_idx" ON "trade"("brokerAccountId");

-- CreateIndex
CREATE INDEX "trade_symbol_idx" ON "trade"("symbol");

-- CreateIndex
CREATE INDEX "trade_openTime_idx" ON "trade"("openTime");

-- CreateIndex
CREATE INDEX "trade_status_idx" ON "trade"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trade_metric_tradeId_key" ON "trade_metric"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "balance_event_ticket_key" ON "balance_event"("ticket");

-- CreateIndex
CREATE INDEX "balance_event_brokerAccountId_idx" ON "balance_event"("brokerAccountId");

-- CreateIndex
CREATE INDEX "sync_run_brokerAccountId_idx" ON "sync_run"("brokerAccountId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_account" ADD CONSTRAINT "broker_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution" ADD CONSTRAINT "execution_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "broker_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution" ADD CONSTRAINT "execution_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "broker_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_metric" ADD CONSTRAINT "trade_metric_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "broker_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
