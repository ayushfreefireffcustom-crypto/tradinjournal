-- Part H marketplace: creators, strategy templates, subscriptions.
-- Additive only: one nullable column on "strategy" and three new tables.

ALTER TABLE "strategy" ADD COLUMN "templateId" TEXT;

CREATE TABLE "creator_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "experience" TEXT,
    "links" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "creator_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "creator_profile_userId_key" ON "creator_profile"("userId");
CREATE INDEX "creator_profile_status_idx" ON "creator_profile"("status");
ALTER TABLE "creator_profile" ADD CONSTRAINT "creator_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "strategy_template" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "strategyId" TEXT,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '[]',
    "exchanges" TEXT[],
    "symbols" TEXT[],
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "trackDeploymentId" TEXT,
    "performance" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strategy_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strategy_template_status_publishedAt_idx" ON "strategy_template"("status", "publishedAt");
CREATE INDEX "strategy_template_creatorId_idx" ON "strategy_template"("creatorId");
ALTER TABLE "strategy_template" ADD CONSTRAINT "strategy_template_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_template" ADD CONSTRAINT "strategy_template_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "template_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "strategyId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "template_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "template_subscription_deploymentId_key" ON "template_subscription"("deploymentId");
CREATE INDEX "template_subscription_userId_createdAt_idx" ON "template_subscription"("userId", "createdAt" DESC);
CREATE INDEX "template_subscription_templateId_status_idx" ON "template_subscription"("templateId", "status");
ALTER TABLE "template_subscription" ADD CONSTRAINT "template_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_subscription" ADD CONSTRAINT "template_subscription_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "strategy_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "template_subscription" ADD CONSTRAINT "template_subscription_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
