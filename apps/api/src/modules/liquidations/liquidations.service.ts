// Estimated liquidation map + max pain for the big USDT perps (Macro page,
// later Charts). The model lives in @tradinjournal/core (buildLiquidationMap);
// this file only gathers its inputs from free public endpoints:
//   Binance USDⓈ-M: klines (with taker-buy volume), open-interest history,
//   live open interest, global long/short account ratio.
//   Bybit v5: kline, open-interest, account-ratio. Bybit klines carry no taker
//   split, so the account ratio does that job alone.
// Both venues are modelled on the same price (Binance's when it answers) and
// combined, weighted by each venue's live open interest
// (core combineLiquidationMaps). One venue down → the other alone.
// Both hosts go through the Singapore relay in production (lib/market/http.ts).
// Realised liquidations ("lastHour") come from the relay's live Binance + Bybit
// liquidation sockets (apps/relay/liquidations.mjs, GET /liquidations/recent);
// null whenever the relay is missing, down, or hasn't covered the full hour.
import {
  LIQUIDATION_COINS,
  type LiquidationCoin,
  type LiquidationMapDto,
  type LiquidationMapQuery,
  type MaxPainBoardDto,
} from '@tradinjournal/contracts';
import {
  buildLiquidationMap,
  combineLiquidationMaps,
  type LiqBar,
  type LiqOiPoint,
  type LiqRatioPoint,
  type LiquidationVenuePart,
} from '@tradinjournal/core';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson, fetchRelayJson } from '../../lib/market/http.js';
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
  /** GET one of the relay's own routes (path + query). */
  relay: <T>(path: string) => Promise<T>;
  now: () => number;
  cache: boolean;
}
export const defaultLiquidationsDeps: LiquidationsDeps = {
  get: <T>(url: string) => fetchJson<T>(url),
  relay: <T>(path: string) => fetchRelayJson<T>(path),
  now: () => Date.now(),
  cache: true,
};

interface Inputs {
  bars: LiqBar[];
  oi: LiqOiPoint[];
  ratio: LiqRatioPoint[];
  /** Live open interest, base units; null when not given. */
  oiNow: number | null;
  sources: string[];
}

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
  const live = oiNow.status === 'fulfilled' ? num(oiNow.value?.openInterest) : NaN;
  return { bars, oi, ratio: rs, oiNow: live > 0 ? live : oi.at(-1)?.oi ?? null, sources };
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
  oi.sort((a, b) => a.t - b.t);
  return { bars, oi, ratio: rs, oiNow: oi.at(-1)?.oi ?? null, sources };
}

const VENUE_NAME = { binance: 'Binance', bybit: 'Bybit' } as const;
type Venue = keyof typeof VENUE_NAME;

async function compute(coin: LiquidationCoin, window: Window, deps: LiquidationsDeps): Promise<LiquidationMapDto> {
  const w = WINDOWS[window];
  const symbol = `${coin}USDT`;
  const now = deps.now();
  const [bn, bb] = await Promise.allSettled([fromBinance(symbol, w, now, deps), fromBybit(symbol, w, deps)]);
  if (bn.status === 'rejected') logger.warn(`[liquidations] Binance ${symbol} unavailable: ${(bn.reason as Error).message}`);
  if (bb.status === 'rejected') logger.warn(`[liquidations] Bybit ${symbol} unavailable: ${(bb.reason as Error).message}`);
  const venues: { venue: Venue; inputs: Inputs }[] = [];
  if (bn.status === 'fulfilled') venues.push({ venue: 'binance', inputs: bn.value });
  if (bb.status === 'fulfilled') venues.push({ venue: 'bybit', inputs: bb.value });
  if (!venues.length) throw new LiquidationsUnavailableError();

  // Binance (the bigger venue, with a taker split) sets the price and the path.
  const primary = venues[0]!;
  const bars = [...primary.inputs.bars].sort((a, b) => a.t - b.t);
  const price = bars.at(-1)?.c ?? 0;
  if (!(price > 0)) throw new LiquidationsUnavailableError();
  const parts: LiquidationVenuePart[] = venues.map(({ venue, inputs }) => {
    const vb = venue === primary.venue ? bars : [...inputs.bars].sort((a, b) => a.t - b.t);
    const result = buildLiquidationMap({ bars: vb, oi: inputs.oi, ratio: inputs.ratio }, { barMs: w.barMs, now, price });
    const venuePrice = vb.at(-1)?.c ?? price;
    return { venue, result, oiUsd: inputs.oiNow != null ? inputs.oiNow * venuePrice : null, fromOi: inputs.oi.length > 0 };
  });
  const m = combineLiquidationMaps(parts, { price, sigma24h: parts[0]!.result.sigma24h });

  const sources = venues.flatMap(({ inputs }) => inputs.sources);
  const stand = venues.filter(({ inputs }) => !inputs.oi.length).map(({ venue }) => VENUE_NAME[venue]);
  if (stand.length) sources.push(`Volume stand-in (no open-interest history: ${stand.join(', ')})`);
  if (parts.length > 1) {
    const split = m.weights.map((x) => `${VENUE_NAME[x.venue as Venue]} ${Math.round(x.weight * 100)}%`).join(', ');
    const byOi = parts.every((p) => p.oiUsd != null && p.oiUsd > 0);
    sources.push(`${byOi ? 'Weighted by open interest' : 'Venues added'}: ${split}`);
  }
  sources.push('TRADElogs estimate (leverage-tier model)');
  return {
    coin,
    symbol,
    price,
    asOf: new Date(now).toISOString(),
    estimated: true,
    window,
    step: m.step,
    bands: m.bands,
    maxPain: m.maxPain,
    path: bars.map((b) => ({ t: new Date(b.t).toISOString(), p: b.c })),
    lastHour: null,
    sources,
  };
}

