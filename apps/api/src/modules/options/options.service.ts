// Options market data (Part G) from Delta Exchange India's public API: the
// chain with Greeks and IV, the overview analytics, one contract's book and
// candles, and multi-leg analysis. Testnet has its own listings, so the
// environment follows the account the user trades on (live by default).
import {
  analyse, byStrike, expiriesOf, expiryStats, impliedVol, overview, parseOptionSymbol, payoff, replay, resolveTemplate, summarize, TEMPLATES, YEAR_MS,
  type Chain, type Leg, type OptionQuote,
} from '@tradinjournal/core';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';
import { NotFoundError, ValidationError } from '../../http/errors.js';

export type OptEnv = 'live' | 'testnet';
const HOSTS: Record<OptEnv, string> = { live: 'https://api.india.delta.exchange', testnet: 'https://cdn-ind.testnet.deltaex.org' };
const TICKER_TTL = 10;
const PRODUCT_TTL = 600;
export const RESOLUTIONS = ['5m', '15m', '1h', '4h', '1d'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
const RES_S: Record<Resolution, number> = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14_400, '1d': 86_400 };

export interface OptionsDeps { get: <T>(env: OptEnv, path: string) => Promise<T>; now: () => number; cache: boolean }
export const defaultOptionsDeps: OptionsDeps = {
  get: <T>(env: OptEnv, path: string) => fetchJson<T>(`${HOSTS[env]}${path}`, undefined, { 'User-Agent': 'tradelogs/1.0' }),
  now: () => Date.now(),
  cache: true,
};

interface DTicker {
  symbol: string; product_id?: number; contract_type: string; underlying_asset_symbol?: string; strike_price?: string; spot_price?: string;
  mark_price?: string; close?: number | null; mark_change_24h?: string; volume?: number; turnover_usd?: number; oi_contracts?: string; oi_value_usd?: string; oi_change_usd_6h?: string;
  contract_value?: string; tick_size?: string;
  quotes?: { best_bid?: string | null; best_ask?: string | null; bid_size?: string | null; ask_size?: string | null; bid_iv?: string | null; ask_iv?: string | null; mark_iv?: string | null };
  greeks?: { delta?: string; gamma?: string; theta?: string; vega?: string; rho?: string } | null;
}
interface DProduct { symbol: string; contract_type: string; settlement_time: string | null; contract_value: string; tick_size: string; spot_index?: { symbol: string }; underlying_asset?: { symbol: string }; state: string }
interface Env<T> { success: boolean; result: T; meta?: { after?: string | null } }

const n = (s: string | number | null | undefined) => (s == null || s === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);

async function cached<T>(deps: OptionsDeps, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  if (deps.cache) { const hit = await cacheGet<T>(key); if (hit) return hit; }
  const v = await load();
  if (deps.cache) await cacheSet(key, v, ttl);
  return v;
}

const allTickers = (env: OptEnv, deps: OptionsDeps) => cached(deps, `options:tickers:${env}`, TICKER_TTL, async () =>
  (await deps.get<Env<DTicker[]>>(env, '/v2/tickers?contract_types=call_options,put_options')).result);

/** Option products by symbol: settlement times and the index each one follows. */
const products = (env: OptEnv, deps: OptionsDeps) => cached(deps, `options:products:${env}`, PRODUCT_TTL, async () => {
  const out: Record<string, { settle: number | null; cv: number; tick: number; index: string | null }> = {};
  let after: string | null | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await deps.get<Env<DProduct[]>>(env, `/v2/products?contract_types=call_options,put_options&states=live&page_size=500${after ? `&after=${after}` : ''}`);
    for (const p of r.result) out[p.symbol] = { settle: p.settlement_time ? Date.parse(p.settlement_time) : null, cv: Number(p.contract_value), tick: Number(p.tick_size), index: p.spot_index?.symbol ?? null };
    after = r.meta?.after;
    if (!after) break;
  }
  return out;
});

