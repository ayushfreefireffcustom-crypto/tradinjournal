// Derivatives (E11, E17): funding, open interest, long/short and squeezes for
// USDT perpetuals, from Bybit's public market data (Binance futures blocks
// some regions). One ticker call covers every contract; the per-contract
// extras (last settled funding, 24 h OI history, long/short ratio) are
// fetched for the most-traded 30 only. Liquidations have no public feed we can
// reach, so they're left out rather than guessed.
import { annualisedFunding, squeezeOf, type SqueezeKind } from '@tradinjournal/core';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';

const BYBIT = 'https://api.bybit.com/v5/market';
const TTL = 300;
const DETAIL = 30;
const ROWS = 100;

export interface DerivRow {
  symbol: string;
  base: string;
  price: number;
  change24h: number; // %
  turnover24h: number; // USDT
  oiValue: number | null; // USDT
  /** Predicted rate for the next settlement, % per interval. */
  funding: number | null;
  /** The last settled rate, % per interval (top 30 only). */
  lastFunding: number | null;
  fundingIntervalH: number;
  annualised: number | null; // %
  nextFundingTime: number | null;
  oiChange24h: number | null; // % (top 30 only)
  /** Share of accounts long, 0–1 (top 30 only). */
  longRatio: number | null;
  squeeze: SqueezeKind | null;
}
export interface Derivatives {
  asOf: string;
  source: 'bybit' | null;
  rows: DerivRow[];
  totals: { oiValue: number; weightedFunding: number | null; positiveShare: number | null };
  detailFor: number;
  liquidations: null;
  note: string | null;
}

interface Ticker { symbol: string; lastPrice: string; price24hPcnt: string; turnover24h: string; openInterestValue: string; fundingRate: string; fundingIntervalHour?: string; nextFundingTime: string; curPreListingPhase?: string }
export interface DerivativesDeps {
  get: <T>(path: string) => Promise<T>;
  now: () => number;
  cache: boolean;
}
export const defaultDerivativesDeps: DerivativesDeps = {
  get: <T>(path: string) => fetchJson<T>(`${BYBIT}${path}`),
  now: () => Date.now(),
  cache: true,
};

const num = (s: string | undefined) => (s == null || s === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]!); }));
}

