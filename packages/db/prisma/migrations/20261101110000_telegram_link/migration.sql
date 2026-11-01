-- Additive only: two new tables for Telegram alerts (C6.2). No existing table changes.
CREATE TABLE "telegram_link" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_link_code" (
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_code_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX "telegram_link_userId_key" ON "telegram_link"("userId");
CREATE UNIQUE INDEX "telegram_link_chatId_key" ON "telegram_link"("chatId");
CREATE INDEX "telegram_link_code_userId_idx" ON "telegram_link_code"("userId");

ALTER TABLE "telegram_link" ADD CONSTRAINT "telegram_link_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_link_code" ADD CONSTRAINT "telegram_link_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