function toQuote(t: DTicker, settle: number | null): OptionQuote | null {
  const s = parseOptionSymbol(t.symbol);
  if (!s) return null;
  return {
    symbol: t.symbol, kind: s.kind, strike: s.strike, expiry: settle ?? s.expiry, expiryCode: s.expiryCode, productId: t.product_id,
    mark: n(t.mark_price), last: n(t.close), bid: n(t.quotes?.best_bid), ask: n(t.quotes?.best_ask), bidSize: n(t.quotes?.bid_size), askSize: n(t.quotes?.ask_size),
    markIv: n(t.quotes?.mark_iv), bidIv: n(t.quotes?.bid_iv), askIv: n(t.quotes?.ask_iv),
    delta: n(t.greeks?.delta), gamma: n(t.greeks?.gamma), theta: n(t.greeks?.theta), vega: n(t.greeks?.vega), rho: n(t.greeks?.rho),
    oi: n(t.oi_contracts) ?? 0, oiUsd: n(t.oi_value_usd), volume: t.volume != null && n(t.contract_value) ? Math.round(t.volume / n(t.contract_value)!) : 0,
    turnoverUsd: n(t.turnover_usd), change24h: n(t.mark_change_24h), oiChangeUsd6h: n(t.oi_change_usd_6h),
  };
}

export async function chainOf(env: OptEnv, underlying: string, deps = defaultOptionsDeps): Promise<Chain & { tickSize: number }> {
  const [ts, ps] = await Promise.all([allTickers(env, deps), products(env, deps)]);
  const mine = ts.filter((t) => t.underlying_asset_symbol === underlying);
  if (!mine.length) throw new NotFoundError(`No ${underlying} options listed${env === 'testnet' ? ' on testnet' : ''}.`);
  const now = deps.now();
  const quotes = mine.map((t) => toQuote(t, ps[t.symbol]?.settle ?? null)).filter((q): q is OptionQuote => !!q && q.expiry > now);
  const spot = n(mine.find((t) => n(t.spot_price))?.spot_price) ?? 0;
  return { underlying, spot, contractValue: n(mine[0]!.contract_value) ?? ps[mine[0]!.symbol]?.cv ?? 1, tickSize: n(mine[0]!.tick_size) ?? 0.1, asOf: now, quotes };
}

export async function underlyings(env: OptEnv, deps = defaultOptionsDeps) {
  const ts = await allTickers(env, deps);
  const by = new Map<string, { underlying: string; spot: number | null; contracts: number; oiUsd: number; volumeUsd: number; expiries: Set<string> }>();
  for (const t of ts) {
    const u = t.underlying_asset_symbol;
    if (!u) continue;
    const r = by.get(u) ?? { underlying: u, spot: n(t.spot_price), contracts: 0, oiUsd: 0, volumeUsd: 0, expiries: new Set<string>() };
    r.contracts += 1; r.oiUsd += n(t.oi_value_usd) ?? 0; r.volumeUsd += t.turnover_usd ?? 0;
    const code = t.symbol.split('-').at(-1);
    if (code) r.expiries.add(code);
    by.set(u, r);
  }
  return [...by.values()].sort((a, b) => b.oiUsd - a.oiUsd).map((r) => ({ ...r, expiries: r.expiries.size }));
}

const pickExpiry = (c: Chain, code?: string) => {
  const exps = expiriesOf(c);
  const hit = code ? exps.find((e) => e.code === code) : undefined;
  if (code && !hit) throw new NotFoundError(`No ${c.underlying} expiry ${code}.`);
  // Default: the nearest expiry at least a day out, so a few hours of a daily don't dominate.
  return hit ?? exps.find((e) => e.days >= 1) ?? exps[0];
};

