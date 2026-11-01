// Option chain analytics (G2, G5): ATM IV, expected move, skew, term
// structure, gamma exposure, OI and IV by strike and expiry, max pain. Input
// is one venue snapshot; nothing here fetches.
import { bsGreeks, YEAR_MS, type OptionKind } from './bs.js';

export interface OptionQuote {
  symbol: string;
  kind: OptionKind;
  strike: number;
  /** Settlement time, ms. */
  expiry: number;
  expiryCode: string;
  productId?: number;
  mark: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  /** Fractions: 0.45 = 45 %. */
  markIv: number | null;
  bidIv: number | null;
  askIv: number | null;
  delta: number | null;
  gamma: number | null;
  /** Per day. */
  theta: number | null;
  /** Per vol point. */
  vega: number | null;
  rho: number | null;
  /** Contracts. */
  oi: number;
  oiUsd: number | null;
  /** 24 h volume in contracts. */
  volume: number;
  turnoverUsd: number | null;
  /** % change of the mark over 24 h. */
  change24h: number | null;
  oiChangeUsd6h: number | null;
}
export interface Chain { underlying: string; spot: number; contractValue: number; asOf: number; quotes: OptionQuote[] }

export const yearsTo = (expiry: number, now: number) => Math.max(0, (expiry - now) / YEAR_MS);

export function expiriesOf(c: Chain): Array<{ expiry: number; code: string; days: number; contracts: number }> {
  const m = new Map<number, { code: string; n: number }>();
  for (const q of c.quotes) { const e = m.get(q.expiry) ?? { code: q.expiryCode, n: 0 }; e.n += 1; m.set(q.expiry, e); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([expiry, e]) => ({ expiry, code: e.code, days: (expiry - c.asOf) / 86_400_000, contracts: e.n }));
}

const ofExpiry = (c: Chain, expiry: number) => c.quotes.filter((q) => q.expiry === expiry);
export const strikesOf = (c: Chain, expiry: number) => [...new Set(ofExpiry(c, expiry).map((q) => q.strike))].sort((a, b) => a - b);
export function atmStrike(c: Chain, expiry: number): number | null {
  const ks = strikesOf(c, expiry);
  if (!ks.length) return null;
  return ks.reduce((best, k) => (Math.abs(k - c.spot) < Math.abs(best - c.spot) ? k : best), ks[0]!);
}

/** Linear interpolation of y over x (sorted ascending), clamped to the ends. */
function interp(points: Array<[number, number]>, x: number): number | null {
  if (!points.length) return null;
  const p = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= p[0]![0]) return p[0]![1];
  if (x >= p[p.length - 1]![0]) return p[p.length - 1]![1];
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!;
    const [x1, y1] = p[i]!;
    if (x <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return null;
}