/** What the relay's GET /liquidations/recent answers (apps/relay/liquidations.mjs). */
interface RelayRecent {
  coin: string;
  windowMin: number;
  totalUsd: number;
  longUsd: number;
  shortUsd: number;
  longShare: number | null;
  complete: boolean;
}

const LAST_HOUR_TTL = 30;
/**
 * Realised liquidations over the last hour from the relay's live sockets, or
 * null when the relay isn't set up, didn't answer, or hasn't watched the whole
 * hour yet (just restarted). Never throws.
 */
export async function lastHour(coin: LiquidationCoin, deps = defaultLiquidationsDeps): Promise<LiquidationMapDto['lastHour']> {
  const key = `liq:last:${coin}`;
  if (deps.cache) {
    const hit = await cacheGet<{ v: LiquidationMapDto['lastHour'] }>(key);
    if (hit) return hit.v;
  }
  let v: LiquidationMapDto['lastHour'] = null;
  try {
    const r = await deps.relay<RelayRecent>(`/liquidations/recent?coin=${coin}&window=60`);
    if (r && r.complete === true && Number.isFinite(r.totalUsd) && r.totalUsd >= 0) {
      v = { totalUsd: Math.round(r.totalUsd), longShare: r.totalUsd > 0 && r.longShare != null && Number.isFinite(r.longShare) ? r.longShare : null };
    }
  } catch (err) {
    logOnce(`[liquidations] relay liquidation feed unavailable: ${(err as Error).message}`);
  }
  if (deps.cache) await cacheSet(key, { v }, LAST_HOUR_TTL);
  return v;
}

let lastLogged = '';
let lastLoggedAt = 0;
/** The same relay failure logs at most every 10 minutes. */
function logOnce(msg: string) {
  const t = Date.now();
  if (msg === lastLogged && t - lastLoggedAt < 600_000) return;
  lastLogged = msg;
  lastLoggedAt = t;
  logger.warn(msg);
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
export async function liquidationMap(q: LiquidationMapQuery, deps = defaultLiquidationsDeps): Promise<LiquidationMapDto> {
  // The ladder caches for two minutes; the realised last hour has its own 30 s cache.
  const [map, last] = await Promise.all([ladder(q, deps), lastHour(q.coin, deps)]);
  return { ...map, lastHour: last };
}

function ladder(q: LiquidationMapQuery, deps: LiquidationsDeps): Promise<LiquidationMapDto> {
  return cached(`liq:map:v2:${q.coin}:${q.window}`, deps, () => compute(q.coin, q.window, deps));
}

/** Max pain for every supported coin; coins whose data didn't answer are left out. */
export function maxPainBoard(deps = defaultLiquidationsDeps): Promise<MaxPainBoardDto> {
  return cached('liq:board:v2', deps, async () => {
    const settled = await Promise.allSettled(LIQUIDATION_COINS.map((coin) => ladder({ coin, window: BOARD_WINDOW }, deps)));
    const rows = settled.flatMap((s) => (s.status === 'fulfilled' ? [{ coin: s.value.coin, price: s.value.price, ...s.value.maxPain }] : []));
    if (!rows.length) throw new LiquidationsUnavailableError();
    return { asOf: new Date(deps.now()).toISOString(), estimated: true as const, rows };
  });
}
