-- CreateTable
CREATE TABLE "usage_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "pagePath" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "usage_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "feature" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_session_userId_startedAt_idx" ON "usage_session"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "usage_session_lastSeenAt_idx" ON "usage_session"("lastSeenAt");

-- CreateIndex
CREATE INDEX "usage_event_userId_createdAt_idx" ON "usage_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_event_type_createdAt_idx" ON "usage_event"("type", "createdAt");

-- CreateIndex
CREATE INDEX "usage_event_feature_createdAt_idx" ON "usage_event"("feature", "createdAt");
