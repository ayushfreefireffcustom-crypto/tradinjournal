// Triple-barrier grading for Trader Master analyses.
// PURE — no I/O. Walks subsequent candles and records which barrier hit first.
//
// Barriers reuse the engine's own geometry:
//   upper = T1 (then T2/T3 upgrades if cleared before stop)
//   lower = stop
//   vertical = horizonBars of the LTF after asOf
//
// Tie-break on the same bar: stop wins (conservative — never overstate hits).

import type { Candle, TraderDirection } from './types.js';

export type GradeOutcome = 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED' | 'SKIPPED';
export type HitLevel = 'T1' | 'T2' | 'T3';

export const DEFAULT_HORIZON_BARS = 48;

/** Rank timeframes low→high so the LTF (price levels TF) is first. */
const TF_RANK: Record<string, number> = { '15m': 1, '1h': 2, '4h': 3, '1d': 4 };

export function lowestTimeframe(timeframes: string[]): string {
  if (timeframes.length === 0) return '1h';
  return [...timeframes].sort((a, b) => (TF_RANK[a] ?? 99) - (TF_RANK[b] ?? 99))[0]!;
}

export function timeframeMs(tf: string): number {
  switch (tf) {
    case '15m': return 15 * 60_000;
    case '1h': return 60 * 60_000;
    case '4h': return 4 * 60 * 60_000;
    case '1d': return 24 * 60 * 60_000;
    default: return 60 * 60_000;
  }
}

export interface GradeInput {
  direction: TraderDirection;
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  /** Analysis timestamp (epoch ms). Only candles with openTime > asOf are graded. */
  asOfMs: number;
  horizonBars?: number;
}

export interface GradeResult {
  /** null = still open (not enough bars / neither barrier within horizon). */
  outcome: GradeOutcome | null;
  hitLevel: HitLevel | null;
  horizonBars: number;
  mfePct: number;
  maePct: number;
  barsUsed: number;
}

function entryMid(low: number, high: number): number {
  return (low + high) / 2;
}

/**
 * Grade a LONG/SHORT call against subsequent candles.
 * WAIT → SKIPPED immediately (not a trade idea to score).
 * Returns outcome=null when the vertical barrier hasn't closed yet and neither
 * stop nor T1 has been touched — caller should retry later.
 */
export function gradeAnalysis(input: GradeInput, candles: Candle[]): GradeResult {
  const horizonBars = input.horizonBars ?? DEFAULT_HORIZON_BARS;
  const empty = { hitLevel: null as HitLevel | null, horizonBars, mfePct: 0, maePct: 0, barsUsed: 0 };

  if (input.direction === 'WAIT') {
    return { outcome: 'SKIPPED', ...empty };
  }

  const mid = entryMid(input.entryLow, input.entryHigh);
  if (!(mid > 0) || !Number.isFinite(mid)) {
    return { outcome: 'EXPIRED', ...empty };
  }

  const future = candles
    .filter((c) => c.openTime > input.asOfMs)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(0, horizonBars);

  let mfe = 0;
  let mae = 0;
  let bestHit: HitLevel | null = null;

  const isLong = input.direction === 'LONG';

  for (let i = 0; i < future.length; i++) {
    const c = future[i]!;
    const fav = isLong
      ? ((c.high - mid) / mid) * 100
      : ((mid - c.low) / mid) * 100;
    const adv = isLong
      ? ((mid - c.low) / mid) * 100
      : ((c.high - mid) / mid) * 100;
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;

    const stopHit = isLong ? c.low <= input.stop : c.high >= input.stop;
    const t1Hit = isLong ? c.high >= input.t1 : c.low <= input.t1;
    const t2Hit = isLong ? c.high >= input.t2 : c.low <= input.t2;
    const t3Hit = isLong ? c.high >= input.t3 : c.low <= input.t3;

    // Same-bar ambiguity: stop takes priority (conservative).
    if (stopHit) {
      return {
        outcome: 'STOP_HIT',
        hitLevel: null,
        horizonBars,
        mfePct: round4(mfe),
        maePct: round4(mae),
        barsUsed: i + 1,
      };
    }

    if (t1Hit || t2Hit || t3Hit) {
      if (t3Hit) bestHit = 'T3';
      else if (t2Hit) bestHit = 'T2';
      else bestHit = 'T1';
      return {
        outcome: 'TARGET_HIT',
        hitLevel: bestHit,
        horizonBars,
        mfePct: round4(mfe),
        maePct: round4(mae),
        barsUsed: i + 1,
      };
    }
  }

  if (future.length >= horizonBars) {
    return {
      outcome: 'EXPIRED',
      hitLevel: null,
      horizonBars,
      mfePct: round4(mfe),
      maePct: round4(mae),
      barsUsed: future.length,
    };
  }

  // Still within horizon — leave pending for the next cron tick.
  return {
    outcome: null,
    hitLevel: null,
    horizonBars,
    mfePct: round4(mfe),
    maePct: round4(mae),
    barsUsed: future.length,
  };
}

/** Approximate R-multiple for expectancy (T1≈1R, T2≈2R, T3≈3.2R; stop≈−1R). */
export function outcomeRMultiple(
  outcome: GradeOutcome,
  hitLevel: HitLevel | null,
): number | null {
  if (outcome === 'STOP_HIT') return -1;
  if (outcome === 'EXPIRED') return 0;
  if (outcome === 'SKIPPED') return null;
  if (outcome === 'TARGET_HIT') {
    if (hitLevel === 'T3') return 3.2;
    if (hitLevel === 'T2') return 2;
    return 1;
  }
  return null;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
