// Shared types for the pure confluence engine (no I/O).

export type MacroAsset = 'BTC' | 'XAU' | 'SPX' | 'DXY';
export const MACRO_ASSETS: readonly MacroAsset[] = ['BTC', 'XAU', 'SPX', 'DXY'] as const;

/** Seven-tier bias labels (thresholds in score.ts). */
export type BiasLabel =
  | 'STRONG_BULLISH'
  | 'BULLISH'
  | 'MILD_BULLISH'
  | 'NEUTRAL'
  | 'MILD_BEARISH'
  | 'BEARISH'
  | 'STRONG_BEARISH';

export type FactorKey =
  | 'inflation'
  | 'policy'
  | 'growth'
  | 'rates'
  | 'liquidity'
  | 'credit'
  | 'risk'
  | 'dollar';

export type FactorDirection = -1 | 0 | 1;

export interface EngineIndicator {
  key: string;
  value: number;
  prev: number | null;
}

export interface EngineMarket {
  symbol: string;
  price: number;
  changePct: number | null;
}

/** Minimal snapshot the engine reads — built from MacroIndicator + MacroMarketQuote. */
export interface EngineInput {
  indicators: EngineIndicator[];
  markets: EngineMarket[];
}

export interface FactorReading {
  key: FactorKey;
  label: string;
  weight: number;
  /** Raw observed value used (for debugging/tests). */
  value: number | null;
  /** +1 = factor "up" in its natural sense (see factors.ts). */
  direction: FactorDirection;
}

export interface BiasResult {
  asset: MacroAsset;
  score: number; // 0–100
  label: BiasLabel;
  supporting: string[];
  opposing: string[];
}

export type RegimeLabel = 'Goldilocks' | 'Reflation' | 'Stagflation' | 'Deflation' | 'Unclear';

export interface RegimeResult {
  growth: 'up' | 'down';
  inflation: 'up' | 'down';
  label: RegimeLabel;
  recessionOdds: number; // 0–100
}
