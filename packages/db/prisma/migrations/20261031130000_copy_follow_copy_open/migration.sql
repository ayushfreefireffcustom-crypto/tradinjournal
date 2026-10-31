-- Additive only: one nullable column on copy_follow.
ALTER TABLE "copy_follow" ADD COLUMN "copyOpenRequestedAt" TIMESTAMP(3);
