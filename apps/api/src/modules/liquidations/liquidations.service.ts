// Estimated liquidation map + max pain for the big USDT perps (Macro page,
// later Charts). The model lives in @tradinjournal/core (buildLiquidationMap);
// this file only gathers its inputs from free public endpoints:
//   Binance USDⓈ-M: klines (with taker-buy volume), open-interest history,
//   live open interest, global long/short account ratio.
//   Bybit v5 (fallback when Binance klines don't answer): kline, open-interest,
//   account-ratio. Bybit klines carry no taker split, so the account ratio
//   does that job alone.
// Both hosts go through the Singapore relay in production (lib/market/http.ts).
// Realised liquidations ("lastHour") need a websocket on both venues (Binance
// dropped its REST history), so they're reported as null rather than guessed.
import {
  LIQUIDATION_COINS,
  type LiquidationCoin,
  type LiquidationMapDto,
  type LiquidationMapQuery,
  type MaxPainBoardDto,
} from '@tradinjournal/contracts';
import { buildLiquidationMap, type LiqBar, type LiqOiPoint, type LiqRatioPoint } from '@tradinjournal/core';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';
import { AppError } from '../../http/errors.js';

const BINANCE = 'https://fapi.binance.com';
const BYBIT = 'https://api.bybit.com/v5/market';
const TTL = 120;
const BOARD_WINDOW: LiquidationMapQuery['window'] = '48h';

type Window = LiquidationMapQuery['window'];
const WINDOWS: Record<Window, { binance: string; bybitKline: string; bybitPeriod: string; bars: number; barMs: number }> = {
  '24h': { binance: '15m', bybitKline: '15', bybitPeriod: '15min', bars: 96, barMs: 15 * 60_000 },
  '48h': { binance: '15m', bybitKline: '15', bybitPeriod: '15min', bars: 192, barMs: 15 * 60_000 },
  '7d': { binance: '1h', bybitKline: '60', bybitPeriod: '1h', bars: 168, barMs: 60 * 60_000 },
};

export class LiquidationsUnavailableError extends AppError {
  constructor(message = 'Exchange data for the liquidation map didn’t answer. Try again in a minute.') {
    super(503, 'LIQUIDATIONS_UNAVAILABLE', message);
  }
}

export interface LiquidationsDeps {
  get: <T>(url: string) => Promise<T>;
  now: () => number;
  cache: boolean;
}
export const defaultLiquidationsDeps: LiquidationsDeps = {
  get: <T>(url: string) => fetchJson<T>(url),
  now: () => Date.now(),
  cache: true,
};

interface Inputs { bars: LiqBar[]; oi: LiqOiPoint[]; ratio: LiqRatioPoint[]; sources: string[] }

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN);
const finite = (...xs: number[]) => xs.every(Number.isFinite);

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, ...unknown[]];

async function fromBinance(symbol: string, w: (typeof WINDOWS)[Window], now: number, deps: LiquidationsDeps): Promise<Inputs> {
  const q = `symbol=${symbol}`;
  const histLimit = Math.min(500, w.bars + 1);
  const [kl, oiHist, oiNow, ratio] = await Promise.allSettled([
    deps.get<BinanceKline[]>(`${BINANCE}/fapi/v1/klines?${q}&interval=${w.binance}&limit=${w.bars}`),
    deps.get<Array<{ sumOpenInterest: string; timestamp: number }>>(`${BINANCE}/futures/data/openInterestHist?${q}&period=${w.binance}&limit=${histLimit}`),
    deps.get<{ openInterest: string; time: number }>(`${BINANCE}/fapi/v1/openInterest?${q}`),
    deps.get<Array<{ longAccount: string; timestamp: number }>>(`${BINANCE}/futures/data/globalLongShortAccountRatio?${q}&period=${w.binance}&limit=${histLimit}`),
  ]);
  if (kl.status !== 'fulfilled' || !Array.isArray(kl.value)) throw new Error(kl.status === 'rejected' ? (kl.reason as Error).message : 'bad klines');
  const bars: LiqBar[] = kl.value
    .map((k) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), volume: num(k[5]), takerBuy: num(k[9]) }))
    .filter((b) => finite(b.t, b.o, b.h, b.l, b.c, b.volume, b.takerBuy));
  if (bars.length < 2) throw new Error('too few klines');
  const sources = ['Binance USDⓈ-M klines'];
  const oi: LiqOiPoint[] = [];
  if (oiHist.status === 'fulfilled' && Array.isArray(oiHist.value)) {
    for (const p of oiHist.value) { const v = { t: num(p.timestamp), oi: num(p.sumOpenInterest) }; if (finite(v.t, v.oi)) oi.push(v); }
  }
  if (oi.length) {
    sources.push('Binance open interest history');
    // The history lags a period; the live figure closes the last bar.
    if (oiNow.status === 'fulfilled') {
      const v = { t: Math.min(num(oiNow.value.time), now), oi: num(oiNow.value.openInterest) };
      if (finite(v.t, v.oi) && v.t > oi[oi.length - 1]!.t) oi.push(v);
    }
  }
  const rs: LiqRatioPoint[] = [];
  if (ratio.status === 'fulfilled' && Array.isArray(ratio.value)) {
    for (const p of ratio.value) { const v = { t: num(p.timestamp), longShare: num(p.longAccount) }; if (finite(v.t, v.longShare)) rs.push(v); }
    if (rs.length) sources.push('Binance global long/short account ratio');
  }
  return { bars, oi, ratio: rs, sources };
}

