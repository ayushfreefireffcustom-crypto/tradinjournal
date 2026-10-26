-- Catch-up migration: brings a database built from migrations alone in line
-- with schema.prisma. Production (Neon) already has most of this from earlier
-- `db push` runs, so every statement is idempotent and safe to re-apply.

-- AlterTable
ALTER TABLE "broker_account" ADD COLUMN IF NOT EXISTS "password" TEXT;

-- AlterTable (DROP DEFAULT is a no-op when no default is set)
ALTER TABLE "trader_strategy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "journal_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "emotion" TEXT,
    "tags" TEXT[],
    "tradeId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "journal_entry_userId_idx" ON "journal_entry"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "journal_entry_brokerAccountId_idx" ON "journal_entry"("brokerAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "journal_entry_entryDate_idx" ON "journal_entry"("entryDate");
