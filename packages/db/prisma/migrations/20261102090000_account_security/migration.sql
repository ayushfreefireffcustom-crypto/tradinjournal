-- Part H account work: profile phone, two-factor, tour state, activity log, feedback.
-- Additive only: three nullable/defaulted columns on "user" and three new tables.

ALTER TABLE "user" ADD COLUMN "phone" TEXT;
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "user" ADD COLUMN "tour" JSONB;

CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "userId" TEXT NOT NULL,
    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "two_factor_secret_idx" ON "two_factor"("secret");
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "activity_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "data" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activity_event_userId_at_idx" ON "activity_event"("userId", "at" DESC);
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "page" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedback_status_createdAt_idx" ON "feedback"("status", "createdAt");
CREATE INDEX "feedback_userId_createdAt_idx" ON "feedback"("userId", "createdAt");
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
