-- Phase 2: Economic Calendar + News + Notifications.
-- Additive only: new enums + tables + indexes. No existing table is touched
-- (better-auth "user" and all Phase 0/1 tables are left intact).

-- CreateEnum
CREATE TYPE "EventImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateTable
CREATE TABLE "economic_event" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT,
    "impact" "EventImpact" NOT NULL DEFAULT 'LOW',
    "eventTime" TIMESTAMP(3) NOT NULL,
    "actual" TEXT,
    "forecast" TEXT,
    "previous" TEXT,
    "unit" TEXT,
    "actualAt" TIMESTAMP(3),
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economic_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_item" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "sources" JSONB,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "country" TEXT,
    "category" "NewsCategory",
    "sentiment" "Sentiment",
    "relevance" INTEGER,
    "impact" "EventImpact",
    "marketMoving" BOOLEAN NOT NULL DEFAULT false,
    "enrichedAt" TIMESTAMP(3),
    "enrichHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "minImpact" "EventImpact" NOT NULL DEFAULT 'HIGH',
    "currencies" TEXT[],
    "categories" TEXT[],
    "leadMinutes" INTEGER NOT NULL DEFAULT 15,
    "newsAlerts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "eventId" TEXT,
    "newsId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "economic_event_dedupKey_key" ON "economic_event"("dedupKey");

-- CreateIndex
CREATE INDEX "economic_event_eventTime_idx" ON "economic_event"("eventTime");

-- CreateIndex
CREATE INDEX "economic_event_currency_eventTime_idx" ON "economic_event"("currency", "eventTime");

-- CreateIndex
CREATE INDEX "economic_event_impact_eventTime_idx" ON "economic_event"("impact", "eventTime");

-- CreateIndex
CREATE UNIQUE INDEX "news_item_dedupKey_key" ON "news_item"("dedupKey");

-- CreateIndex
CREATE INDEX "news_item_publishedAt_idx" ON "news_item"("publishedAt");

-- CreateIndex
CREATE INDEX "news_item_category_publishedAt_idx" ON "news_item"("category", "publishedAt");

-- CreateIndex
CREATE INDEX "news_item_impact_publishedAt_idx" ON "news_item"("impact", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");

-- CreateIndex
CREATE INDEX "event_watch_userId_idx" ON "event_watch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_watch_userId_eventId_key" ON "event_watch"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription"("userId");

-- CreateIndex
CREATE INDEX "notification_userId_createdAt_idx" ON "notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_dedupKey_channel_key" ON "notification_delivery"("dedupKey", "channel");

-- AddForeignKey
ALTER TABLE "event_watch" ADD CONSTRAINT "event_watch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "economic_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

