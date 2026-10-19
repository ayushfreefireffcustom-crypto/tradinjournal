-- Phase 3 perf: index for the usage heartbeat's open-session lookup.

-- CreateIndex
CREATE INDEX "usage_session_userId_endedAt_lastSeenAt_idx" ON "usage_session"("userId", "endedAt", "lastSeenAt");

