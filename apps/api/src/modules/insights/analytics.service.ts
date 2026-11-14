// Analytics v2: loads an account's closed trades (rebuilt from stored MT5 deals)
// with journal tags + emotion and the trade data (R, stop moves, MAE / MFE), then runs the pure
// compute in analytics-compute.ts. The whole payload is cached per account +
// data version + query for 60s, like the dashboard.
import { createHash } from 'node:crypto';
import type { AnalyticsV2DTO, AnalyticsV2Query } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { listJournalEntries } from '../journal/journal.service.js';
import { windowFor } from './compute.js';
import { computeAnalytics, type AnalyticsTrade } from './analytics-compute.js';
import { loadTradeExtras } from '../trade-data/trade-data.service.js';
import { rulesKey } from './rules.js';
import { rulesFor } from '../prefs/prefs.service.js';

const TTL_S = 60;
async function loadAnalyticsTrades(userId: string, accountId: string, data: Awaited<ReturnType<typeof loadAccountData>>) {
  const positions = data.trades();
  // R from the stop at entry (or a stored R), stop moves and MAE/MFE (trade-data).
  const [journal, { extras }] = await Promise.all([listJournalEntries(userId, accountId), loadTradeExtras(data.account, positions)]);
  const tags = new Map<string, string[]>();
  const emotion = new Map<string, string>();
  for (const e of journal) {
    if (!e.tradeId) continue;
    if (e.tags.length) tags.set(e.tradeId, [...new Set([...(tags.get(e.tradeId) ?? []), ...e.tags])]);
    // Entries come newest first: keep the latest emotion logged for the trade.
    if (e.emotion && !emotion.has(e.tradeId)) emotion.set(e.tradeId, e.emotion);
  }
  const trades: AnalyticsTrade[] = positions
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .map(t => {
      const open = new Date(t.openTime).getTime();
      const x = extras.get(t.positionId);
      return {
        id: t.positionId, symbol: t.symbol, side: t.direction, open, close: new Date(t.closeTime!).getTime(),
        volume: t.volume, net: t.netPnl, r: x?.r ?? null, mae: x?.mae ?? null, mfe: x?.mfe ?? null,
        tags: tags.get(t.positionId) ?? [], emotion: emotion.get(t.positionId) ?? null, stopMove: x?.move ?? null,
      };
    });
  return { startingBalance: data.stats().startingBalance, trades };
}

export async function analyticsV2(userId: string, q: AnalyticsV2Query, now = Date.now()): Promise<AnalyticsV2DTO> {
  // Ownership is checked inside loadAccountData (throws for someone else's account); the cache key is only used after it.
  const [data, rules] = await Promise.all([loadAccountData(userId, q.accountId), rulesFor(userId)]);
  const hash = createHash('sha1').update(JSON.stringify([q.range, q.from, q.to, q.symbol, q.session, q.side, q.tag, rulesKey(rules)])).digest('hex').slice(0, 16);
  const key = `insights:ana:v1:${data.account.id}:${data.account.dataVersion}:${hash}`;
  const hit = await cacheGet<AnalyticsV2DTO>(key);
  if (hit) return hit;
  const { startingBalance, trades } = await loadAnalyticsTrades(userId, q.accountId, data);
  const out = computeAnalytics(trades, {
    now, window: windowFor(q.range, q.from, q.to, now), startingBalance, rules,
    filters: { symbol: q.symbol, session: q.session, side: q.side, tag: q.tag },
  });
  await cacheSet(key, out, TTL_S);
  return out;
}
