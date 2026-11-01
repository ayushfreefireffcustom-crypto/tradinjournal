-- Additive only: an archive timestamp on notifications and per-group delivery
-- overrides on notification preferences. No existing data changes.
ALTER TABLE "notification" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "notification_preference" ADD COLUMN "groups" JSONB NOT NULL DEFAULT '{}';
