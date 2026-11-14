-- MT5 reports deal times in the trade server's wall clock, not UTC.
-- Additive and nullable only: safe to apply before the code that uses it.
ALTER TABLE "broker_account" ADD COLUMN "serverTimeZone" TEXT;
ALTER TABLE "broker_account" ADD COLUMN "serverTimeShiftMin" INTEGER;
ALTER TABLE "broker_account" ADD COLUMN "serverOffsetMin" INTEGER;
ALTER TABLE "broker_account" ADD COLUMN "serverOffsetAt" TIMESTAMP(3);

-- Null = "dealTime is still raw server time": every existing row starts that way.
ALTER TABLE "execution" ADD COLUMN "serverOffsetMin" INTEGER;
