// Dashboard v2: loads an account's closed trades (rebuilt from stored MT5 deals),
// joins journal tags and any stored R / MAE / MFE, and runs the pure compute.
// The whole payload is cached per account + query for 60s.
import { createHash } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import type { DashboardAskDTO, DashboardAskInput, DashboardV2DTO, DashboardV2Query } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { listJournalEntries } from '../journal/journal.service.js';
import { applyFilters, computeDashboard, inWindow, tradeContext, windowFor, type InsightTrade } from './compute.js';
import { answerAsk } from './ask.js';

const TTL_S = 60;
const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const tradeKey = (symbol: string, ms: number) => `${symbol}|${Math.floor(ms / 1000)}`;

/** Stored R-multiples and MAE/MFE (Trade / TradeMetric rows), keyed by symbol + open second. */
async function loadExtras(accountId: string): Promise<Map<string, { r: number | null; mae: number | null; mfe: number | null }>> {
  const rows = await prisma.trade.findMany({
    where: { brokerAccountId: accountId },
    select: { symbol: true, openTime: true, rMultiple: true, metric: { select: { mae: true, mfe: true } } },
  });
  return new Map(rows.map(r => [tradeKey(r.symbol, r.openTime.getTime()), { r: num(r.rMultiple), mae: num(r.metric?.mae), mfe: num(r.metric?.mfe) }]));
}

async function loadInsightTrades(userId: string, accountId: string) {
  const [data, journal, extras] = await Promise.all([
    loadAccountData(userId, accountId),
    listJournalEntries(userId, accountId),
    loadExtras(accountId),
  ]);
  const tags = new Map<string, string[]>();
  for (const e of journal) if (e.tradeId && e.tags.length) tags.set(e.tradeId, [...new Set([...(tags.get(e.tradeId) ?? []), ...e.tags])]);
  const trades: InsightTrade[] = data.trades()
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .map(t => {
      const open = new Date(t.openTime).getTime();
      const x = extras.get(tradeKey(t.symbol, open));
      return {
        id: t.positionId, symbol: t.symbol, side: t.direction, open, close: new Date(t.closeTime!).getTime(),
        volume: t.volume, net: t.netPnl, r: x?.r ?? null, mae: x?.mae ?? null, mfe: x?.mfe ?? null, tags: tags.get(t.positionId) ?? [],
      };
    });
  return { account: data.account, startingBalance: data.stats().startingBalance, trades };
}

const filtersOf = (q: DashboardV2Query) => ({ symbol: q.symbol, session: q.session, side: q.side, tag: q.tag });

export async function dashboardV2(userId: string, q: DashboardV2Query, now = Date.now()): Promise<DashboardV2DTO> {
  // Ownership is checked inside loadAccountData; the cache key is only used after it.
  const { account, startingBalance, trades } = await loadInsightTrades(userId, q.accountId);
  const hash = createHash('sha1').update(JSON.stringify([q.range, q.from, q.to, q.symbol, q.session, q.side, q.tag])).digest('hex').slice(0, 16);
  const key = `insights:dash:v1:${account.id}:${account.dataVersion}:${hash}`;
  const hit = await cacheGet<DashboardV2DTO>(key);
  if (hit) return hit;
  const out = computeDashboard(trades, { now, window: windowFor(q.range, q.from, q.to, now), filters: filtersOf(q), startingBalance });
  await cacheSet(key, out, TTL_S);
  return out;
}

export async function askJournal(userId: string, q: DashboardAskInput, now = Date.now()): Promise<DashboardAskDTO> {
  const { trades } = await loadInsightTrades(userId, q.accountId);
  const ctx = tradeContext(trades);
  const T = applyFilters(inWindow(trades, windowFor(q.range, q.from, q.to, now)), filtersOf(q)).sort((a, b) => a.close - b.close);
  return answerAsk(q.q, T, ctx);
}
