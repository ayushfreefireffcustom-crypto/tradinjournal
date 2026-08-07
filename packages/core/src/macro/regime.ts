// Growth × inflation quadrant → regime label + recession-odds heuristic.
import { readFactors, trendDir } from './factors.js';
import type { EngineInput, EngineIndicator, RegimeLabel, RegimeResult } from './types.js';

function ind(input: EngineInput, key: string): EngineIndicator | null {
  return input.indicators.find(i => i.key === key) ?? null;
}

/**
 * Classify the macro regime from factor directions.
 * Defaults to 'down' when direction is flat so the quadrant always resolves
 * (Unclear only when we have literally no growth AND no inflation signal).
 */
export function classifyRegime(input: EngineInput): RegimeResult {
  const factors = readFactors(input);
  const growthF = factors.find(f => f.key === 'growth');
  const inflationF = factors.find(f => f.key === 'inflation');

  const growthDir = growthF?.direction ?? 0;
  const inflationDir = inflationF?.direction ?? 0;
  const hasSignal = growthDir !== 0 || inflationDir !== 0;

  // Map flat → down for quadrant fields (contract is up|down only).
  const growth: 'up' | 'down' = growthDir > 0 ? 'up' : 'down';
  const inflation: 'up' | 'down' = inflationDir > 0 ? 'up' : 'down';

  let label: RegimeLabel;
  if (!hasSignal) {
    label = 'Unclear';
  } else if (growth === 'up' && inflation === 'down') {
    label = 'Goldilocks';
  } else if (growth === 'up' && inflation === 'up') {
    label = 'Reflation';
  } else if (growth === 'down' && inflation === 'up') {
    label = 'Stagflation';
  } else {
    label = 'Deflation';
  }

  return {
    growth,
    inflation,
    label,
    recessionOdds: recessionOdds(input),
  };
}

/**
 * Heuristic recession probability 0–100 from curve, labour, credit, risk.
 * Deterministic; not a forecast model — educational confluence only.
 */
export function recessionOdds(input: EngineInput): number {
  let odds = 15; // base

  const curve = ind(input, 'T10Y2Y');
  if (curve) {
    if (curve.value < 0) odds += 25; // inverted
    else if (curve.value < 0.25) odds += 10; // flat
    // Steepening from deep inversion is still stressed if level < 0 handled above.
    if (curve.prev != null && curve.value < curve.prev) odds += 5;
  }

  const unrate = ind(input, 'UNRATE');
  if (unrate && trendDir(unrate.value, unrate.prev, 0.05) > 0) odds += 15;

  const nfp = ind(input, 'PAYEMS');
  if (nfp && trendDir(nfp.value, nfp.prev) < 0) odds += 10;

  const hy = ind(input, 'BAMLH0A0HYM2');
  if (hy && trendDir(hy.value, hy.prev, 0.02) > 0) odds += 12;

  const vix = ind(input, 'VIXCLS');
  if (vix) {
    if (vix.value >= 30) odds += 15;
    else if (vix.value >= 20) odds += 8;
  }

  return Math.max(5, Math.min(85, Math.round(odds)));
}
