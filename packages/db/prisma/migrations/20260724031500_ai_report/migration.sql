-- Additive only: creates the AI narrative cache. No existing table is touched.

-- CreateTable
CREATE TABLE "ai_report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_report_userId_idx" ON "ai_report"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_report_userId_brokerAccountId_key" ON "ai_report"("userId", "brokerAccountId");
