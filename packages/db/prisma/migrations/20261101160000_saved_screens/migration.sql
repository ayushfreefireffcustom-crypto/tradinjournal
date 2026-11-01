-- Saved screener definitions (E5). Additive: one new table.
CREATE TABLE "saved_screen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_screen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_screen_userId_idx" ON "saved_screen"("userId");

ALTER TABLE "saved_screen" ADD CONSTRAINT "saved_screen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
