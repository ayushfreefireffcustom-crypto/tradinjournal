// Refreshes each referred client's activity snapshot from their MT5 history, so the
// partner dashboards read plain columns instead of hitting the bridge per page view.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchTrades } from '../trades/trades.service.js';
import { nextActivity, snapshotFromTrades, type TradeLite } from './partner.logic.js';
import { syncConnected } from './partners.service.js';

type FetchTrades = (userId: string, accountId: string) => Promise<TradeLite[]>;

let running = false;

/**
 * Refreshes the stalest connected referrals, oldest first. Sequential on purpose:
 * the MT5 bridge serialises on one terminal. A failed account leaves the previous
 * numbers in place and records the error.
 */
export async function refreshReferralStats(opts: { limit?: number; fetch?: FetchTrades; now?: Date } = {}): Promise<{ processed: number; failed: number; skipped: boolean }> {
  if (running) return { processed: 0, failed: 0, skipped: true };
  running = true;
  // Reads stored deals only; the trade-sync scheduler keeps them fresh.
  const fetch = opts.fetch ?? ((userId: string, accountId: string) => fetchTrades(userId, accountId, 'readonly'));
  const now = opts.now ?? new Date();
  let processed = 0, failed = 0;
  try {
    await syncConnected();
    const stale = new Date(now.getTime() - env.PARTNER_STATS_STALE_MIN * 60_000);
    const due = await prisma.referral.findMany({
      where: { connectedAt: { not: null }, OR: [{ statsCheckedAt: null }, { statsCheckedAt: { lt: stale } }] },
      orderBy: [{ statsCheckedAt: { sort: 'asc', nulls: 'first' } }],
      take: opts.limit ?? 25,
      select: { id: true, userId: true, isActive: true, firstActiveAt: true, inactiveAt: true },
    });
    for (const r of due) {
      const accounts = await prisma.brokerAccount.findMany({ where: { userId: r.userId }, select: { id: true } });
      const trades: TradeLite[] = [];
      const errors: string[] = [];
      for (const a of accounts) {
        try { trades.push(...await fetch(r.userId, a.id)); }
        catch (err) { errors.push(err instanceof Error ? err.message : String(err)); }
      }
      // Every account failed → keep the old numbers, just note the error.
      if (accounts.length && errors.length === accounts.length) {
        await prisma.referral.update({ where: { id: r.id }, data: { statsCheckedAt: now, statsError: errors[0]!.slice(0, 300) } });
        failed++;
        continue;
      }
      const snap = snapshotFromTrades(trades, env.ACCESS_ACTIVITY_WINDOW_DAYS, now.getTime());
      const flags = nextActivity(r, snap.tradeCount7d, env.ACCESS_MIN_TRADES_7D, now);
      await prisma.referral.update({
        where: { id: r.id },
        data: { ...snap, ...flags, statsCheckedAt: now, statsError: errors.length ? errors[0]!.slice(0, 300) : null },
      });
      processed++;
    }
    if (due.length) logger.info('[partners] referral stats refreshed', { processed, failed });
    return { processed, failed, skipped: false };
  } finally {
    running = false;
  }
}
