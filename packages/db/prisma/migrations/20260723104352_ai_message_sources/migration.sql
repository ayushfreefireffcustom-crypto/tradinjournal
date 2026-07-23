-- AI coach web search: persist citations + router lane on each message.
-- Additive only — both columns are nullable with no backfill, so existing rows
-- (and prod data on Neon) are untouched and remain valid.
ALTER TABLE "ai_message" ADD COLUMN "sources" JSONB;
ALTER TABLE "ai_message" ADD COLUMN "lane" TEXT;
