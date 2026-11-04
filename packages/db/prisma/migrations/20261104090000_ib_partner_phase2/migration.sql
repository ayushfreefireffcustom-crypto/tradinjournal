-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAYABLE', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "partner" ADD COLUMN     "payoutDetails" TEXT,
ADD COLUMN     "permissions" JSONB,
ADD COLUMN     "revenueSharePct" INTEGER;

-- AlterTable
ALTER TABLE "partner_broker" ADD COLUMN     "apiConfig" JSONB,
ADD COLUMN     "postbackToken" TEXT;

-- AlterTable
ALTER TABLE "ib_account" ADD COLUMN     "depositTotal" DOUBLE PRECISION,
ADD COLUMN     "lastTradeAt" TIMESTAMP(3),
ADD COLUMN     "lots30d" DOUBLE PRECISION,
ADD COLUMN     "lotsTotal" DOUBLE PRECISION,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "trades30d" INTEGER;

-- AlterTable
ALTER TABLE "client_verification" ADD COLUMN     "externalAccountId" TEXT,
ALTER COLUMN "brokerAccountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "partner_package" ADD COLUMN     "adminHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "periodDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "external_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_event" (
    "id" TEXT NOT NULL,
    "partnerBrokerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "accountId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broker_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_earning" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerBrokerId" TEXT NOT NULL,
    "accountId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ib_earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_product" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT,
    "content" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "fileData" BYTEA,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "paidAt" TIMESTAMP(3),
    "partnerShareCents" INTEGER NOT NULL DEFAULT 0,
    "platformShareCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_commission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentId" TEXT,
    "payoutId" TEXT,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "payableAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_account_userId_idx" ON "external_account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "external_account_platform_login_server_key" ON "external_account"("platform", "login", "server");

-- CreateIndex
CREATE INDEX "broker_event_partnerBrokerId_createdAt_idx" ON "broker_event"("partnerBrokerId", "createdAt");

-- CreateIndex
CREATE INDEX "ib_earning_partnerId_earnedAt_idx" ON "ib_earning"("partnerId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ib_earning_partnerBrokerId_externalId_key" ON "ib_earning"("partnerBrokerId", "externalId");

-- CreateIndex
CREATE INDEX "partner_product_partnerId_status_idx" ON "partner_product"("partnerId", "status");

-- CreateIndex
CREATE INDEX "partner_product_status_updatedAt_idx" ON "partner_product"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "package_subscription_partnerId_status_idx" ON "package_subscription"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "package_subscription_userId_packageId_key" ON "package_subscription"("userId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_providerOrderId_key" ON "payment"("providerOrderId");

-- CreateIndex
CREATE INDEX "payment_partnerId_createdAt_idx" ON "payment"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_commission_paymentId_key" ON "partner_commission"("paymentId");

-- CreateIndex
CREATE INDEX "partner_commission_partnerId_status_idx" ON "partner_commission"("partnerId", "status");

-- CreateIndex
CREATE INDEX "payout_partnerId_status_idx" ON "payout"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_broker_postbackToken_key" ON "partner_broker"("postbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "client_verification_externalAccountId_key" ON "client_verification"("externalAccountId");

-- AddForeignKey
ALTER TABLE "client_verification" ADD CONSTRAINT "client_verification_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "external_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_account" ADD CONSTRAINT "external_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_event" ADD CONSTRAINT "broker_event_partnerBrokerId_fkey" FOREIGN KEY ("partnerBrokerId") REFERENCES "partner_broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ib_earning" ADD CONSTRAINT "ib_earning_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ib_earning" ADD CONSTRAINT "ib_earning_partnerBrokerId_fkey" FOREIGN KEY ("partnerBrokerId") REFERENCES "partner_broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_product" ADD CONSTRAINT "partner_product_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_subscription" ADD CONSTRAINT "package_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_subscription" ADD CONSTRAINT "package_subscription_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_subscription" ADD CONSTRAINT "package_subscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "partner_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "package_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commission" ADD CONSTRAINT "partner_commission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commission" ADD CONSTRAINT "partner_commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commission" ADD CONSTRAINT "partner_commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