export async function chain(env: OptEnv, underlying: string, expiryCode: string | undefined, deps = defaultOptionsDeps) {
  const c = await chainOf(env, underlying, deps);
  const e = pickExpiry(c, expiryCode);
  if (!e) throw new NotFoundError(`No ${underlying} options listed.`);
  return {
    env, underlying, spot: c.spot, contractValue: c.contractValue, tickSize: c.tickSize, asOf: c.asOf,
    expiries: expiriesOf(c).map((x) => ({ code: x.code, expiry: x.expiry, days: x.days, contracts: x.contracts })),
    expiry: e.code, stats: expiryStats(c, e.expiry),
    quotes: c.quotes.filter((q) => q.expiry === e.expiry).sort((a, b) => a.strike - b.strike || a.kind.localeCompare(b.kind)),
  };
}

export async function optionsOverview(env: OptEnv, underlying: string, expiryCode: string | undefined, deps = defaultOptionsDeps) {
  const c = await chainOf(env, underlying, deps);
  const e = pickExpiry(c, expiryCode);
  return { env, ...overview(c), expiry: e?.code ?? null, strikes: e ? byStrike(c, e.expiry) : [], allStrikes: byStrike(c, null) };
}

export async function contract(env: OptEnv, symbol: string, deps = defaultOptionsDeps) {
  const s = parseOptionSymbol(symbol);
  if (!s) throw new ValidationError('Not an option symbol.');
  const c = await chainOf(env, s.underlying, deps);
  const q = c.quotes.find((x) => x.symbol === symbol);
  if (!q) throw new NotFoundError(`${symbol} isn't listed${env === 'testnet' ? ' on testnet' : ''}.`);
  const book = await deps.get<Env<{ buy: Array<{ price: string; size: number }>; sell: Array<{ price: string; size: number }> }>>(env, `/v2/l2orderbook/${encodeURIComponent(symbol)}?depth=10`);
  return {
    env, underlying: s.underlying, spot: c.spot, contractValue: c.contractValue, tickSize: c.tickSize, quote: q, days: (q.expiry - c.asOf) / 86_400_000,
    book: { bids: book.result.buy.map((b) => ({ price: Number(b.price), size: b.size })), asks: book.result.sell.map((a) => ({ price: Number(a.price), size: a.size })) },
  };
}

interface DCandle { time: number; open: number; high: number; low: number; close: number; volume: number | null }
const candlesFor = async (env: OptEnv, symbol: string, res: Resolution, from: number, to: number, deps: OptionsDeps) => {
  const r = await deps.get<Env<DCandle[]>>(env, `/v2/history/candles?symbol=${encodeURIComponent(symbol)}&resolution=${res}&start=${Math.floor(from / 1000)}&end=${Math.floor(to / 1000)}`);
  return r.result.map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })).sort((a, b) => a.t - b.t);
};

/**
 * One contract's history: traded price, mark, open interest, or IV. Delta has
 * no IV history, so IV is solved from each mark close against the index close.
 */
export async function contractCandles(env: OptEnv, symbol: string, kind: 'price' | 'mark' | 'oi' | 'iv', res: Resolution, days: number, deps = defaultOptionsDeps) {
  const s = parseOptionSymbol(symbol);
  if (!s) throw new ValidationError('Not an option symbol.');
  const to = deps.now();
  const from = to - Math.min(days, 90) * 86_400_000;
  return cached(deps, `options:candles:${env}:${symbol}:${kind}:${res}:${days}:${Math.floor(to / (RES_S[res] * 1000))}`, Math.min(300, RES_S[res]), async () => {
    if (kind !== 'iv') return { symbol, kind, resolution: res, candles: await candlesFor(env, `${kind === 'mark' ? 'MARK:' : kind === 'oi' ? 'OI:' : ''}${symbol}`, res, from, to, deps) };
    const ps = await products(env, deps);
    const index = ps[symbol]?.index;
    if (!index) throw new NotFoundError(`${symbol} isn't listed.`);
    const expiry = ps[symbol]?.settle ?? s.expiry;
    const [mark, idx] = await Promise.all([candlesFor(env, `MARK:${symbol}`, res, from, to, deps), candlesFor(env, index, res, from, to, deps)]);
    const spotAt = new Map(idx.map((c) => [c.t, c.c]));
    const candles = mark.map((m) => {
      const spot = spotAt.get(m.t);
      const T = (expiry - (m.t + RES_S[res] * 1000)) / YEAR_MS;
      const iv = spot ? impliedVol(s.kind, m.c, spot, s.strike, T) : null;
      return { t: m.t, o: iv, h: iv, l: iv, c: iv, v: null };
    }).filter((c) => c.c != null);
    return { symbol, kind, resolution: res, candles };
  });
}

