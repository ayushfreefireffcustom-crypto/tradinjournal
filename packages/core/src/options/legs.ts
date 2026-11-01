// Multi-leg positions (G6, G7): value, payoff, Greeks and the summary numbers.
// A leg's quantity is in contracts; contractValue turns contracts into units of
// the underlying (0.001 BTC on Delta), so every P&L here is in USD.
import { bsGreeks, bsPrice, normCdf, YEAR_MS, type OptionKind } from './bs.js';

export interface Leg {
  kind: OptionKind | 'future';
  /** 1 buy, −1 sell. */
  side: 1 | -1;
  /** Contracts. */
  qty: number;
  strike?: number;
  /** Settlement, ms (options only). */
  expiry?: number;
  /** Entry price per unit of the underlying. */
  price: number;
  /** Vol used to value it before expiry (fraction). */
  iv?: number;
  symbol?: string;
}

const units = (l: Leg, cv: number) => l.side * l.qty * cv;

/** One leg's value per unit at a price and time. */
export function legValue(l: Leg, spot: number, at: number): number {
  if (l.kind === 'future') return spot;
  const T = Math.max(0, (l.expiry! - at) / YEAR_MS);
  return bsPrice(l.kind, spot, l.strike!, T, l.iv ?? 0);
}

export const pnlAt = (legs: Leg[], cv: number, spot: number, at: number) => legs.reduce((a, l) => a + units(l, cv) * (legValue(l, spot, at) - l.price), 0);

/** The first expiry among the option legs (calendar spreads value later legs there). */
export const firstExpiry = (legs: Leg[]) => Math.min(...legs.filter((l) => l.kind !== 'future' && l.expiry != null).map((l) => l.expiry!));

export interface PayoffPoint { s: number; expiry: number; now: number }
export function payoff(legs: Leg[], cv: number, opts: { from: number; to: number; steps?: number; at: number }): PayoffPoint[] {
  const n = opts.steps ?? 200;
  const exp = firstExpiry(legs);
  const end = Number.isFinite(exp) ? exp : opts.at;
  const out: PayoffPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const s = opts.from + ((opts.to - opts.from) * i) / n;
    out.push({ s, expiry: pnlAt(legs, cv, s, end), now: pnlAt(legs, cv, s, opts.at) });
  }
  return out;
}

export interface PositionGreeks { delta: number; gamma: number; theta: number; vega: number }
/** Position Greeks in USD terms: delta in units of the underlying, theta and vega in USD. */
export function legsGreeks(legs: Leg[], cv: number, spot: number, at: number): PositionGreeks {
  const g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const l of legs) {
    const u = units(l, cv);
    if (l.kind === 'future') { g.delta += u; continue; }
    const x = bsGreeks(l.kind, spot, l.strike!, Math.max(0, (l.expiry! - at) / YEAR_MS), l.iv ?? 0);
    g.delta += u * x.delta; g.gamma += u * x.gamma; g.theta += u * x.theta; g.vega += u * x.vega;
  }
  return g;
}

export interface LegsSummary {
  /** Paid (+) or received (−) to open, USD. */
  netPremium: number;
  /** null = unlimited. */
  maxProfit: number | null;
  maxLoss: number | null;
  /** Prices where the expiry P&L crosses zero. */
  breakevens: number[];
  /** maxProfit / |maxLoss| when both are finite. */
  riskReward: number | null;
  /** Chance of any profit at the first expiry, lognormal with the given vol. */
  probProfit: number | null;
  greeks: PositionGreeks;
}

export function summarize(legs: Leg[], cv: number, spot: number, at: number, vol: number | null): LegsSummary {
  const netPremium = legs.filter((l) => l.kind !== 'future').reduce((a, l) => a + units(l, cv) * l.price, 0);
  const exp = firstExpiry(legs);
  const end = Number.isFinite(exp) ? exp : at;
  const single = new Set(legs.filter((l) => l.kind !== 'future').map((l) => l.expiry)).size <= 1;
  const f = (s: number) => pnlAt(legs, cv, s, end);
  // Slopes past the last strike / at zero decide whether the ends are unbounded.
  const upSlope = legs.reduce((a, l) => a + (l.kind === 'put' ? 0 : units(l, cv)), 0);
  const strikes = legs.filter((l) => l.strike != null).map((l) => l.strike!);
  const hiK = Math.max(spot, ...strikes);
  // With one expiry the payoff is piecewise linear, so its extremes sit at 0, the strikes or far out.
  const grid = single
    ? [0, ...strikes, hiK * 3]
    : Array.from({ length: 801 }, (_, i) => (hiK * 3 * i) / 800);
  const vals = grid.map(f);
  let maxProfit: number | null = Math.max(...vals);
  let maxLoss: number | null = Math.min(...vals);
  if (upSlope > 1e-12) maxProfit = null;
  if (upSlope < -1e-12) maxLoss = null;
  // Breakevens on a fine grid.
  const breakevens: number[] = [];
  const N = 2000;
  const top = hiK * 3;
  let ps = 0;
  let pv = f(0);
  for (let i = 1; i <= N; i++) {
    const s = (top * i) / N;
    const v = f(s);
    if ((pv < 0 && v >= 0) || (pv > 0 && v <= 0)) {
      // Refine by bisection.
      let a = ps;
      let b = s;
      for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(pv)) a = m; else b = m; }
      breakevens.push((a + b) / 2);
    }
    ps = s;
    pv = v;
  }
  let probProfit: number | null = null;
  if (vol && vol > 0) {
    const T = Math.max(1e-9, (end - at) / YEAR_MS);
    const sd = vol * Math.sqrt(T);
    // P(S_T < x) under a driftless lognormal.
    const cdf = (x: number) => (x <= 0 ? 0 : normCdf((Math.log(x / spot) + 0.5 * sd * sd) / sd));
    const edges = [0, ...breakevens, Infinity];
    probProfit = 0;
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i]!;
      const b = edges[i + 1]!;
      const mid = Number.isFinite(b) ? (a + b) / 2 : a * 1.5 + 1;
      if (f(mid) > 0) probProfit += (Number.isFinite(b) ? cdf(b) : 1) - cdf(a);
    }
  }
  const mp = maxProfit;
  const ml = maxLoss;
  return {
    netPremium, maxProfit: mp, maxLoss: ml, breakevens,
    riskReward: mp != null && ml != null && ml < 0 ? mp / -ml : null,
    probProfit, greeks: legsGreeks(legs, cv, spot, at),
  };
}
