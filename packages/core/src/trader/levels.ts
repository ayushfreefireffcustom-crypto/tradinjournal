// Deterministic trade levels from price, ATR, direction and S/R. Ordering is
// GUARANTEED here (T1<T2<T3 for longs, reversed for shorts) so nothing
// downstream — engine or LLM-merged — can ship an inverted target set. Pure.
import type { AnalysisLevels, SRLevel, TraderDirection } from './types.js';

/** Entry zone half-width in ATR. */
export const ENTRY_ATR_FRAC = 0.25;
/** Default stop distance from entry in ATR when no S/R gives a better one. */
export const STOP_ATR_MULT = 1.5;
/** Stop must sit at least this many ATR away (avoids noise stops). */
export const MIN_STOP_ATR = 0.8;
/** …and at most this many ATR away (avoids absurdly wide S/R stops). */
export const MAX_STOP_ATR = 3.0;
/** Baseline target R-multiples when S/R doesn't provide them. */
export const TARGET_R = [1, 2, 3.2] as const;
/** Snap a baseline target to an S/R level if within this fraction of R. */
export const SNAP_R_FRAC = 0.6;

export function roundPx(n: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n * 100) / 100;
  if (abs >= 1) return Math.round(n * 10000) / 10000;
  return Math.round(n * 1e6) / 1e6;
}

/** Nearest level to `target` within `maxDist`, else null. */
function nearestWithin(levels: SRLevel[], target: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const l of levels) {
    const d = Math.abs(l.price - target);
    if (d < bestD && d <= maxDist) {
      bestD = d;
      best = l.price;
    }
  }
  return best;
}

interface DeriveInput {
  price: number;
  atr: number;
  direction: TraderDirection;
  /** Support below price, resistance above (as from extractFeatures). */
  support: SRLevel[];
  resistance: SRLevel[];
}

/**
 * Build entry/stop/T1-3. WAIT uses long-side geometry as neutral reference.
 * Falls back to pure ATR geometry when price/ATR are unusable.
 */
export function deriveLevels(input: DeriveInput): AnalysisLevels {
  const { price, atr, direction } = input;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atr) || atr <= 0) {
    return { direction: 'WAIT', entryLow: price, entryHigh: price, stop: price, t1: price, t2: price, t3: price };
  }

  const half = atr * ENTRY_ATR_FRAC;
  const entryLow = price - half;
  const entryHigh = price + half;
  const entry = price;
  const isShort = direction === 'SHORT';

  // ── Stop: prefer the nearest opposing S/R inside [MIN,MAX]×ATR, else ATR mult.
  const stopBand = { min: atr * MIN_STOP_ATR, max: atr * MAX_STOP_ATR };
  let stop: number;
  if (isShort) {
    const cand = input.resistance
      .filter((l) => l.price > entry && l.price - entry >= stopBand.min && l.price - entry <= stopBand.max)
      .sort((a, b) => a.price - b.price)[0];
    stop = cand ? cand.price + atr * 0.1 : entry + atr * STOP_ATR_MULT;
  } else {
    const cand = input.support
      .filter((l) => l.price < entry && entry - l.price >= stopBand.min && entry - l.price <= stopBand.max)
      .sort((a, b) => b.price - a.price)[0];
    stop = cand ? cand.price - atr * 0.1 : entry - atr * STOP_ATR_MULT;
  }

  const r = Math.abs(entry - stop);

  // ── Targets: baseline R-multiples, then snap toward real S/R, then enforce order.
  const dirLevels = isShort ? input.support : input.resistance;
  const raw = TARGET_R.map((m) => (isShort ? entry - m * r : entry + m * r));
  const snapped = raw.map((t) => nearestWithin(dirLevels, t, r * SNAP_R_FRAC) ?? t);

  const minGap = r * 0.5; // keep targets visibly separated
  let [t1, t2, t3] = snapped as [number, number, number];
  if (isShort) {
    // strictly decreasing, each below entry
    t1 = Math.min(t1, entry - minGap);
    t2 = Math.min(t2, t1 - minGap);
    t3 = Math.min(t3, t2 - minGap);
  } else {
    t1 = Math.max(t1, entry + minGap);
    t2 = Math.max(t2, t1 + minGap);
    t3 = Math.max(t3, t2 + minGap);
  }

  return {
    direction,
    entryLow: roundPx(entryLow),
    entryHigh: roundPx(entryHigh),
    stop: roundPx(stop),
    t1: roundPx(t1),
    t2: roundPx(t2),
    t3: roundPx(t3),
  };
}