/** The smile: out-of-the-money mark IVs (puts below spot, calls above), by strike. */
export function smile(c: Chain, expiry: number): Array<[number, number]> {
  return ofExpiry(c, expiry)
    .filter((q) => q.markIv != null && q.markIv > 0 && ((q.kind === 'put' && q.strike <= c.spot) || (q.kind === 'call' && q.strike >= c.spot)))
    .map((q) => [q.strike, q.markIv!] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}
export const ivAtStrike = (c: Chain, expiry: number, strike: number) => interp(smile(c, expiry), strike);
/** ATM IV: the smile at the spot. */
export const atmIv = (c: Chain, expiry: number) => ivAtStrike(c, expiry, c.spot);

/** IV at a given delta (0.25 call, −0.25 put), interpolated over that side's contracts. */
export function ivAtDelta(c: Chain, expiry: number, kind: OptionKind, delta: number): number | null {
  const pts = ofExpiry(c, expiry).filter((q) => q.kind === kind && q.delta != null && q.markIv != null && q.markIv > 0).map((q) => [q.delta!, q.markIv!] as [number, number]);
  // Only interpolate inside the quoted range: a 25-delta read from the wings would be made up.
  if (pts.length < 2) return null;
  const ds = pts.map((p) => p[0]);
  if (delta < Math.min(...ds) || delta > Math.max(...ds)) return null;
  return interp(pts, delta);
}

export interface ExpiryStats {
  expiry: number; code: string; days: number;
  atmStrike: number | null; atmIv: number | null;
  /** ATM call + put marks: the market's priced move to expiry, in USD. */
  straddle: number | null;
  /** 1σ move from ATM IV, in USD. */
  sigmaMove: number | null;
  rr25: number | null; fly25: number | null;
  callOi: number; putOi: number; volume: number;
  maxPain: number | null;
}

export function expiryStats(c: Chain, expiry: number): ExpiryStats {
  const qs = ofExpiry(c, expiry);
  const T = yearsTo(expiry, c.asOf);
  const k = atmStrike(c, expiry);
  const call = qs.find((q) => q.kind === 'call' && q.strike === k);
  const put = qs.find((q) => q.kind === 'put' && q.strike === k);
  const iv = atmIv(c, expiry);
  const c25 = ivAtDelta(c, expiry, 'call', 0.25);
  const p25 = ivAtDelta(c, expiry, 'put', -0.25);
  return {
    expiry, code: qs[0]?.expiryCode ?? '', days: T * 365,
    atmStrike: k, atmIv: iv,
    straddle: call?.mark != null && put?.mark != null ? call.mark + put.mark : null,
    sigmaMove: iv != null ? c.spot * iv * Math.sqrt(T) : null,
    rr25: c25 != null && p25 != null ? c25 - p25 : null,
    fly25: c25 != null && p25 != null && iv != null ? (c25 + p25) / 2 - iv : null,
    callOi: qs.filter((q) => q.kind === 'call').reduce((a, q) => a + q.oi, 0),
    putOi: qs.filter((q) => q.kind === 'put').reduce((a, q) => a + q.oi, 0),
    volume: qs.reduce((a, q) => a + q.volume, 0),
    maxPain: maxPain(c, expiry),
  };
}

/** The settlement price that pays option holders the least. */
export function maxPain(c: Chain, expiry: number): number | null {
  const qs = ofExpiry(c, expiry).filter((q) => q.oi > 0);
  if (!qs.length) return null;
  let best: number | null = null;
  let low = Infinity;
  for (const s of strikesOf(c, expiry)) {
    const pay = qs.reduce((a, q) => a + q.oi * (q.kind === 'call' ? Math.max(0, s - q.strike) : Math.max(0, q.strike - s)), 0);
    if (pay < low) { low = pay; best = s; }
  }
  return best;
}

/**
 * Gamma exposure in USD per 1 % move, with the usual convention that dealers
 * are long the calls and short the puts people trade (calls +, puts −).
 */
export const gexOf = (q: OptionQuote, spot: number, contractValue: number) => (q.gamma ?? 0) * q.oi * contractValue * spot * spot * 0.01 * (q.kind === 'call' ? 1 : -1);

export interface StrikeRow { strike: number; callOi: number; putOi: number; callIv: number | null; putIv: number | null; callVolume: number; putVolume: number; gex: number }
export function byStrike(c: Chain, expiry: number | null): StrikeRow[] {
  const m = new Map<number, StrikeRow>();
  for (const q of expiry == null ? c.quotes : ofExpiry(c, expiry)) {
    const r = m.get(q.strike) ?? { strike: q.strike, callOi: 0, putOi: 0, callIv: null, putIv: null, callVolume: 0, putVolume: 0, gex: 0 };
    if (q.kind === 'call') { r.callOi += q.oi; r.callVolume += q.volume; if (expiry != null) r.callIv = q.markIv; }
    else { r.putOi += q.oi; r.putVolume += q.volume; if (expiry != null) r.putIv = q.markIv; }
    r.gex += gexOf(q, c.spot, c.contractValue);
    m.set(q.strike, r);
  }
  return [...m.values()].sort((a, b) => a.strike - b.strike);
}

/** Gamma×OI-weighted average strike: where option gamma is concentrated. */
export function gammaCentre(c: Chain, expiry: number | null = null): number | null {
  let w = 0;
  let sum = 0;
  for (const q of expiry == null ? c.quotes : ofExpiry(c, expiry)) { const g = (q.gamma ?? 0) * q.oi; w += g; sum += g * q.strike; }
  return w > 0 ? sum / w : null;
}

/**
 * Where total dealer gamma changes sign as the price moves: gamma is
 * recomputed with Black-Scholes at each trial price using each contract's
 * mark IV. Null when it doesn't flip within ±30 %.
 */
export function gammaFlip(c: Chain): number | null {
  const net = (s: number) => c.quotes.reduce((a, q) => {
    const T = yearsTo(q.expiry, c.asOf);
    if (!q.oi || !q.markIv || T <= 0) return a;
    return a + bsGreeks(q.kind, s, q.strike, T, q.markIv).gamma * q.oi * c.contractValue * s * s * 0.01 * (q.kind === 'call' ? 1 : -1);
  }, 0);
  const steps = 60;
  let prevS = c.spot * 0.7;
  let prev = net(prevS);
  let best: number | null = null;
  for (let i = 1; i <= steps; i++) {
    const s = c.spot * (0.7 + (0.6 * i) / steps);
    const v = net(s);
    if (prev === 0 || Math.sign(v) !== Math.sign(prev)) {
      const x = prev === v ? s : prevS + ((s - prevS) * prev) / (prev - v);
      if (best == null || Math.abs(x - c.spot) < Math.abs(best - c.spot)) best = x;
    }
    prevS = s;
    prev = v;
  }
  return best;
}

export interface OptionsOverview {
  underlying: string; spot: number; asOf: number;
  expiries: ExpiryStats[];
  /** ATM IV by expiry, nearest first. */
  term: Array<{ expiry: number; days: number; atmIv: number | null }>;
  /** Far ATM IV minus near, in vol points (positive = contango). */
  termSlope: number | null;
  callOi: number; putOi: number; putCallOi: number | null;
  gammaCentre: number | null; gammaFlip: number | null; netGex: number;
}

export function overview(c: Chain): OptionsOverview {
  const exps = expiriesOf(c).filter((e) => e.expiry > c.asOf).map((e) => expiryStats(c, e.expiry));
  const term = exps.map((e) => ({ expiry: e.expiry, days: e.days, atmIv: e.atmIv }));
  const withIv = term.filter((t) => t.atmIv != null);
  const callOi = c.quotes.filter((q) => q.kind === 'call').reduce((a, q) => a + q.oi, 0);
  const putOi = c.quotes.filter((q) => q.kind === 'put').reduce((a, q) => a + q.oi, 0);
  return {
    underlying: c.underlying, spot: c.spot, asOf: c.asOf, expiries: exps, term,
    termSlope: withIv.length >= 2 ? (withIv[withIv.length - 1]!.atmIv! - withIv[0]!.atmIv!) * 100 : null,
    callOi, putOi, putCallOi: callOi > 0 ? putOi / callOi : null,
    gammaCentre: gammaCentre(c), gammaFlip: gammaFlip(c),
    netGex: c.quotes.reduce((a, q) => a + gexOf(q, c.spot, c.contractValue), 0),
  };
}
