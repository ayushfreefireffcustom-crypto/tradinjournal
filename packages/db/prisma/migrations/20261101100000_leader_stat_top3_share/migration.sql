-- Additive only: two nullable columns on leader_stat.
ALTER TABLE "leader_stat" ADD COLUMN "top3ProfitSharePct" DECIMAL(6,2);
ALTER TABLE "leader_stat" ADD COLUMN "closedTradeCount" INTEGER;
