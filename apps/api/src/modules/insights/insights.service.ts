// Dashboard v2: loads an account's closed trades (rebuilt from stored MT5 deals),
// joins journal tags and the trade data (R from the stop at entry or a stored
// R-multiple, stop moves, MAE / MFE), and runs the pure compute.
// The whole payload is cached per account + query for 60s.
import { createHash } from 'node:crypto';
import type { DashboardAskDTO, DashboardAskInput, DashboardV2DTO, DashboardV2Query } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { listJournalEntries } from '../journal/journal.service.js';
import { applyFilters, computeDashboard, inWindow, tradeContext, windowFor, type InsightTrade } from './compute.js';
import { answerAsk } from './ask.js';
import { loadTradeExtras } from '../trade-data/trade-data.service.js';
import { rulesKey } from './rules.js';
import { rulesFor } from '../prefs/prefs.service.js';
import { balanceOpsOf } from './funding.js';

const TTL_S = 60;

export async function loadInsightTrades(userId: string, accountId: string) {
  const [data, journal] = await Promise.all([
    loadAccountData(userId, accountId),
    listJournalEntries(userId, accountId),
  ]);
  const positions = data.trades();
  // R from the stop at entry (or a stored R), stop moves and MAE/MFE (trade-data).
  const { extras } = await loadTradeExtras(data.account, positions);
  const tags = new Map<string, string[]>();
  for (const e of journal) if (e.tradeId && e.tags.length) tags.set(e.tradeId, [...new Set([...(tags.get(e.tradeId) ?? []), ...e.tags])]);
  const trades: InsightTrade[] = positions
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .map(t => {
      const open = new Date(t.openTime).getTime();
      const x = extras.get(t.positionId);
      return {
        id: t.positionId, symbol: t.symbol, side: t.direction, open, close: new Date(t.closeTime!).getTime(),
        volume: t.volume, net: t.netPnl, r: x?.r ?? null, mae: x?.mae ?? null, mfe: x?.mfe ?? null, tags: tags.get(t.positionId) ?? [],
        stopMove: x?.move ?? null,
      };
    });
  return { account: data.account, startingBalance: data.stats().startingBalance, balanceOps: balanceOpsOf(data.deals), trades };
}

const filtersOf = (q: DashboardV2Query) => ({ symbol: q.symbol, session: q.session, side: q.side, tag: q.tag });

export async function dashboardV2(userId: string, q: DashboardV2Query, now = Date.now()): Promise<DashboardV2DTO> {
  // Ownership is checked inside loadAccountData; the cache key is only used after it.
  const [{ account, startingBalance, balanceOps, trades }, rules] = await Promise.all([loadInsightTrades(userId, q.accountId), rulesFor(userId)]);
  const hash = createHash('sha1').update(JSON.stringify([q.range, q.from, q.to, q.symbol, q.session, q.side, q.tag, rulesKey(rules)])).digest('hex').slice(0, 16);
  const key = `insights:dash:v2:${account.id}:${account.dataVersion}:${hash}`;
  const hit = await cacheGet<DashboardV2DTO>(key);
  if (hit) return hit;
  const out = computeDashboard(trades, { now, window: windowFor(q.range, q.from, q.to, now), filters: filtersOf(q), startingBalance, balanceOps, rules });
  await cacheSet(key, out, TTL_S);
  return out;
}

export async function askJournal(userId: string, q: DashboardAskInput, now = Date.now()): Promise<DashboardAskDTO> {
  const { trades } = await loadInsightTrades(userId, q.accountId);
  const ctx = tradeContext(trades);
  const T = applyFilters(inWindow(trades, windowFor(q.range, q.from, q.to, now)), filtersOf(q)).sort((a, b) => a.close - b.close);
  return answerAsk(q.q, T, ctx);
}
