// Normalized shapes for macro providers. Providers never talk to the DB —
// the service layer upserts these into MacroIndicator / MacroMarketQuote.

/** One FRED (or derived) observation ready to persist. */
export interface NormalizedMacroIndicator {
  key: string;
  label: string;
  value: number;
  prev: number | null;
  unit: string | null;
  source: 'fred';
  /** Observation date (UTC midnight for FRED daily/monthly series). */
  asOf: Date;
}

/** One market snapshot ready to persist. */
export interface NormalizedMacroQuote {
  symbol: string; // BTC | XAU | SPX | DXY
  price: number;
  changePct: number | null;
  source: string;
  asOf: Date;
}

/** FRED series catalog entry. */
export interface FredSeriesDef {
  /** FRED series id (also the MacroIndicator.key, except NET_LIQUIDITY). */
  id: string;
  label: string;
  unit: string | null;
}
