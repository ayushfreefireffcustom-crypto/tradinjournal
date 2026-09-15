// Trader Master engine types. PURE — no I/O, no persistence concern.
// Levels are always produced/validated by this engine; an LLM only narrates.

export type TraderDirection = 'LONG' | 'SHORT' | 'WAIT';
export type Trend = 'up' | 'down' | 'range';

/** One OHLC bar, oldest→newest in a series. openTime is epoch ms. */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A support or resistance price. `strength` = how many swings clustered here. */
export interface SRLevel {
  price: number;
  label: string;
  strength: number;
}

/** Everything the level/analysis math needs about one timeframe. */
export interface TechnicalFeatures {
  price: number;
  atr: number;
  rsi: number;
  trend: Trend;
  ema20: number;
  ema50: number;
  /** S/R below the current price, nearest→farthest. */
  support: SRLevel[];
  /** S/R above the current price, nearest→farthest. */
  resistance: SRLevel[];
  recentHigh: number;
  recentLow: number;
  /** Number of bars the features were computed from (for confidence). */
  bars: number;
}

/** Features tagged with the timeframe they came from. */
export interface TfFeatures {
  tf: string;
  features: TechnicalFeatures;
}

/** The price levels of a trade idea. */
export interface AnalysisLevels {
  direction: TraderDirection;
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
}

/** Per-timeframe read shown in the detailed breakdown. */
export interface TimeframeRead {
  tf: string;
  trend: Trend;
  rsi: number;
  atr: number;
  note: string;
}

/** A full deterministic analysis result (mirrors the DTO minus persistence). */
export interface AnalysisResult extends AnalysisLevels {
  support: { price: number; label: string }[];
  resistance: { price: number; label: string }[];
  confidence: number;
  rationale: string;
  invalidation: string;
  detail: string;
  perTimeframe: TimeframeRead[];
}
