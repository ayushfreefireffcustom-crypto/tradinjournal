// The safety net. `validateLevels` decides whether a level set — whether from
// our own engine or refined by an LLM — is coherent enough to ship. The service
// only accepts LLM numbers that pass; otherwise it keeps the engine's levels.
// This is what makes hallucinated prices impossible to reach the user.
import type { AnalysisLevels } from './types.js';

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

/** How far (in ATR) the entry mid may sit from the reference price. */
export const MAX_ENTRY_DRIFT_ATR = 1.2;
/** Minimum acceptable reward:risk to T1. */
export const MIN_RR = 0.9;

/**
 * Validate a level set against the live price + ATR. Checks finiteness,
 * positivity, entry proximity, stop side, target ordering and a floor R:R.
 * WAIT is always ok (reference-only levels, not tradable).
 */
export function validateLevels(
  levels: AnalysisLevels,
  ctx: { price: number; atr: number },
): ValidationResult {
  const reasons: string[] = [];
  const { entryLow, entryHigh, stop, t1, t2, t3, direction } = levels;
  const { price, atr } = ctx;

  const all = [entryLow, entryHigh, stop, t1, t2, t3];
  if (!all.every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, reasons: ['non-finite or non-positive level'] };
  }
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atr) || atr <= 0) {
    return { ok: false, reasons: ['bad price/atr context'] };
  }
  if (entryLow > entryHigh) reasons.push('entryLow > entryHigh');

  if (direction === 'WAIT') {
    // Reference-only: don't gate on tradability, but still require sane numbers.
    return { ok: reasons.length === 0, reasons };
  }

  const entry = (entryLow + entryHigh) / 2;
  if (Math.abs(entry - price) > atr * MAX_ENTRY_DRIFT_ATR) {
    reasons.push('entry drifts too far from price');
  }

  const r = Math.abs(entry - stop);
  if (r <= 0) reasons.push('zero risk distance');

  if (direction === 'LONG') {
    if (stop >= entry) reasons.push('long stop not below entry');
    if (!(t1 > entry && t2 > t1 && t3 > t2)) reasons.push('long targets not ascending above entry');
    if (r > 0 && (t1 - entry) / r < MIN_RR) reasons.push('long R:R below floor');
  } else {
    if (stop <= entry) reasons.push('short stop not above entry');
    if (!(t1 < entry && t2 < t1 && t3 < t2)) reasons.push('short targets not descending below entry');
    if (r > 0 && (entry - t1) / r < MIN_RR) reasons.push('short R:R below floor');
  }

  return { ok: reasons.length === 0, reasons };
}