/**
 * Rolling ATM straddle (or a fixed strangle) for one expiry: at each bar, the
 * call and put marks at the strike nearest the index (or the two given
 * strikes) added up. Only strikes the index actually visited are fetched.
 */
export async function premiumSeries(env: OptEnv, underlying: string, expiryCode: string, res: Resolution, days: number, strangle: { put: number; call: number } | null, deps = defaultOptionsDeps) {
  const c = await chainOf(env, underlying, deps);
  const e = expiriesOf(c).find((x) => x.code === expiryCode);
  if (!e) throw new NotFoundError(`No ${underlying} expiry ${expiryCode}.`);
  const ps = await products(env, deps);
  const anySym = c.quotes.find((q) => q.expiry === e.expiry)!.symbol;
  const index = ps[anySym]?.index;
  if (!index) throw new NotFoundError('No index for this expiry.');
  const to = deps.now();
  const from = to - Math.min(days, 30) * 86_400_000;
  return cached(deps, `options:premium:${env}:${underlying}:${expiryCode}:${res}:${days}:${strangle ? `${strangle.put}-${strangle.call}` : 'atm'}:${Math.floor(to / (RES_S[res] * 1000))}`, Math.min(300, RES_S[res]), async () => {
    const idx = await candlesFor(env, index, res, from, to, deps);
    const strikes = [...new Set(c.quotes.filter((q) => q.expiry === e.expiry).map((q) => q.strike))].sort((a, b) => a - b);
    const nearest = (s: number) => strikes.reduce((a, k) => (Math.abs(k - s) < Math.abs(a - s) ? k : a), strikes[0]!);
    const need = strangle ? [strangle.put, strangle.call] : [...new Set(idx.map((x) => nearest(x.c)))];
    if (need.length > 24) throw new ValidationError('The price moved across too many strikes for this range; pick a shorter one.');
    const marks = new Map<string, Map<number, number>>();
    await Promise.all(need.flatMap((k) => (['call', 'put'] as const).map(async (kind) => {
      const sym = `${kind === 'call' ? 'C' : 'P'}-${underlying}-${k}-${expiryCode}`;
      const cs = await candlesFor(env, `MARK:${sym}`, res, from, to, deps).catch(() => []);
      marks.set(sym, new Map(cs.map((x) => [x.t, x.c])));
    })));
    const points = idx.map((x) => {
      const kc = strangle ? strangle.call : nearest(x.c);
      const kp = strangle ? strangle.put : kc;
      const call = marks.get(`C-${underlying}-${kc}-${expiryCode}`)?.get(x.t);
      const put = marks.get(`P-${underlying}-${kp}-${expiryCode}`)?.get(x.t);
      return call != null && put != null ? { t: x.t, spot: x.c, callStrike: kc, putStrike: kp, premium: call + put } : null;
    }).filter((p): p is NonNullable<typeof p> => !!p);
    return { underlying, expiry: expiryCode, resolution: res, kind: strangle ? 'strangle' : 'straddle', points };
  });
}

// ── Multi-leg analysis (G6–G8) ──
export interface LegInput { kind: 'call' | 'put' | 'future'; side: 1 | -1; qty: number; strike?: number; expiry?: string; price?: number; iv?: number }

