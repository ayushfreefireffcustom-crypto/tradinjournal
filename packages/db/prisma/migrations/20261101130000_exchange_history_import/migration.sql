-- Additive only: three nullable columns for the exchange trade-history import (D17, D18).
ALTER TABLE "exchange_fill" ADD COLUMN "positionAfter" DECIMAL(30,10);
ALTER TABLE "exchange_fill" ADD COLUMN "contractMultiplier" DECIMAL(30,12);
ALTER TABLE "exchange_connection" ADD COLUMN "historySyncedAt" TIMESTAMP(3);
