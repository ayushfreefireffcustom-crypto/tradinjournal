// Market overview (E10) and correlation (E14). Crypto from the screener's
// universe (top Binance USDT pairs) plus daily candles for multi-day moves;
// FX, indices and commodities from the regular market providers; Fear & Greed
// from Alternative.me. Anything a source doesn't give is null, never zero.
import {
  altcoinSeason, breadth, correlationMatrix, returnOver, sectorOf, SECTORS,
  type Breadth, type Sector, type TraderCandle as Candle,
} from '@tradinjournal/core';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';
import { loadPublicCandles } from '../market/market.service.js';
import { loadUniverse, type UniverseRow } from '../screener/universe.js';

const DAY = 86_400_000;
export interface OverviewDeps {
  universe: (n: number) => Promise<UniverseRow[]>;
  daily: (symbol: string, limit: number) => Promise<Candle[]>;
  fearGreed: () => Promise<FearGreed | null>;
  now: () => number;
  cache: boolean;
}
export interface FearGreed { value: number; label: string; history: Array<{ time: number; value: number }> }

async function fetchFearGreed30(): Promise<FearGreed | null> {
  const key = 'overview:fng30';
  const hit = await cacheGet<FearGreed>(key);
  if (hit) return hit;
  try {
    const j = await fetchJson<{ data?: Array<{ value: string; value_classification: string; timestamp: string }> }>('https://api.alternative.me/fng/?limit=30');
    const rows = j.data ?? [];
    if (!rows.length) return null;
    const out: FearGreed = { value: Number(rows[0]!.value), label: rows[0]!.value_classification, history: rows.map((r) => ({ time: Number(r.timestamp) * 1000, value: Number(r.value) })).reverse() };
    await cacheSet(key, out, 30 * 60);
    return out;
  } catch (err) {
    logger.warn(`[overview] Fear & Greed unavailable: ${(err as Error).message}`);
    return null;
  }
}

export const defaultOverviewDeps: OverviewDeps = {
  universe: loadUniverse,
  daily: (s, limit) => loadPublicCandles(s, '1d', limit),
  fearGreed: fetchFearGreed30,
  now: () => Date.now(),
  cache: true,
};

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

/** Closed daily bars only. */
const closedDaily = (c: Candle[], now: number) => c.filter((b) => b.openTime + DAY <= now);

// FX, indices and commodities shown beside crypto.
export const MACRO = [
  { symbol: 'US500', name: 'S&P 500', group: 'Indices' }, { symbol: 'NAS100', name: 'Nasdaq 100', group: 'Indices' }, { symbol: 'US30', name: 'Dow Jones', group: 'Indices' },
  { symbol: 'GER40', name: 'DAX', group: 'Indices' }, { symbol: 'JP225', name: 'Nikkei 225', group: 'Indices' },
  { symbol: 'EURUSD', name: 'EUR/USD', group: 'Forex' }, { symbol: 'GBPUSD', name: 'GBP/USD', group: 'Forex' }, { symbol: 'USDJPY', name: 'USD/JPY', group: 'Forex' }, { symbol: 'USDINR', name: 'USD/INR', group: 'Forex' },
  { symbol: 'XAUUSD', name: 'Gold', group: 'Commodities' }, { symbol: 'XAGUSD', name: 'Silver', group: 'Commodities' }, { symbol: 'WTIUSD', name: 'WTI crude', group: 'Commodities' },
] as const;

export interface SectorRow { sector: Sector; count: number; change24h: number | null; change7d: number | null; change30d: number | null; volume24h: number; vsBtc7d: number | null; vsBtc30d: number | null; leaders: string[] }
export interface Overview {
  asOf: string;
  breadth: Breadth;
  gainers: UniverseRow[];
  losers: UniverseRow[];
  heatmap: Array<UniverseRow & { sector: Sector }>;
  sectors: SectorRow[];
  fearGreed: FearGreed | null;
  altSeason: ReturnType<typeof altcoinSeason> & { btc90: number | null; window: number };
  macro: Array<{ symbol: string; name: string; group: string; price: number | null; change1d: number | null; spark: number[] }>;
  /** Week view for the market brief: majors and the top 50's biggest 7-day movers. */
  week: { btc7d: number | null; eth7d: number | null; gainers: Array<{ base: string; change7d: number }>; losers: Array<{ base: string; change7d: number }> };
}

const avg = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

