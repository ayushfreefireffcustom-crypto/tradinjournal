// Deterministic confluence scoring.
// score = clamp(50 + SCALE * Σ(weight * direction * sensitivity), 0, 100)
import { FACTORS, readFactors } from './factors.js';
import { SENSITIVITIES } from './sensitivities.js';
import type {
  BiasLabel,
  BiasResult,
  EngineInput,
  FactorReading,
  MacroAsset,
} from './types.js';
import { MACRO_ASSETS } from './types.js';

/** Scales the weighted sum into score points. Bump ENGINE_VER if changed. */
export const SCORE_SCALE = 6;

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Seven-tier thresholds around 50. */
export function labelForScore(score: number): BiasLabel {
  if (score >= 70) return 'STRONG_BULLISH';
  if (score >= 60) return 'BULLISH';
  if (score >= 55) return 'MILD_BULLISH';
  if (score > 45) return 'NEUTRAL';
  if (score > 40) return 'MILD_BEARISH';
  if (score > 30) return 'BEARISH';
  return 'STRONG_BEARISH';
}

/**
 * Score one asset. Factors with direction 0 or sensitivity 0 contribute nothing
 * and are omitted from evidence.
 */
export function scoreAsset(asset: MacroAsset, input: EngineInput = { indicators: [], markets: [] }): BiasResult {
  const readings = readFactors(input);
  const sens = SENSITIVITIES[asset];
  let sum = 0;
  const supporting: string[] = [];
  const opposing: string[] = [];

  for (const f of readings) {
    const s = sens[f.key] ?? 0;
    if (f.direction === 0 || s === 0) continue;
    const contrib = f.weight * f.direction * s;
    sum += contrib;
    // Pushing the asset score up?
    if (contrib > 0) supporting.push(f.label);
    else if (contrib < 0) opposing.push(f.label);
  }

  const score = clampScore(50 + SCORE_SCALE * sum);
  return {
    asset,
    score,
    label: labelForScore(score),
    supporting,
    opposing,
  };
}

/** Score every MVP asset against the same input. */
export function scoreAll(input: EngineInput): BiasResult[] {
  return MACRO_ASSETS.map(a => scoreAsset(a, input));
}

/** Expose factor readings for the Bull/Bear scanner (P3). */
export function explainFactors(input: EngineInput): FactorReading[] {
  return readFactors(input);
}

/** Sum of factor weights (for tests / docs). */
export function totalFactorWeight(): number {
  return FACTORS.reduce((s, f) => s + f.weight, 0);
}
