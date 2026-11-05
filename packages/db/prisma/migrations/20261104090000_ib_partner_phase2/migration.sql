-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "partner" ADD COLUMN     "permissions" JSONB;

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

