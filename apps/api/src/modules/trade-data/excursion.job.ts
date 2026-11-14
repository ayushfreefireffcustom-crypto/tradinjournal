// Background job: MAE / MFE for closed positions that don't have a
// trade_excursion row yet. Runs on the in-process scheduler (leader only),
// every 5 minutes, at most MAX_PER_RUN positions per run, newest trades first,
// accounts round-robin so one big account can't starve the rest.
//
// Candles come through the market service (the account's MT5 feed when the
// account is usable, else the public feed), the same path as the trade log's
// mini price paths. A symbol with no feed is remembered for NO_FEED_TTL_S and
// a trade whose candles don't match it (another instrument, or no history
// that far back) for MISS_TTL_S, in the shared cache, so neither is retried
// every run. No new tables.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { MarketTimeframe } from '@tradinjournal/contracts';
import type { Trade } from '@tradinjournal/types';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { usableAccountsWhere } from '../../lib/broker-policy.js';
import { loadAccountData } from '../sync/account-data.js';
import { getCandles } from '../market/market.service.js';
import { computeExcursion, EXC_TFS, excursionMoney, excursionTf, MAX_BARS, type ExcCandle } from './excursion.js';
import { pointValues } from './point-value.js';
import { available, bumpDataVersion, excursionIds, upsertExcursion } from './store.js';

export const MAX_PER_RUN = 60;
const CONCURRENCY = 2;
const NO_FEED_TTL_S = 6 * 3600;
const MISS_TTL_S = 7 * 86_400;
/** Coarser timeframes tried when the finest one has no bars (deep 1m history is often missing). */
const FALLBACK_STEPS = 2;

export type CandleFetch = (q: { symbol: string; tf: MarketTimeframe; accountId: string; from: number; to: number; limit: number }, userId: string) => Promise<ExcCandle[]>;
const defaultFetch: CandleFetch = async (q, userId) => (await getCandles(q, userId)).candles;

const noFeedKey = (accountId: string, symbol: string) => `tradedata:nofeed:v1:${accountId}:${symbol}`;
const missKey = (accountId: string, positionId: string) => `tradedata:excmiss:v1:${accountId}:${positionId}`;

let cursor = '';
/** Test hook. */
export function resetExcursionCursor(): void { cursor = ''; }

type Outcome = 'stored' | 'miss' | 'nofeed' | 'skip';

/** One closed position: candles → excursion → upsert. */
export async function excursionFor(
  acc: { id: string; userId: string }, t: Trade, pv: number | null, fetch: CandleFetch = defaultFetch,
): Promise<Outcome> {
  if (t.status !== 'CLOSED' || !t.closeTime || t.exitPrice == null || t.symbol.length > 32) return 'skip';
  const open = new Date(t.openTime).getTime(), close = new Date(t.closeTime).getTime();
  const first = excursionTf(open, close);
  const start = EXC_TFS.findIndex(([tf]) => tf === first.tf);
  let sawBars = false;
  for (const [tf, ms] of EXC_TFS.slice(start, start + 1 + FALLBACK_STEPS)) {
    if ((close - open) / ms > MAX_BARS) continue;
    let candles: ExcCandle[] = [];
    try {
      candles = await fetch({
        symbol: t.symbol, tf: tf as MarketTimeframe, accountId: acc.id,
        from: Math.floor((open - ms) / 1000), to: Math.ceil((close + ms) / 1000), limit: MAX_BARS + 4,
      }, acc.userId);
    } catch { candles = []; }
    if (candles.length) sawBars = true;
    const e = computeExcursion({ side: t.direction, entry: t.entryPrice, exit: t.exitPrice, open, close }, candles, ms);
    if (!e) continue;
    const ok = await upsertExcursion(acc.id, t.positionId, {
      ...e, timeframe: tf,
      maeMoney: excursionMoney(e.maePrice, t.volume, pv), mfeMoney: excursionMoney(e.mfePrice, t.volume, pv),
      source: 'candles',
    });
    return ok ? 'stored' : 'skip';
  }
  return sawBars ? 'miss' : 'nofeed';
}

/** Closed positions of one account still missing an excursion, newest first, minus remembered misses. */
async function dueFor(acc: { id: string; userId: string }): Promise<{ trades: Trade[]; all: Trade[] } | null> {
  let all: Trade[];
  try {
    all = (await loadAccountData(acc.userId, acc.id, 'readonly')).trades();
  } catch { return null; }
  const have = await excursionIds(acc.id);
  const closed = all.filter(t => t.status === 'CLOSED' && t.closeTime && t.exitPrice != null && !have.has(t.positionId))
    .sort((a, b) => (a.closeTime! < b.closeTime! ? 1 : -1));
  const noFeed = new Map<string, boolean>();
  const out: Trade[] = [];
  for (const t of closed) {
    if (!noFeed.has(t.symbol)) noFeed.set(t.symbol, !!(await cacheGet<number>(noFeedKey(acc.id, t.symbol))));
    if (noFeed.get(t.symbol)) continue;
    if (await cacheGet<number>(missKey(acc.id, t.positionId))) continue;
    out.push(t);
    if (out.length >= MAX_PER_RUN) break;
  }
  return { trades: out, all };
}

export async function computeDueExcursions(opts: { limit?: number; fetch?: CandleFetch } = {}): Promise<{ stored: number; tried: number; accounts: number }> {
  const limit = opts.limit ?? MAX_PER_RUN;
  if (!(await available())) return { stored: 0, tried: 0, accounts: 0 };
  const usable = await usableAccountsWhere();
  const accounts = await prisma.brokerAccount.findMany({
    where: { lastSyncAt: { not: null }, ...(usable ? { AND: [usable] } : {}) },
    orderBy: { id: 'asc' },
    select: { id: true, userId: true, baseCurrency: true },
  });
  if (!accounts.length) return { stored: 0, tried: 0, accounts: 0 };
  // Round-robin: start after the account the last run stopped at.
  const at = accounts.findIndex(a => a.id > cursor);
  const order = at < 0 ? accounts : [...accounts.slice(at), ...accounts.slice(0, at)];
  let tried = 0, stored = 0, touched = 0;
  for (const acc of order) {
    if (tried >= limit) break;
    cursor = acc.id;
    const due = await dueFor(acc);
    if (!due?.trades.length) continue;
    touched++;
    const pv = pointValues(due.all, acc.baseCurrency);
    const queue = due.trades.slice(0, limit - tried);
    tried += queue.length;
    let wrote = 0;
    const deadSymbols = new Set<string>();
    const liveSymbols = new Set<string>();
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const t = queue[next++]!;
        if (deadSymbols.has(t.symbol)) continue;
        const res = await excursionFor(acc, t, pv.get(t.positionId)?.value ?? null, opts.fetch);
        if (res === 'stored') { wrote++; liveSymbols.add(t.symbol); }
        // No bars for an older trade of a symbol that does have a feed: just that trade.
        else if (res === 'miss' || (res === 'nofeed' && liveSymbols.has(t.symbol))) await cacheSet(missKey(acc.id, t.positionId), 1, MISS_TTL_S);
        else if (res === 'nofeed') { deadSymbols.add(t.symbol); await cacheSet(noFeedKey(acc.id, t.symbol), 1, NO_FEED_TTL_S); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (wrote) { stored += wrote; await bumpDataVersion(acc.id); }
  }
  if (stored) logger.info('[trade-data] excursions stored', { stored, tried, accounts: touched });
  return { stored, tried, accounts: touched };
}
