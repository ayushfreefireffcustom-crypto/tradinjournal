// Signals table (E7): a technical rating, Strong sell … Strong buy, for the
// most-traded pairs on 1h, 4h and 1d, plus every vote behind it for one
// symbol. Ratings use closed bars only, like alerts and the screener, and are
// cached per closed bar; prices and 24h change stay fresh.
import { rateCandles, RATING_BARS, type Rating, type TraderCandle as Candle } from '@tradinjournal/core';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { loadUniverse, type UniverseRow } from '../screener/universe.js';

export const SIGNAL_TFS = ['1h', '4h', '1d'] as const;
type Tf = (typeof SIGNAL_TFS)[number];
const TF_MS: Record<Tf, number> = { '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
// Same bucket as the screener's, so the two share cached candles.
const LIMIT = 300;
const CONCURRENCY = 8;
const TTL = 30;

export interface SignalsDeps {
  universe: (size: number) => Promise<UniverseRow[]>;
  loadCandles: (symbol: string, tf: string, limit: number) => Promise<Candle[]>;
  now: () => number;
  cache: boolean;
}
export const defaultSignalsDeps: SignalsDeps = {
  universe: loadUniverse,
  loadCandles: (s, tf, limit) => loadPublicCandles(s, tf as never, limit),
  now: () => Date.now(),
  cache: true,
};

const closedOnly = (c: Candle[], tf: Tf, now: number) => {
  let end = c.length;
  while (end > 0 && c[end - 1]!.openTime + TF_MS[tf] > now) end -= 1;
  return c.slice(0, end);
};

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); }
  }));
  return out;
}

type Rated = { rating: Rating; barTime: number; bars: number };

/**
 * A rating only changes when a bar closes, so it is cached per closed bar:
 * computed once per symbol and bar, then served until the next close.
 */
async function rate(symbol: string, tf: Tf, deps: SignalsDeps): Promise<Rated | null> {
  const now = deps.now();
  const expected = Math.floor(now / TF_MS[tf]) * TF_MS[tf] - TF_MS[tf]; // newest bar that has closed
  const key = `signals:rate:${symbol}:${tf}:${expected}`;
  if (deps.cache) {
    const hit = await cacheGet<Rated>(key);
    if (hit) return hit;
  }
  let candles: Candle[] = [];
  try {
    candles = closedOnly(await deps.loadCandles(symbol, tf, LIMIT), tf, now);
  } catch {
    return null;
  }
  if (!candles.length) return null;
  const out: Rated = { rating: rateCandles(candles), barTime: candles.at(-1)!.openTime, bars: candles.length };
  // A feed that hasn't caught up with the close yet is only kept briefly.
  if (deps.cache) await cacheSet(key, out, out.barTime === expected ? Math.ceil((expected + 2 * TF_MS[tf] - now) / 1000) : 60);
  return out;
}

export interface SignalCell { score: number | null; label: Rating['label']; ma: number | null; osc: number | null }
export interface SignalRow extends Pick<UniverseRow, 'symbol' | 'base' | 'price' | 'change24h' | 'volume24h'> { ratings: Record<Tf, SignalCell | null> }

export interface SignalsList { asOf: string; barTimes: Partial<Record<Tf, string>>; rows: SignalRow[] }

/** Ratings on 1h, 4h and 1d for the top pairs by 24h volume. */
export async function listSignals(size: number, deps = defaultSignalsDeps): Promise<SignalsList> {
  const key = `signals:list:${size}`;
  if (deps.cache) {
    const hit = await cacheGet<SignalsList>(key);
    if (hit) return hit;
  }
  const universe = await deps.universe(size);
  const tasks = universe.flatMap((u) => SIGNAL_TFS.map((tf) => ({ u, tf })));
  const rated = new Map<string, Awaited<ReturnType<typeof rate>>>();
  await pool(tasks, CONCURRENCY, async ({ u, tf }) => { rated.set(`${u.symbol}:${tf}`, await rate(u.symbol, tf, deps)); });
  const bars: Partial<Record<Tf, number>> = {};
  const rows: SignalRow[] = universe.map((u) => ({
    symbol: u.symbol, base: u.base, price: u.price, change24h: u.change24h, volume24h: u.volume24h,
    ratings: Object.fromEntries(SIGNAL_TFS.map((tf) => {
      const hit = rated.get(`${u.symbol}:${tf}`);
      if (hit) bars[tf] = Math.max(bars[tf] ?? 0, hit.barTime);
      return [tf, hit ? { score: hit.rating.score, label: hit.rating.label, ma: hit.rating.ma.score, osc: hit.rating.osc.score } : null];
    })) as Record<Tf, SignalCell | null>,
  }));
  const out: SignalsList = {
    asOf: new Date(deps.now()).toISOString(),
    barTimes: Object.fromEntries(Object.entries(bars).map(([tf, t]) => [tf, new Date(t).toISOString()])) as Partial<Record<Tf, string>>,
    rows,
  };
  if (deps.cache) await cacheSet(key, out, TTL);
  return out;
}

/** Every vote behind one symbol's ratings. */
export async function symbolSignals(rawSymbol: string, deps = defaultSignalsDeps) {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) throw new ValidationError('That isn’t a market symbol.');
  const per = await Promise.all(SIGNAL_TFS.map(async (tf) => [tf, await rate(symbol, tf, deps)] as const));
  if (per.every(([, r]) => r == null)) throw new ValidationError(`No market data for ${symbol}.`);
  return {
    symbol,
    minBars: RATING_BARS,
    timeframes: per.map(([tf, r]) => (r ? { tf, barTime: new Date(r.barTime).toISOString(), bars: r.bars, ...r.rating } : { tf, barTime: null, bars: 0, score: null, label: null, price: null, ma: null, osc: null })),
  };
}