export async function derivatives(deps = defaultDerivativesDeps): Promise<Derivatives> {
  const key = 'derivatives:main';
  if (deps.cache) { const hit = await cacheGet<Derivatives>(key); if (hit) return hit; }
  const now = deps.now();
  let tickers: Ticker[];
  try {
    const r = await deps.get<{ retCode: number; result?: { list?: Ticker[] } }>('/tickers?category=linear');
    if (r.retCode !== 0) throw new Error(`retCode ${r.retCode}`);
    tickers = r.result?.list ?? [];
  } catch (err) {
    logger.warn(`[derivatives] Bybit unavailable: ${(err as Error).message}`);
    return { asOf: new Date(now).toISOString(), source: null, rows: [], totals: { oiValue: 0, weightedFunding: null, positiveShare: null }, detailFor: 0, liquidations: null, note: 'Bybit’s market data didn’t answer, so there’s nothing to show right now.' };
  }
  const rows: DerivRow[] = tickers
    .filter((t) => t.symbol.endsWith('USDT') && (!t.curPreListingPhase || t.curPreListingPhase === 'NotStarted' || t.curPreListingPhase === 'Finished') && (num(t.turnover24h) ?? 0) > 0)
    .map((t) => {
      const funding = num(t.fundingRate);
      const interval = num(t.fundingIntervalHour) ?? 8;
      return {
        symbol: t.symbol, base: t.symbol.slice(0, -4), price: Number(t.lastPrice), change24h: (num(t.price24hPcnt) ?? 0) * 100,
        turnover24h: Number(t.turnover24h), oiValue: num(t.openInterestValue),
        funding: funding == null ? null : funding * 100, lastFunding: null, fundingIntervalH: interval,
        annualised: funding == null ? null : annualisedFunding(funding * 100, interval),
        nextFundingTime: num(t.nextFundingTime), oiChange24h: null, longRatio: null, squeeze: null,
      };
    })
    .sort((a, b) => b.turnover24h - a.turnover24h)
    .slice(0, ROWS);

  // Extras for the most traded.
  await pool(rows.slice(0, DETAIL), 6, async (r) => {
    const [oi, ls, fh] = await Promise.allSettled([
      deps.get<{ retCode: number; result?: { list?: Array<{ openInterest: string; timestamp: string }> } }>(`/open-interest?category=linear&symbol=${r.symbol}&intervalTime=1h&limit=25`),
      deps.get<{ retCode: number; result?: { list?: Array<{ buyRatio: string }> } }>(`/account-ratio?category=linear&symbol=${r.symbol}&period=1h&limit=1`),
      deps.get<{ retCode: number; result?: { list?: Array<{ fundingRate: string }> } }>(`/funding/history?category=linear&symbol=${r.symbol}&limit=1`),
    ]);
    if (oi.status === 'fulfilled') {
      const l = oi.value.result?.list ?? []; // newest first
      const nowOi = num(l[0]?.openInterest);
      const dayAgo = num(l[24]?.openInterest);
      if (nowOi != null && dayAgo) r.oiChange24h = (nowOi / dayAgo - 1) * 100;
    }
    if (ls.status === 'fulfilled') r.longRatio = num(ls.value.result?.list?.[0]?.buyRatio);
    if (fh.status === 'fulfilled') { const f = num(fh.value.result?.list?.[0]?.fundingRate); r.lastFunding = f == null ? null : f * 100; }
    r.squeeze = squeezeOf(r.change24h, r.oiChange24h);
  });

  const oiTotal = rows.reduce((s, r) => s + (r.oiValue ?? 0), 0);
  const weighted = rows.filter((r) => r.funding != null && r.oiValue);
  const withFunding = rows.filter((r) => r.funding != null);
  const out: Derivatives = {
    asOf: new Date(now).toISOString(),
    source: 'bybit',
    rows,
    totals: {
      oiValue: oiTotal,
      weightedFunding: weighted.length ? weighted.reduce((s, r) => s + r.funding! * r.oiValue!, 0) / weighted.reduce((s, r) => s + r.oiValue!, 0) : null,
      positiveShare: withFunding.length ? withFunding.filter((r) => r.funding! > 0).length / withFunding.length : null,
    },
    detailFor: Math.min(DETAIL, rows.length),
    liquidations: null,
    note: null,
  };
  if (deps.cache) await cacheSet(key, out, TTL);
  return out;
}

/** Funding and open interest for one symbol (the charts' stats panel); null off-perp. */
export async function perpFor(symbol: string, deps = defaultDerivativesDeps): Promise<Pick<DerivRow, 'funding' | 'nextFundingTime' | 'fundingIntervalH' | 'oiValue' | 'annualised'> | null> {
  const all = await derivatives(deps);
  const r = all.rows.find((x) => x.symbol === symbol.toUpperCase());
  if (r) return { funding: r.funding, nextFundingTime: r.nextFundingTime, fundingIntervalH: r.fundingIntervalH, oiValue: r.oiValue, annualised: r.annualised };
  try {
    const t = (await deps.get<{ retCode: number; result?: { list?: Ticker[] } }>(`/tickers?category=linear&symbol=${encodeURIComponent(symbol.toUpperCase())}`)).result?.list?.[0];
    if (!t) return null;
    const f = num(t.fundingRate);
    const interval = num(t.fundingIntervalHour) ?? 8;
    return { funding: f == null ? null : f * 100, nextFundingTime: num(t.nextFundingTime), fundingIntervalH: interval, oiValue: num(t.openInterestValue), annualised: f == null ? null : annualisedFunding(f * 100, interval) };
  } catch {
    return null;
  }
}
