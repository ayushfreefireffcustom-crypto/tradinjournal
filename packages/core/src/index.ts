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

export { ENGINE_VER, MACRO_ASSETS, scoreAsset } from './macro/index.js';
export type { MacroAsset, BiasLabel, BiasResult } from './macro/index.js';
