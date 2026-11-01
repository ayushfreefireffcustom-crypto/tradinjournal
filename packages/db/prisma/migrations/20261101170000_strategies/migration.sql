-- Strategy builder (Part F): strategies, their versions and backtest runs. Additive.
CREATE TABLE "strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "spec" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "legacyId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "baselineBacktestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategy_version" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategy_backtest" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_backtest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strategy_legacyId_key" ON "strategy"("legacyId");
CREATE INDEX "strategy_userId_updatedAt_idx" ON "strategy"("userId", "updatedAt" DESC);
CREATE UNIQUE INDEX "strategy_version_strategyId_version_key" ON "strategy_version"("strategyId", "version");
CREATE INDEX "strategy_backtest_strategyId_createdAt_idx" ON "strategy_backtest"("strategyId", "createdAt" DESC);
CREATE INDEX "strategy_backtest_hash_idx" ON "strategy_backtest"("hash");

ALTER TABLE "strategy" ADD CONSTRAINT "strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_version" ADD CONSTRAINT "strategy_version_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_backtest" ADD CONSTRAINT "strategy_backtest_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
