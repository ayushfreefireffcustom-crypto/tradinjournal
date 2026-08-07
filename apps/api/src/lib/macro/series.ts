// FRED series catalog for the macro data spine. Keys match FRED series ids
// except NET_LIQUIDITY, which is derived (WALCL − WTREGEN − RRPONTSYD).
import type { FredSeriesDef } from './types.js';

/** Primary macro series ingested from FRED on each cron tick. */
export const FRED_SERIES: readonly FredSeriesDef[] = [
  { id: 'CPIAUCSL', label: 'CPI', unit: 'index' },
  { id: 'CPILFESL', label: 'Core CPI', unit: 'index' },
  { id: 'PPIACO', label: 'PPI', unit: 'index' },
  { id: 'PAYEMS', label: 'Nonfarm Payrolls', unit: 'thousands' },
  { id: 'UNRATE', label: 'Unemployment Rate', unit: '%' },
  { id: 'GDPC1', label: 'Real GDP', unit: 'bn chained 2017$' },
  { id: 'PCEPILFE', label: 'Core PCE', unit: 'index' },
  { id: 'RSAFS', label: 'Retail Sales', unit: 'mn $' },
  { id: 'UMCSENT', label: 'Consumer Sentiment', unit: 'index' },
  { id: 'FEDFUNDS', label: 'Fed Funds Rate', unit: '%' },
  { id: 'DFF', label: 'Effective Fed Funds', unit: '%' },
  { id: 'DGS2', label: '2Y Treasury', unit: '%' },
  { id: 'DGS10', label: '10Y Treasury', unit: '%' },
  { id: 'T10Y2Y', label: '2s10s Spread', unit: '%' },
  { id: 'WALCL', label: 'Fed Balance Sheet', unit: 'mn $' },
  { id: 'WTREGEN', label: 'TGA', unit: 'mn $' },
  { id: 'RRPONTSYD', label: 'ON RRP', unit: 'bn $' },
  { id: 'BAMLH0A0HYM2', label: 'HY OAS', unit: '%' },
  { id: 'MORTGAGE30US', label: '30Y Mortgage', unit: '%' },
  { id: 'VIXCLS', label: 'VIX', unit: 'index' },
  { id: 'DTWEXBGS', label: 'USD Broad Index', unit: 'index' },
] as const;

/** Synthetic indicator key for net liquidity (computed, not a FRED series). */
export const NET_LIQUIDITY_KEY = 'NET_LIQUIDITY';

export const NET_LIQUIDITY_DEF = {
  key: NET_LIQUIDITY_KEY,
  label: 'Net Liquidity',
  unit: 'mn $',
} as const;

/** Component series used to compute NET_LIQUIDITY = WALCL − WTREGEN − RRPONTSYD. */
export const NET_LIQUIDITY_PARTS = ['WALCL', 'WTREGEN', 'RRPONTSYD'] as const;
