-- Platform access control + admin tables

CREATE TYPE "AccessSource" AS ENUM ('MANUAL_GRANT', 'ELEFIN_VERIFIED');
CREATE TYPE "ElefinStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "ActivityStatus" AS ENUM ('UNKNOWN', 'ACTIVE', 'INACTIVE');

CREATE TABLE "access_grant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedByEmail" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_grant_email_key" ON "access_grant"("email");
CREATE INDEX "access_grant_revokedAt_idx" ON "access_grant"("revokedAt");

CREATE TABLE "user_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "AccessSource",
    "elefinStatus" "ElefinStatus" NOT NULL DEFAULT 'PENDING',
    "elefinUid" TEXT,
    "elefinVerifiedAt" TIMESTAMP(3),
    "activityStatus" "ActivityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "tradeCount7d" INTEGER NOT NULL DEFAULT 0,
    "activityCheckedAt" TIMESTAMP(3),
    "lastDeniedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_access_userId_key" ON "user_access"("userId");
CREATE INDEX "user_access_elefinStatus_idx" ON "user_access"("elefinStatus");
CREATE INDEX "user_access_activityStatus_idx" ON "user_access"("activityStatus");

CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt" DESC);
CREATE INDEX "admin_audit_log_actorId_idx" ON "admin_audit_log"("actorId");
