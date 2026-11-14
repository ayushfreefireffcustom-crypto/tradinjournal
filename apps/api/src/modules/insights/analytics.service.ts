// Analytics v2: loads an account's closed trades (rebuilt from stored MT5 deals)
// with journal tags + emotion and any stored R / MAE / MFE, then runs the pure
// compute in analytics-compute.ts. The whole payload is cached per account +
// data version + query for 60s, like the dashboard.
import { createHash } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import type { AnalyticsV2DTO, AnalyticsV2Query } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { listJournalEntries } from '../journal/journal.service.js';
import { windowFor } from './compute.js';
import { computeAnalytics, type AnalyticsTrade } from './analytics-compute.js';

const TTL_S = 60;
const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const tradeKey = (symbol: string, ms: number) => `${symbol}|${Math.floor(ms / 1000)}`;

async function loadExtras(accountId: string) {
  const rows = await prisma.trade.findMany({
    where: { brokerAccountId: accountId },
    select: { symbol: true, openTime: true, rMultiple: true, metric: { select: { mae: true, mfe: true } } },
  });
  return new Map(rows.map(r => [tradeKey(r.symbol, r.openTime.getTime()), { r: num(r.rMultiple), mae: num(r.metric?.mae), mfe: num(r.metric?.mfe) }]));
}

async function loadAnalyticsTrades(userId: string, accountId: string, data: Awaited<ReturnType<typeof loadAccountData>>) {
  const [journal, extras] = await Promise.all([listJournalEntries(userId, accountId), loadExtras(accountId)]);
  const tags = new Map<string, string[]>();
  const emotion = new Map<string, string>();
  for (const e of journal) {
    if (!e.tradeId) continue;
    if (e.tags.length) tags.set(e.tradeId, [...new Set([...(tags.get(e.tradeId) ?? []), ...e.tags])]);
    // Entries come newest first: keep the latest emotion logged for the trade.
    if (e.emotion && !emotion.has(e.tradeId)) emotion.set(e.tradeId, e.emotion);
  }
  const trades: AnalyticsTrade[] = data.trades()
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .map(t => {
      const open = new Date(t.openTime).getTime();
      const x = extras.get(tradeKey(t.symbol, open));
      return {
        id: t.positionId, symbol: t.symbol, side: t.direction, open, close: new Date(t.closeTime!).getTime(),
        volume: t.volume, net: t.netPnl, r: x?.r ?? null, mae: x?.mae ?? null, mfe: x?.mfe ?? null,
        tags: tags.get(t.positionId) ?? [], emotion: emotion.get(t.positionId) ?? null,
      };
    });
  return { startingBalance: data.stats().startingBalance, trades };
}

export async function analyticsV2(userId: string, q: AnalyticsV2Query, now = Date.now()): Promise<AnalyticsV2DTO> {
  // Ownership is checked inside loadAccountData (throws for someone else's account); the cache key is only used after it.
  const data = await loadAccountData(userId, q.accountId);
  const hash = createHash('sha1').update(JSON.stringify([q.range, q.from, q.to, q.symbol, q.session, q.side, q.tag])).digest('hex').slice(0, 16);
  const key = `insights:ana:v1:${data.account.id}:${data.account.dataVersion}:${hash}`;
  const hit = await cacheGet<AnalyticsV2DTO>(key);
  if (hit) return hit;
  const { startingBalance, trades } = await loadAnalyticsTrades(userId, q.accountId, data);
  const out = computeAnalytics(trades, {
    now, window: windowFor(q.range, q.from, q.to, now), startingBalance,
    filters: { symbol: q.symbol, session: q.session, side: q.side, tag: q.tag },
  });
  await cacheSet(key, out, TTL_S);
  return out;
}
