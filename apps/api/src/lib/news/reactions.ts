// Intraday reaction series for the News page ("moved since publish", the
// scoreboard sparklines, the top story's reaction chart). A fixed watch set,
// 5-minute bars over roughly the last day:
//   - crypto from the Binance market provider (public data-api host, keyless,
//     not geo-blocked, so it needs no relay);
//   - everything else from Yahoo's keyless chart endpoint, reusing the Yahoo
//     provider's symbol mapping and the market HTTP helper. The Yahoo provider's
//     own getCandles pulls a month of 5m bars per call; the page only needs a
//     day, so this asks for a 5-day range (covers weekends) and keeps the tail.
// One shared fetch per minute (cache + in-flight dedupe); a feed that fails or
// returns nothing is simply left out, and the page hides that asset.
import type { NewsReactionsDTO, ReactionKey, ReactionSeriesDTO } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../cache.js';
import { fetchJson } from '../market/http.js';
import { createBinanceProvider } from '../market/providers/binance.js';
import { yahooSymbol } from '../market/providers/yahoo.js';

interface WatchItem {
  key: ReactionKey;
  src: 'binance' | 'yahoo' | 'cnbc';
  /** Provider symbol. */
  sym: string;
  unit: 'bp' | 'pct';
  dp: number;
}

export const WATCH: WatchItem[] = [
  { key: 'US10Y', src: 'yahoo', sym: '^TNX', unit: 'bp', dp: 2 },
  { key: 'DXY', src: 'yahoo', sym: 'DX-Y.NYB', unit: 'pct', dp: 2 },
  { key: 'EURUSD', src: 'yahoo', sym: yahooSymbol('EURUSD'), unit: 'pct', dp: 4 },
  { key: 'XAUUSD', src: 'yahoo', sym: yahooSymbol('XAUUSD'), unit: 'pct', dp: 0 },
  { key: 'US500', src: 'yahoo', sym: 'ES=F', unit: 'pct', dp: 0 },
  { key: 'US100', src: 'yahoo', sym: 'NQ=F', unit: 'pct', dp: 0 },
  { key: 'BTCUSD', src: 'binance', sym: 'BTCUSDT', unit: 'pct', dp: 0 },
  { key: 'ETHUSD', src: 'binance', sym: 'ETHUSDT', unit: 'pct', dp: 0 },
  { key: 'WTI', src: 'yahoo', sym: yahooSymbol('WTIUSD'), unit: 'pct', dp: 2 },
  // Not on the scoreboard; used for story moves when a story names them.
  { key: 'BRENT', src: 'yahoo', sym: yahooSymbol('UKOIL'), unit: 'pct', dp: 2 },
  { key: 'USDJPY', src: 'yahoo', sym: yahooSymbol('USDJPY'), unit: 'pct', dp: 2 },
  { key: 'GBPUSD', src: 'yahoo', sym: yahooSymbol('GBPUSD'), unit: 'pct', dp: 4 },
  { key: 'SOLUSD', src: 'binance', sym: 'SOLUSDT', unit: 'pct', dp: 2 },
  { key: 'US2Y', src: 'cnbc', sym: 'US2Y', unit: 'bp', dp: 3 },
];

/** Bars kept per series: ~25h of 5-minute bars. */
export const BARS = 300;
const CACHE_KEY = 'news:reactions:v2';
const CACHE_TTL_SECONDS = 60;

interface YahooChart {
  chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}

/** Yahoo chart body → [ms, close] pairs, nulls dropped, last `BARS` kept. */
export function yahooPoints(body: YahooChart): [number, number][] {
  const r = body.chart?.result?.[0];
  const ts = r?.timestamp;
  const close = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(close)) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (c == null || !Number.isFinite(c)) continue;
    out.push([ts[i]! * 1000, c]);
  }
  return out.slice(-BARS);
}

async function fetchYahoo(sym: string): Promise<[number, number][]> {
  const params = new URLSearchParams({ interval: '5m', range: '5d' });
  const body = await fetchJson<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${params}`,
    undefined,
    { 'user-agent': 'Mozilla/5.0 (compatible; TradinJournal/1.0)' },
  );
  return yahooPoints(body);
}

interface CnbcChart {
  barData?: { priceBars?: { close?: string | number | null; tradeTimeinMills?: number | string | null }[] };
}

/** CNBC chart body → [ms, close] pairs, junk dropped, oldest first, last `BARS` kept. */
export function cnbcPoints(body: CnbcChart): [number, number][] {
  const bars = body.barData?.priceBars;
  if (!Array.isArray(bars)) return [];
  const out: [number, number][] = [];
  for (const b of bars) {
    const t = Number(b?.tradeTimeinMills);
    const c = typeof b?.close === 'number' ? b.close : typeof b?.close === 'string' && b.close !== '' ? Number(b.close) : NaN;
    // A yield in percent: anything outside (−5, 30) is not a 2-year yield.
    if (!Number.isFinite(t) || !Number.isFinite(c) || c <= -5 || c >= 30) continue;
    out.push([t, c]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(-BARS);
}

async function fetchCnbc(sym: string): Promise<[number, number][]> {
  const body = await fetchJson<CnbcChart>(
    `https://ts-api.cnbc.com/harmony/app/charts/5D.json?symbol=${encodeURIComponent(sym)}`,
    undefined,
    { 'user-agent': 'Mozilla/5.0 (compatible; TradinJournal/1.0)' },
  );
  return cnbcPoints(body);
}

const binance = createBinanceProvider();
async function fetchBinance(sym: string): Promise<[number, number][]> {
  const candles = await binance.getCandles(sym, '5m', { limit: BARS });
  return candles.map(c => [c.openTime, c.close] as [number, number]);
}

let inFlight: Promise<NewsReactionsDTO> | null = null;

async function load(): Promise<NewsReactionsDTO> {
  const settled = await Promise.allSettled(WATCH.map(w => (w.src === 'binance' ? fetchBinance(w.sym) : w.src === 'cnbc' ? fetchCnbc(w.sym) : fetchYahoo(w.sym))));
  const series: ReactionSeriesDTO[] = [];
  settled.forEach((r, i) => {
    const w = WATCH[i]!;
    if (r.status === 'rejected') {
      logger.warn(`News reactions: ${w.key} failed: ${(r.reason as Error).message}`);
      return;
    }
    if (r.value.length >= 2) series.push({ key: w.key, unit: w.unit, dp: w.dp, points: r.value });
  });
  return { asOf: new Date().toISOString(), interval: '5m', series };
}

/** All watch-set series, cached for a minute and shared across callers. */
export async function getReactionSeries(): Promise<NewsReactionsDTO> {
  const cached = await cacheGet<NewsReactionsDTO>(CACHE_KEY);
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const dto = await load();
      // Don't pin an all-empty result (a provider blip) for the full minute.
      if (dto.series.length) await cacheSet(CACHE_KEY, dto, CACHE_TTL_SECONDS);
      return dto;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Trim every series to points at/after `since` (keeping the last bar before it as the base). */
export function trimSince(dto: NewsReactionsDTO, since?: string): NewsReactionsDTO {
  if (!since) return dto;
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return dto;
  return {
    ...dto,
    series: dto.series
      .map(s => {
        const firstAfter = s.points.findIndex(p => p[0] >= t);
        if (firstAfter === -1) return { ...s, points: s.points.slice(-1) };
        return { ...s, points: s.points.slice(Math.max(0, firstAfter - 1)) };
      })
      .filter(s => s.points.length > 0),
  };
}
