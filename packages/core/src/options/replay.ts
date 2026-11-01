// Expiry replay (G10): walk a set of paper legs along a price path to their
// first expiry, repricing each step with Black-Scholes at the legs' own IVs,
// so time decay ("melt") and the moves both show. Each frame also carries
// the ±1σ band the IV implied at the start, and the whole payoff curve.
import { normCdf, YEAR_MS } from './bs.js';
import { firstExpiry, legsGreeks, legValue, pnlAt, type Leg, type PositionGreeks } from './legs.js';

export interface ReplayFrame {
  t: number;
  spot: number;
  pnl: number;
  /** Per-leg value per unit at this step. */
  values: number[];
  greeks: PositionGreeks;
  /** ±1σ around the start price for the time elapsed so far. */
  band: { lo: number; hi: number } | null;
  /** P&L across the price grid at this step. */
  curve: number[];
}
export interface Replay { start: number; end: number; grid: number[]; frames: ReplayFrame[]; expiryCurve: number[] }

/**
 * path: prices at increasing times, starting now. Times past the first expiry
 * are dropped; the last frame is pinned to the expiry itself.
 */
export function replay(legs: Leg[], cv: number, path: Array<{ t: number; spot: number }>, opts: { vol: number | null; grid: number[] }): Replay {
  const end = firstExpiry(legs);
  const start = path[0]!.t;
  const s0 = path[0]!.spot;
  const steps = path.filter((p) => !Number.isFinite(end) || p.t <= end);
  if (Number.isFinite(end) && steps.at(-1)!.t < end) steps.push({ t: end, spot: steps.at(-1)!.spot });
  const frames = steps.map((p): ReplayFrame => {
    const T = Math.max(0, (p.t - start) / YEAR_MS);
    const sd = opts.vol ? opts.vol * Math.sqrt(T) : null;
    return {
      t: p.t, spot: p.spot, pnl: pnlAt(legs, cv, p.spot, p.t),
      values: legs.map((l) => legValue(l, p.spot, p.t)),
      greeks: legsGreeks(legs, cv, p.spot, p.t),
      band: sd != null ? { lo: s0 * Math.exp(-sd), hi: s0 * Math.exp(sd) } : null,
      curve: opts.grid.map((s) => pnlAt(legs, cv, s, p.t)),
    };
  });
  return { start, end: Number.isFinite(end) ? end : steps.at(-1)!.t, grid: opts.grid, frames, expiryCurve: opts.grid.map((s) => pnlAt(legs, cv, s, Number.isFinite(end) ? end : steps.at(-1)!.t)) };
}

/** Chance the price is inside [lo, hi] at time T (years), driftless lognormal. */
export function probInside(spot: number, lo: number, hi: number, vol: number, T: number): number {
  if (T <= 0) return spot >= lo && spot <= hi ? 1 : 0;
  const sd = vol * Math.sqrt(T);
  const z = (x: number) => (Math.log(x / spot) + 0.5 * sd * sd) / sd;
  return normCdf(z(hi)) - normCdf(z(lo));
}
