-- Named watchlists (QW.12). Additive: one new table. The old one-row-per-user
-- "watchlist" table is left untouched; the API copies a user's row into a list
-- the first time they read their lists.
CREATE TABLE "watchlist_list" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbols" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_list_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watchlist_list_userId_name_key" ON "watchlist_list"("userId", "name");

CREATE INDEX "watchlist_list_userId_position_idx" ON "watchlist_list"("userId", "position");

ALTER TABLE "watchlist_list" ADD CONSTRAINT "watchlist_list_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
