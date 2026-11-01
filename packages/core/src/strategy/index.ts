export * from './spec.js';
export { SignalEngine, resample } from './signals.js';
export { runBacktest, inSession, metricsOf } from './backtest.js';
export type { BacktestParams, BacktestResult, BacktestTrade, BacktestMetrics, ExitReason } from './backtest.js';
export { describeStrategy } from './describe.js';
export { validateStrategy } from './validate.js';
export type { Validation, Issue } from './validate.js';
export { fromLegacy } from './legacy.js';
export type { LegacyRules } from './legacy.js';