function resolveLegs(c: Chain, underlying: string, input: LegInput[]): Leg[] {
  return input.map((l, i) => {
    if (l.kind === 'future') return { kind: 'future', side: l.side, qty: l.qty, price: l.price ?? c.spot };
    const q = c.quotes.find((x) => x.kind === l.kind && x.strike === l.strike && x.expiryCode === l.expiry);
    if (!q) throw new ValidationError(`Leg ${i + 1}: no ${underlying} ${l.kind} at ${l.strike} for ${l.expiry}.`);
    const iv = l.iv ?? q.markIv ?? undefined;
    if (iv == null) throw new ValidationError(`Leg ${i + 1}: ${q.symbol} has no IV to value it with.`);
    return { kind: l.kind, side: l.side, qty: l.qty, strike: q.strike, expiry: q.expiry, price: l.price ?? q.mark ?? 0, iv, symbol: q.symbol };
  });
}

/** The price range to chart: ±3σ to the first expiry, widened to show every strike (and breakeven). */
function rangeFor(c: Chain, legs: Leg[], vol: number | null, extra: number[] = []) {
  const opts = legs.filter((l) => l.kind !== 'future');
  const firstExp = opts.length ? Math.min(...opts.map((l) => l.expiry!)) : null;
  const T = firstExp ? (firstExp - c.asOf) / YEAR_MS : 7 / 365;
  const sd = (vol ?? 0.5) * Math.sqrt(Math.max(T, 1 / 365));
  const ks = [...legs.filter((l) => l.strike).map((l) => l.strike!), ...extra];
  return { lo: Math.max(0, Math.min(c.spot * Math.exp(-3 * sd), ...ks.map((k) => k * 0.97))), hi: Math.max(c.spot * Math.exp(3 * sd), ...ks.map((k) => k * 1.03)), sd, firstExp };
}
const atmVolFor = (c: Chain, legs: Leg[]) => {
  const opts = legs.filter((l) => l.kind !== 'future');
  return opts.length ? expiryStats(c, Math.min(...opts.map((l) => l.expiry!))).atmIv : null;
};

/** Legs priced from the chain: options at their mark and mark IV unless given; futures at the index. */
export async function analyzeLegs(env: OptEnv, underlying: string, input: { legs: LegInput[]; at?: number; vol?: number }, deps = defaultOptionsDeps) {
  const c = await chainOf(env, underlying, deps);
  const legs = resolveLegs(c, underlying, input.legs);
  const now = c.asOf;
  const at = Math.max(now, Math.min(input.at ?? now, Math.min(...legs.filter((l) => l.expiry).map((l) => l.expiry!))));
  const vol = input.vol ?? atmVolFor(c, legs) ?? null;
  const s = summarize(legs, c.contractValue, c.spot, now, vol);
  const { lo, hi, sd, firstExp } = rangeFor(c, legs, vol, s.breakevens);
  return {
    env, underlying, spot: c.spot, contractValue: c.contractValue, asOf: now, at, vol,
    legs: legs.map((l) => ({ ...l, expiryCode: l.symbol ? parseOptionSymbol(l.symbol)!.expiryCode : null, mark: l.kind === 'future' ? c.spot : c.quotes.find((q) => q.symbol === l.symbol)?.mark ?? null })),
    summary: s,
    payoff: payoff(legs, c.contractValue, { from: lo, to: hi, steps: 160, at }),
    analysis: analyse(legs, c, s),
    sigma: vol != null && firstExp ? { lo: c.spot * Math.exp(-sd), hi: c.spot * Math.exp(sd) } : null,
  };
}

/**
 * Expiry replay (G10): paper legs walked to their first expiry along either a
 * flat price (pure time decay) or the index's own recent moves replayed from
 * today's price, compressed or stretched to fit the time left.
 */
