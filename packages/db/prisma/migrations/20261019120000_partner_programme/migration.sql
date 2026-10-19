-- Partner programme: referral tracking only (no commissions/payouts).
-- Additive: new enums + tables, one nullable column on "user". Safe to apply live.

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('LINK', 'CODE', 'ADMIN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "partner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "audience" TEXT,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_code" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_channel" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_click" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "channelId" TEXT,
    "code" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "country" TEXT,
    "referrer" TEXT,
    "convertedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_click_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "channelId" TEXT,
    "code" TEXT NOT NULL,
    "source" "ReferralSource" NOT NULL,
    "clickId" TEXT,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "firstActiveAt" TIMESTAMP(3),
    "inactiveAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tradeCount7d" INTEGER NOT NULL DEFAULT 0,
    "trades30d" INTEGER NOT NULL DEFAULT 0,
    "lots30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastTradeAt" TIMESTAMP(3),
    "statsCheckedAt" TIMESTAMP(3),
    "statsError" TEXT,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_note" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserved_partner_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserved_partner_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_userId_key" ON "partner"("userId");

-- CreateIndex
CREATE INDEX "partner_status_idx" ON "partner"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_code_code_key" ON "partner_code"("code");

-- CreateIndex
CREATE INDEX "partner_code_partnerId_idx" ON "partner_code"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_channel_partnerId_slug_key" ON "partner_channel"("partnerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "referral_click_convertedUserId_key" ON "referral_click"("convertedUserId");

-- CreateIndex
CREATE INDEX "referral_click_partnerId_createdAt_idx" ON "referral_click"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_click_ipHash_createdAt_idx" ON "referral_click"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referral_userId_key" ON "referral"("userId");

-- CreateIndex
CREATE INDEX "referral_partnerId_attributedAt_idx" ON "referral"("partnerId", "attributedAt");

-- CreateIndex
CREATE INDEX "referral_statsCheckedAt_idx" ON "referral"("statsCheckedAt");

-- CreateIndex
CREATE INDEX "partner_note_partnerId_createdAt_idx" ON "partner_note"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reserved_partner_code_code_key" ON "reserved_partner_code"("code");

-- AddForeignKey
ALTER TABLE "partner" ADD CONSTRAINT "partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_code" ADD CONSTRAINT "partner_code_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_channel" ADD CONSTRAINT "partner_channel_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_click" ADD CONSTRAINT "referral_click_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_click" ADD CONSTRAINT "referral_click_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "partner_channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "partner_channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_note" ADD CONSTRAINT "partner_note_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

