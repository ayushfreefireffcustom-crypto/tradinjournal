-- Additive only: creates the weekly-review opt-in table. No existing table is
-- touched, and in particular better-auth's "user" table is left alone.

-- CreateTable
CREATE TABLE "weekly_review_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribeToken" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_review_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_review_subscription_userId_key" ON "weekly_review_subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_review_subscription_unsubscribeToken_key" ON "weekly_review_subscription"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "weekly_review_subscription_enabled_lastSentAt_idx" ON "weekly_review_subscription"("enabled", "lastSentAt");