export async function marketOverview(deps = defaultOverviewDeps): Promise<Overview> {
  const key = 'overview:main';
  if (deps.cache) { const hit = await cacheGet<Overview>(key); if (hit) return hit; }
  const now = deps.now();
  const [uni, fg] = await Promise.all([deps.universe(100), deps.fearGreed().catch(() => null)]);
  const top50 = uni.slice(0, 50);
  const dailySyms = [...new Set([...top50.map((u) => u.symbol), 'BTCUSDT'])];
  const dailies = new Map<string, Candle[]>();
  await pool(dailySyms, 8, async (s) => { try { dailies.set(s, closedDaily(await deps.daily(s, 100), now)); } catch { dailies.set(s, []); } });
  const ret = (s: string, d: number) => { const c = dailies.get(s); return c?.length ? returnOver(c, d) : null; };
  const btc7 = ret('BTCUSDT', 7);
  const btc30 = ret('BTCUSDT', 30);
  const btc90 = ret('BTCUSDT', 90);

  // Sectors: 24h over the top 100, multi-day over those in the top 50.
  const sectors: SectorRow[] = SECTORS.map((sector) => {
    const rows = uni.filter((u) => sectorOf(u.base) === sector);
    const daily = rows.filter((u) => dailies.has(u.symbol));
    const c7 = avg(daily.map((u) => ret(u.symbol, 7)));
    const c30 = avg(daily.map((u) => ret(u.symbol, 30)));
    return {
      sector, count: rows.length, change24h: avg(rows.map((u) => u.change24h)), change7d: c7, change30d: c30,
      volume24h: rows.reduce((s, u) => s + u.volume24h, 0),
      vsBtc7d: c7 != null && btc7 != null ? c7 - btc7 : null, vsBtc30d: c30 != null && btc30 != null ? c30 - btc30 : null,
      leaders: [...rows].sort((a, b) => b.volume24h - a.volume24h).slice(0, 3).map((u) => u.base),
    };
  }).filter((s) => s.count > 0).sort((a, b) => (b.change24h ?? -1e9) - (a.change24h ?? -1e9));

  const alts = top50.filter((u) => u.base !== 'BTC');
  const season = altcoinSeason(alts.map((u) => ret(u.symbol, 90)), btc90);

  const macro = await pool([...MACRO], 4, async (m) => {
    try {
      const c = closedDaily(await deps.daily(m.symbol, 30), now + DAY); // FX/indices: the latest daily bar is fine
      const last = c.at(-1);
      const prev = c.at(-2);
      return { ...m, price: last?.close ?? null, change1d: last && prev && prev.close > 0 ? (last.close / prev.close - 1) * 100 : null, spark: c.slice(-20).map((x) => x.close) };
    } catch {
      return { ...m, price: null, change1d: null, spark: [] };
    }
  });

  const byChange = [...uni].sort((a, b) => b.change24h - a.change24h);
  const week7 = top50.map((u) => ({ base: u.base, change7d: ret(u.symbol, 7) })).filter((x): x is { base: string; change7d: number } => x.change7d != null).sort((a, b) => b.change7d - a.change7d);
  const out: Overview = {
    asOf: new Date(now).toISOString(),
    breadth: breadth(uni.map((u) => u.change24h)),
    gainers: byChange.slice(0, 10),
    losers: byChange.slice(-10).reverse(),
    heatmap: top50.map((u) => ({ ...u, sector: sectorOf(u.base) })),
    sectors,
    fearGreed: fg,
    altSeason: { ...season, btc90, window: 90 },
    macro,
    week: { btc7d: btc7, eth7d: ret('ETHUSDT', 7), gainers: week7.slice(0, 5), losers: week7.slice(-5).reverse() },
  };
  if (deps.cache) await cacheSet(key, out, 120);
  return out;
}

/** Correlation of daily returns between the top `n` pairs over `days` days. */
export async function correlationOverview(n = 16, days = 90, deps = defaultOverviewDeps) {
  const key = `overview:corr:${n}:${days}`;
  if (deps.cache) { const hit = await cacheGet<{ asOf: string; days: number; symbols: string[]; matrix: Array<Array<number | null>> }>(key); if (hit) return hit; }
  const now = deps.now();
  const uni = (await deps.universe(n)).slice(0, n);
  const series = await pool(uni, 8, async (u) => { try { return closedDaily(await deps.daily(u.symbol, days + 1), now).slice(-(days + 1)); } catch { return []; } });
  const out = { asOf: new Date(now).toISOString(), days, symbols: uni.map((u) => u.base), matrix: correlationMatrix(series).map((row) => row.map((v) => (v == null ? null : Math.round(v * 100) / 100))) };
  if (deps.cache) await cacheSet(key, out, 30 * 60);
  return out;
}
