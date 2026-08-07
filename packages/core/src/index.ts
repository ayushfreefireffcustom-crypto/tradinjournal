export type {
  RawDeal,
  ReconstructedTrade,
  BalanceEvent,
  DealType,
  DealEntry,
  TradeSide,
  TradeStatus,
  MarginMode,
} from './types.js';

export { reconstructTrades } from './reconstruction/reconstruct.js';
export type { ReconstructionResult } from './reconstruction/reconstruct.js';

export { buildInsights, NEGATIVE_EMOTIONS } from './analysis/insights.js';
export type { Insight, Tone, InsightIcon, JournalLike } from './analysis/insights.js';

export { buildTraderContext, RECENT_TRADES_CAP } from './analysis/context.js';
export type { TraderContext, RecentTradeDigest } from './analysis/context.js';

export {
  ENGINE_VER,
  MACRO_ASSETS,
  scoreAsset,
  scoreAll,
  classifyRegime,
  recessionOdds,
  readFactors,
  explainFactors,
  labelForScore,
  FACTORS,
  SENSITIVITIES,
  computeAtr,
  computeSignal,
  directionFromBias,
  DEFAULT_ACCOUNT_SIZE,
} from './macro/index.js';
export type {
  MacroAsset,
  BiasLabel,
  BiasResult,
  EngineInput,
  EngineIndicator,
  EngineMarket,
  RegimeResult,
  FactorReading,
  FactorKey,
  SignalDirection,
  SignalResult,
  SignalInput,
  OhlcBar,
} from './macro/index.js';