export async function replayLegs(env: OptEnv, underlying: string, input: { legs: LegInput[]; path: 'flat' | 'recorded' }, deps = defaultOptionsDeps) {
  const c = await chainOf(env, underlying, deps);
  const legs = resolveLegs(c, underlying, input.legs);
  const vol = atmVolFor(c, legs);
  const { lo, hi, firstExp } = rangeFor(c, legs, vol);
  if (!firstExp) throw new ValidationError('Add at least one option leg to replay to expiry.');
  const now = c.asOf;
  const span = firstExp - now;
  const steps = Math.max(2, Math.min(240, Math.ceil(span / 3_600_000)));
  let path: Array<{ t: number; spot: number }>;
  let recorded: { from: number; to: number } | null = null;
  if (input.path === 'flat') {
    path = Array.from({ length: steps + 1 }, (_, i) => ({ t: now + (span * i) / steps, spot: c.spot }));
  } else {
    const ps = await products(env, deps);
    const index = ps[legs.find((l) => l.symbol)!.symbol!]?.index;
    if (!index) throw new NotFoundError('No index for these options.');
    // The most recent stretch of history as long as the time left (up to 30 days).
    const len = Math.min(span, 30 * 86_400_000);
    const res: Resolution = len <= 10 * 86_400_000 ? '1h' : '4h';
    const hist = await candlesFor(env, index, res, now - len, now, deps);
    if (hist.length < 2) throw new ValidationError('Not enough recorded prices to replay.');
    const t0 = hist[0]!.t;
    const t1 = hist.at(-1)!.t;
    const p0 = hist[0]!.c;
    recorded = { from: t0, to: t1 };
    path = hist.map((h) => ({ t: now + ((h.t - t0) / Math.max(1, t1 - t0)) * span, spot: (c.spot * h.c) / p0 }));
  }
  const grid = Array.from({ length: 61 }, (_, i) => lo + ((hi - lo) * i) / 60);
  return {
    env, underlying, spot: c.spot, contractValue: c.contractValue, asOf: now, vol, path: input.path, recorded,
    legs: legs.map((l) => ({ kind: l.kind, side: l.side, qty: l.qty, strike: l.strike, expiry: l.expiry, price: l.price, iv: l.iv, symbol: l.symbol })),
    replay: replay(legs, c.contractValue, path, { vol, grid }),
  };
}

export function templateLegs(c: Pick<Chain, 'quotes' | 'spot'>, id: string, expiry: number, farExpiry: number | undefined, qty: number) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new NotFoundError('Unknown template.');
  const strikes = [...new Set(c.quotes.filter((q) => q.expiry === expiry).map((q) => q.strike))];
  const farStrikes = farExpiry ? [...new Set(c.quotes.filter((q) => q.expiry === farExpiry).map((q) => q.strike))] : undefined;
  return resolveTemplate(t, { strikes, farStrikes, spot: c.spot, expiry, farExpiry, qty });
}

export const templates = () => TEMPLATES.map(({ id, name, categories, about, legs }) => ({ id, name, categories, about, legs: legs.length, needsFar: legs.some((l) => l.far) }));

/** Resolve a template against the live chain into legs ready for analyzeLegs. */
export async function templateFor(env: OptEnv, underlying: string, id: string, expiryCode: string, qty: number, deps = defaultOptionsDeps): Promise<LegInput[]> {
  const c = await chainOf(env, underlying, deps);
  const exps = expiriesOf(c);
  const e = exps.find((x) => x.code === expiryCode);
  if (!e) throw new NotFoundError(`No ${underlying} expiry ${expiryCode}.`);
  // The far leg of a calendar: the next expiry at least a week later.
  const far = exps.find((x) => x.expiry >= e.expiry + 6 * 86_400_000);
  const legs = templateLegs(c, id, e.expiry, far?.expiry, qty);
  if (!legs) throw new ValidationError('This template needs a later expiry, and there isn’t one listed.');
  return legs.map((l) => ({ kind: l.kind, side: l.side, qty: l.qty, strike: l.strike, expiry: l.expiry == null ? undefined : exps.find((x) => x.expiry === l.expiry)!.code }));
}

