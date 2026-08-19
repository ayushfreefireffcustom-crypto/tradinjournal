// Trader Master engine (on-demand technical analysis). PURE math — no I/O.
// Bump TRADER_ENGINE_VER on any change to indicators, level geometry, guardrails
// or scoring so persisted analyses stay traceable to the logic that made them.

export const TRADER_ENGINE_VER = 'trader-0.1.0';

export type {
  TraderDirection,
  Trend,
  Candle,
  SRLevel,
  TechnicalFeatures,
  TfFeatures,
  AnalysisLevels,
  TimeframeRead,
  AnalysisResult,
} from './types.js';

export { sma, ema, rsi, swingPoints, clusterLevels, classifyTrend } from './indicators.js';
export type { SwingPoint } from './indicators.js';

export { extractFeatures } from './features.js';

export {
  deriveLevels,
  roundPx,
  ENTRY_ATR_FRAC,
  STOP_ATR_MULT,
  MIN_STOP_ATR,
  MAX_STOP_ATR,
  TARGET_R,
} from './levels.js';

export { validateLevels, MAX_ENTRY_DRIFT_ATR, MIN_RR } from './guardrails.js';
export type { ValidationResult } from './guardrails.js';

export {
  directionFromFeatures,
  buildTechnicalAnalysis,
  reconcileTimeframes,
} from './analysis.js';
