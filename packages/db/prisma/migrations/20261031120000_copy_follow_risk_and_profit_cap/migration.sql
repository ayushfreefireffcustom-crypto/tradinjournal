-- Additive only: three nullable columns on copy_follow.
ALTER TABLE "copy_follow" ADD COLUMN "maxProfitUsd" DECIMAL(20,2);
ALTER TABLE "copy_follow" ADD COLUMN "riskAcceptedAt" TIMESTAMP(3);
ALTER TABLE "copy_follow" ADD COLUMN "riskVersion" TEXT;
