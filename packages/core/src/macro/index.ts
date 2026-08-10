// Confluence engine (macro segment). PURE math — no I/O.
// Produces per-asset bias scores + regime from weighted macro factors.
// Bump ENGINE_VER on any change to factors, sensitivities, scale, or thresholds.

/** Bump on any change to factors, sensitivities, or scoring math. */
export const ENGINE_VER = 'macro-0.2.0';

export type {
  MacroAsset,
  BiasLabel,
  BiasResult,
  FactorKey,
  FactorDirection,
  FactorReading,
  EngineIndicator,
  EngineMarket,
  EngineInput,
  RegimeLabel,
  RegimeResult,
} from './types.js';

export { MACRO_ASSETS } from './types.js';

export { FACTORS, readFactors, trendDir } from './factors.js';
export { SENSITIVITIES } from './sensitivities.js';
export {
  scoreAsset,
  scoreAll,
  explainFactors,
  labelForScore,
  clampScore,
  SCORE_SCALE,
  totalFactorWeight,
} from './score.js';
export { classifyRegime, recessionOdds } from './regime.js';
export {
  computeAtr,
  computeSignal,
  directionFromBias,
  DEFAULT_ACCOUNT_SIZE,
  RISK_FRACTION,
} from './signals.js';
export type { SignalDirection, SignalResult, SignalInput, OhlcBar } from './signals.js';
