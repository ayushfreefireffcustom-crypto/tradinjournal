// Market-data provider abstraction, mirroring the news/calendar provider libs.
// Providers return a normalized candle shape; a resolver routes each symbol to
// the right provider (crypto→Binance, broker→MT5, stock/forex→Twelve Data).
//
// Candle timestamps are normalized to **epoch milliseconds** (what klinecharts
// consumes) regardless of what the upstream returns.
import type { MarketTimeframe, AssetClass } from '@tradinjournal/contracts';

export type { MarketTimeframe, AssetClass };

/** One OHLC bar, normalized. openTime is the bar's open time in epoch ms. */
export interface NormalizedCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Broker credentials needed to reach the right MT5 terminal (MT5 provider only). */
export interface BridgeCreds {
  login: number;
  password: string;
  server: string;
}

export interface GetCandlesOpts {
  /** Inclusive window, epoch **seconds** (as received from the query). */
  from?: number;
  to?: number;
  /** Latest-N bars when no window is given. */
  limit?: number;
  /** Required only for the MT5 provider — the account whose terminal to query. */
  broker?: BridgeCreds;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  provider: string;
}

export interface MarketProvider {
  readonly name: string;
  /**
   * Return normalized bars, oldest→newest. Never throws for "no data" — returns
   * `[]` (provider convention shared with news/calendar). Honours the abort
   * signal + an internal hard timeout.
   */
  getCandles(
    symbol: string,
    tf: MarketTimeframe,
    opts: GetCandlesOpts,
    signal?: AbortSignal,
  ): Promise<NormalizedCandle[]>;
  /** Fuzzy symbol search. Optional; returns [] on failure. */
  searchSymbols?(q: string, signal?: AbortSignal): Promise<SymbolInfo[]>;
  /**
   * Live subscription for the forming bar. Returns an unsubscribe fn. Optional
   * (only Binance streams today; MT5/Twelve Data are polled by the LiveHub).
   */
  subscribe?(symbol: string, tf: MarketTimeframe, onCandle: (c: NormalizedCandle) => void): () => void;
}
