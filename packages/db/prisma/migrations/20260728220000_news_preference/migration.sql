-- News-feed personalization: preferred outlet keys per user.
-- Additive only: one new table + its unique index. No existing table is touched.

-- CreateTable
CREATE TABLE "news_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sources" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_preference_userId_key" ON "news_preference"("userId");