interface BybitList<T> { retCode: number; retMsg?: string; result?: { list?: T[] } }
async function fromBybit(symbol: string, w: (typeof WINDOWS)[Window], deps: LiquidationsDeps): Promise<Inputs> {
  const q = `category=linear&symbol=${symbol}`;
  const [kl, oiHist, ratio] = await Promise.allSettled([
    deps.get<BybitList<string[]>>(`${BYBIT}/kline?${q}&interval=${w.bybitKline}&limit=${w.bars}`),
    deps.get<BybitList<{ openInterest: string; timestamp: string }>>(`${BYBIT}/open-interest?${q}&intervalTime=${w.bybitPeriod}&limit=${Math.min(200, w.bars + 1)}`),
    deps.get<BybitList<{ buyRatio: string; timestamp: string }>>(`${BYBIT}/account-ratio?${q}&period=${w.bybitPeriod}&limit=${Math.min(500, w.bars + 1)}`),
  ]);
  if (kl.status !== 'fulfilled' || kl.value.retCode !== 0) throw new Error(kl.status === 'rejected' ? (kl.reason as Error).message : `retCode ${kl.value.retCode}`);
  const bars: LiqBar[] = (kl.value.result?.list ?? [])
    .map((k) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), volume: num(k[5]), takerBuy: null }))
    .filter((b) => finite(b.t, b.o, b.h, b.l, b.c, b.volume));
  if (bars.length < 2) throw new Error('too few klines');
  const sources = ['Bybit linear klines'];
  const oi: LiqOiPoint[] = [];
  if (oiHist.status === 'fulfilled' && oiHist.value.retCode === 0) {
    for (const p of oiHist.value.result?.list ?? []) { const v = { t: num(p.timestamp), oi: num(p.openInterest) }; if (finite(v.t, v.oi)) oi.push(v); }
    if (oi.length) sources.push('Bybit open interest history');
  }
  const rs: LiqRatioPoint[] = [];
  if (ratio.status === 'fulfilled' && ratio.value.retCode === 0) {
    for (const p of ratio.value.result?.list ?? []) { const v = { t: num(p.timestamp), longShare: num(p.buyRatio) }; if (finite(v.t, v.longShare)) rs.push(v); }
    if (rs.length) sources.push('Bybit long/short account ratio');
  }
  return { bars, oi, ratio: rs, sources };
}

async function compute(coin: LiquidationCoin, window: Window, deps: LiquidationsDeps): Promise<LiquidationMapDto> {
  const w = WINDOWS[window];
  const symbol = `${coin}USDT`;
  const now = deps.now();
  let inputs: Inputs;
  try {
    inputs = await fromBinance(symbol, w, now, deps);
  } catch (err) {
    logger.warn(`[liquidations] Binance ${symbol} unavailable, trying Bybit: ${(err as Error).message}`);
    try {
      inputs = await fromBybit(symbol, w, deps);
    } catch (err2) {
      logger.warn(`[liquidations] Bybit ${symbol} unavailable: ${(err2 as Error).message}`);
      throw new LiquidationsUnavailableError();
    }
  }
  const bars = [...inputs.bars].sort((a, b) => a.t - b.t);
  const m = buildLiquidationMap({ bars, oi: inputs.oi, ratio: inputs.ratio }, { barMs: w.barMs, now });
  if (!(m.price > 0)) throw new LiquidationsUnavailableError();
  return {
    coin,
    symbol,
    price: m.price,
    asOf: new Date(now).toISOString(),
    estimated: true,
    window,
    step: m.step,
    bands: m.bands,
    maxPain: m.maxPain,
    path: bars.map((b) => ({ t: new Date(b.t).toISOString(), p: b.c })),
    lastHour: null,
    sources: [...inputs.sources, ...(inputs.oi.length ? [] : ['Volume stand-in (no open-interest history)']), 'TRADElogs estimate (leverage-tier model)'],
  };
}

// One upstream fetch per key at a time, however many requests arrive together;
// after a failure the key answers 503 straight away for a short while so a
// down venue isn't hammered through the relay.
const inflight = new Map<string, Promise<unknown>>();
const failedUntil = new Map<string, number>();
const FAIL_BACKOFF_MS = 20_000;
async function cached<T>(key: string, deps: LiquidationsDeps, load: () => Promise<T>): Promise<T> {
  if (!deps.cache) return load();
  const hit = await cacheGet<T>(key);
  if (hit) return hit;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  if ((failedUntil.get(key) ?? 0) > deps.now()) throw new LiquidationsUnavailableError();
  const p = (async () => {
    try {
      const v = await load();
      failedUntil.delete(key);
      await cacheSet(key, v, TTL);
      return v;
    } catch (err) {
      if (err instanceof LiquidationsUnavailableError) failedUntil.set(key, deps.now() + FAIL_BACKOFF_MS);
      throw err;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Estimated liquidation ladder for one coin. Throws LiquidationsUnavailableError (503) when no venue answers. */
export function liquidationMap(q: LiquidationMapQuery, deps = defaultLiquidationsDeps): Promise<LiquidationMapDto> {
  return cached(`liq:map:${q.coin}:${q.window}`, deps, () => compute(q.coin, q.window, deps));
}

/** Max pain for every supported coin; coins whose data didn't answer are left out. */
export function maxPainBoard(deps = defaultLiquidationsDeps): Promise<MaxPainBoardDto> {
  return cached('liq:board', deps, async () => {
    const settled = await Promise.allSettled(LIQUIDATION_COINS.map((coin) => liquidationMap({ coin, window: BOARD_WINDOW }, deps)));
    const rows = settled.flatMap((s) => (s.status === 'fulfilled' ? [{ coin: s.value.coin, price: s.value.price, ...s.value.maxPain }] : []));
    if (!rows.length) throw new LiquidationsUnavailableError();
    return { asOf: new Date(deps.now()).toISOString(), estimated: true as const, rows };
  });
}
