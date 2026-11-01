-- Strategy deployments (Part F): paper and live runs, their trades and activity. Additive.
CREATE TABLE "strategy_deployment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "connectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "capital" DOUBLE PRECISION NOT NULL,
    "sizeSchedule" JSONB NOT NULL DEFAULT '[]',
    "pauses" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastBarTime" TIMESTAMP(3),
    "error" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_deployment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deployment_trade" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitPrice" DOUBLE PRECISION NOT NULL,
    "exitTime" TIMESTAMP(3) NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,
    "pnlPct" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL,
    "rMultiple" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,

    CONSTRAINT "deployment_trade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deployment_event" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_deployment_userId_status_idx" ON "strategy_deployment"("userId", "status");
CREATE INDEX "strategy_deployment_status_mode_idx" ON "strategy_deployment"("status", "mode");
CREATE UNIQUE INDEX "deployment_trade_deploymentId_symbol_entryTime_key" ON "deployment_trade"("deploymentId", "symbol", "entryTime");
CREATE INDEX "deployment_trade_deploymentId_exitTime_idx" ON "deployment_trade"("deploymentId", "exitTime");
CREATE INDEX "deployment_event_deploymentId_at_idx" ON "deployment_event"("deploymentId", "at" DESC);

ALTER TABLE "strategy_deployment" ADD CONSTRAINT "strategy_deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_deployment" ADD CONSTRAINT "strategy_deployment_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_trade" ADD CONSTRAINT "deployment_trade_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "strategy_deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_event" ADD CONSTRAINT "deployment_event_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "strategy_deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
