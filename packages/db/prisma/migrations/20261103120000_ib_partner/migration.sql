-- CreateEnum
CREATE TYPE "IbMethod" AS ENUM ('LIST', 'SHEET', 'API');

-- CreateEnum
CREATE TYPE "IbConnectionStatus" AS ENUM ('PENDING', 'OK', 'ERROR');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'NOT_FOUND', 'MANUAL_REVIEW', 'REJECTED', 'UNSUPPORTED_BROKER');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'GRACE', 'SUSPENDED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PartnerStatus" ADD VALUE 'NEEDS_INFO';
ALTER TYPE "PartnerStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "ReferralSource" ADD VALUE 'LATE_CODE';

-- AlterTable
ALTER TABLE "partner" ADD COLUMN     "audienceSize" TEXT,
ADD COLUMN     "brokers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pitch" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "socials" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "referral" ADD COLUMN     "pnl30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pnlTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "statsConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "strategy_template" ADD COLUMN     "partnerOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "partner_broker" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "ibId" TEXT,
    "method" "IbMethod" NOT NULL DEFAULT 'LIST',
    "sheetUrl" TEXT,
    "apiKey" TEXT,
    "serverMatch" TEXT,
    "status" "IbConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "accountCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_account" (
    "id" TEXT NOT NULL,
    "partnerBrokerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ib_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "broker" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "ibAccountId" TEXT,
    "brokerEmail" TEXT,
    "reason" TEXT,
    "signal" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "reviewRequestedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_package" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "perks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brokers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requireActive" BOOLEAN NOT NULL DEFAULT true,
    "accessDays" INTEGER,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_event" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "userId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_broker_partnerId_broker_key" ON "partner_broker"("partnerId", "broker");

-- CreateIndex
CREATE INDEX "ib_account_broker_accountId_idx" ON "ib_account"("broker", "accountId");

-- CreateIndex
CREATE INDEX "ib_account_broker_email_idx" ON "ib_account"("broker", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ib_account_partnerBrokerId_accountId_key" ON "ib_account"("partnerBrokerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "client_verification_brokerAccountId_key" ON "client_verification"("brokerAccountId");

-- CreateIndex
CREATE INDEX "client_verification_partnerId_status_idx" ON "client_verification"("partnerId", "status");

-- CreateIndex
CREATE INDEX "client_verification_status_updatedAt_idx" ON "client_verification"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "partner_package_partnerId_status_idx" ON "partner_package"("partnerId", "status");

-- CreateIndex
CREATE INDEX "client_entitlement_partnerId_status_idx" ON "client_entitlement"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_entitlement_userId_packageId_key" ON "client_entitlement"("userId", "packageId");

-- CreateIndex
CREATE INDEX "partner_event_partnerId_createdAt_idx" ON "partner_event"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_event_userId_createdAt_idx" ON "partner_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_event_kind_createdAt_idx" ON "partner_event"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "partner_broker" ADD CONSTRAINT "partner_broker_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ib_account" ADD CONSTRAINT "ib_account_partnerBrokerId_fkey" FOREIGN KEY ("partnerBrokerId") REFERENCES "partner_broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ib_account" ADD CONSTRAINT "ib_account_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_verification" ADD CONSTRAINT "client_verification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_verification" ADD CONSTRAINT "client_verification_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "broker_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_verification" ADD CONSTRAINT "client_verification_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_package" ADD CONSTRAINT "partner_package_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_entitlement" ADD CONSTRAINT "client_entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_entitlement" ADD CONSTRAINT "client_entitlement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_entitlement" ADD CONSTRAINT "client_entitlement_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "partner_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

