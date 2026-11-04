// Refreshes each referred client's activity snapshot from their MT5 history, so the
// partner dashboards read plain columns instead of hitting the bridge per page view.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchTrades } from '../trades/trades.service.js';
import { nextActivity, snapshotFromTrades, type TradeLite } from './partner.logic.js';
import { syncConnected } from './partners.service.js';
import { isActiveTrader } from './ib/ib.logic.js';
import { getProgramSettings } from './ib/settings.js';
import { recomputeUser } from './ib/access.service.js';

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
      select: { id: true, userId: true, isActive: true, firstActiveAt: true, inactiveAt: true, attributedAt: true },
    });
    const rule = await getProgramSettings();
    for (const r of due) {
      const accounts = await prisma.brokerAccount.findMany({ where: { userId: r.userId }, select: { id: true } });
      // Accounts our bridge can't sync (MT4…) count through what the broker reports for them.
      const reported = await brokerReported(r.userId, now);
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
      const { lotsWindow, ...snap } = snapshotFromTrades(trades, rule.activeWindowDays, now.getTime(), r.attributedAt);
      const inWindow = reported.lastTradeAt && now.getTime() - reported.lastTradeAt.getTime() <= rule.activeWindowDays * 86_400_000;
      if (inWindow) {
        snap.tradeCount7d += reported.trades30d; snap.trades30d += reported.trades30d;
        snap.lots30d = Math.round((snap.lots30d + reported.lots30d) * 100) / 100;
        if (!snap.lastTradeAt || reported.lastTradeAt! > snap.lastTradeAt) snap.lastTradeAt = reported.lastTradeAt;
      }
      const flags = nextActivity(r, isActiveTrader({ tradesInWindow: snap.tradeCount7d, lotsInWindow: lotsWindow + (inWindow ? reported.lots30d : 0) }, rule), now);
      await prisma.referral.update({
        where: { id: r.id },
        data: { ...snap, ...flags, statsCheckedAt: now, statsError: errors.length ? errors[0]!.slice(0, 300) : null },
      });
      // Activity drives package access.
      if (flags.isActive !== r.isActive) await recomputeUser(r.userId, now);
      processed++;
    }
    if (due.length) logger.info('[partners] referral stats refreshed', { processed, failed });
    return { processed, failed, skipped: false };
  } finally {
    running = false;
  }
}

/** Activity the broker reported for this user's verified check-only accounts (MT4 and others). */
async function brokerReported(userId: string, now: Date): Promise<{ trades30d: number; lots30d: number; lastTradeAt: Date | null }> {
  const v = await prisma.clientVerification.findMany({ where: { userId, status: 'VERIFIED', externalAccountId: { not: null }, ibAccountId: { not: null } }, select: { ibAccountId: true } });
  if (!v.length) return { trades30d: 0, lots30d: 0, lastTradeAt: null };
  const rows = await prisma.ibAccount.findMany({ where: { id: { in: v.map(x => x.ibAccountId!) } }, select: { trades30d: true, lots30d: true, lastTradeAt: true } });
  const fresh = rows.filter(r => r.lastTradeAt && now.getTime() - r.lastTradeAt.getTime() <= 30 * 86_400_000);
  return {
    trades30d: fresh.reduce((n, r) => n + (r.trades30d ?? 0), 0),
    lots30d: fresh.reduce((n, r) => n + (r.lots30d ?? 0), 0),
    lastTradeAt: fresh.reduce<Date | null>((d, r) => (!d || r.lastTradeAt! > d ? r.lastTradeAt : d), null),
  };
}
