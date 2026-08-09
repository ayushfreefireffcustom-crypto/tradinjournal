// Indicator taxonomy + education copy + provenance helpers for the macro
// terminal. Pure (no React) so it can be unit-tested and shared. The grouping
// mirrors how a desk reads the tape: prices, growth, labor, rates, plumbing,
// risk, FX — rather than a flat wall of numbers.

export interface IndicatorMeta {
  /** Themed panel this indicator belongs to. */
  group: MacroGroup;
  /** One-line, plain-English explanation shown in the education tooltip. */
  blurb: string;
}

export type MacroGroup =
  | 'Inflation & Prices'
  | 'Growth & Demand'
  | 'Labor'
  | 'Rates & Yield Curve'
  | 'Central Banks'
  | 'Liquidity Plumbing'
  | 'Risk & Credit'
  | 'Positioning'
  | 'FX';

/** Reading order of the themed panels on the dashboard. */
export const GROUP_ORDER: MacroGroup[] = [
  'Rates & Yield Curve',
  'Central Banks',
  'Liquidity Plumbing',
  'Inflation & Prices',
  'Growth & Demand',
  'Labor',
  'Risk & Credit',
  'Positioning',
  'FX',
];

/** Short glyph shown beside each panel header. */
export const GROUP_GLYPH: Record<MacroGroup, string> = {
  'Inflation & Prices': '↗',
  'Growth & Demand': '◱',
  'Labor': '⚒',
  'Rates & Yield Curve': '∿',
  'Central Banks': '◈',
  'Liquidity Plumbing': '≋',
  'Risk & Credit': '⚡',
  'Positioning': '⇅',
  'FX': '$',
};

export const INDICATOR_META: Record<string, IndicatorMeta> = {
  // Inflation & Prices
  CPIAUCSL: { group: 'Inflation & Prices', blurb: 'Headline consumer prices — the broad cost-of-living gauge the Fed watches.' },
  CPILFESL: { group: 'Inflation & Prices', blurb: 'Core CPI strips food & energy to show the underlying inflation trend.' },
  PCEPILFE: { group: 'Inflation & Prices', blurb: "Core PCE — the Fed's preferred inflation measure for its 2% target." },
  PPIACO: { group: 'Inflation & Prices', blurb: 'Producer prices — wholesale inflation that often leads consumer prices.' },

  // Growth & Demand
  GDPC1: { group: 'Growth & Demand', blurb: 'Real GDP — inflation-adjusted output, the headline growth number.' },
  GDPNOW: { group: 'Growth & Demand', blurb: 'Atlanta Fed GDPNow — a real-time nowcast of current-quarter GDP growth.' },
  RSAFS: { group: 'Growth & Demand', blurb: 'Retail sales — the pulse of US consumer spending.' },
  INDPRO: { group: 'Growth & Demand', blurb: 'Industrial production — factory, mine and utility output; a cyclical read.' },
  HOUST: { group: 'Growth & Demand', blurb: 'Housing starts — new-home construction, a rate-sensitive leading indicator.' },
  PERMIT: { group: 'Growth & Demand', blurb: 'Building permits — the future construction pipeline; leads housing starts.' },
  UMCSENT: { group: 'Growth & Demand', blurb: 'U. Michigan consumer sentiment — how confident households feel.' },
  MORTGAGE30US: { group: 'Growth & Demand', blurb: '30-year mortgage rate — housing affordability and credit tightness.' },

  // Labor
  UNRATE: { group: 'Labor', blurb: "Unemployment rate — labor-market slack; the Fed's other mandate." },
  PAYEMS: { group: 'Labor', blurb: 'Nonfarm payrolls — total jobs on US books, the marquee labor print.' },
  ICSA: { group: 'Labor', blurb: 'Initial jobless claims — weekly layoffs; the fastest labor-market signal.' },

  // Rates & Yield Curve
  FEDFUNDS: { group: 'Rates & Yield Curve', blurb: 'Fed funds target — the policy rate that anchors all short-term rates.' },
  DFF: { group: 'Rates & Yield Curve', blurb: 'Effective fed funds — the actual overnight rate trading in the market.' },
  DGS3MO: { group: 'Rates & Yield Curve', blurb: "3-month T-bill yield — the front end, tracks the Fed's policy rate." },
  DGS2: { group: 'Rates & Yield Curve', blurb: "2-year yield — the market's read on near-term Fed policy." },
  DGS5: { group: 'Rates & Yield Curve', blurb: '5-year yield — the belly of the curve, sensitive to the rate path.' },
  DGS10: { group: 'Rates & Yield Curve', blurb: '10-year yield — the global benchmark risk-free rate.' },
  DGS30: { group: 'Rates & Yield Curve', blurb: '30-year yield — the long bond, driven by growth & inflation expectations.' },
  DFII10: { group: 'Rates & Yield Curve', blurb: '10-year real (TIPS) yield — the inflation-adjusted cost of money.' },
  T10Y2Y: { group: 'Rates & Yield Curve', blurb: '2s10s spread — negative = inverted curve, a classic recession flag.' },
  T10Y3M: { group: 'Rates & Yield Curve', blurb: "10y–3m spread — the Fed's preferred recession signal; negative = inverted." },
  T10YIE: { group: 'Rates & Yield Curve', blurb: '10-year breakeven — the bond market’s expected average inflation.' },

  // Central Banks
  FEDTARMD: { group: 'Central Banks', blurb: "FOMC median projection — the 'dot plot' path for the fed funds rate." },
  ECBDFR: { group: 'Central Banks', blurb: 'ECB deposit rate — the euro-area policy rate; cross-central-bank divergence.' },

  // Positioning (CFTC Commitments of Traders — net large-speculator position)
  COT_SPX: { group: 'Positioning', blurb: 'Net speculator position in S&P 500 futures (CFTC COT) — positive = crowd long.' },
  COT_BTC: { group: 'Positioning', blurb: 'Net speculator position in CME Bitcoin futures — extremes can mean-revert.' },
  COT_XAU: { group: 'Positioning', blurb: 'Net speculator position in Gold futures — crowded longs warn of pullbacks.' },
  COT_USD: { group: 'Positioning', blurb: 'Net speculator position in US Dollar Index futures.' },
  COT_UST10: { group: 'Positioning', blurb: 'Net speculator position in 10Y Treasury-note futures — bond positioning.' },

  // Liquidity Plumbing
  WALCL: { group: 'Liquidity Plumbing', blurb: 'Fed balance sheet — total assets; QE expands it, QT shrinks it.' },
  RRPONTSYD: { group: 'Liquidity Plumbing', blurb: 'Reverse repo — cash parked at the Fed; draining it adds liquidity.' },
  WTREGEN: { group: 'Liquidity Plumbing', blurb: "Treasury General Account — the government's checking account at the Fed." },
  NET_LIQUIDITY: { group: 'Liquidity Plumbing', blurb: 'Net liquidity = balance sheet − reverse repo − TGA; the fuel for risk assets.' },

  // Risk & Credit
  VIXCLS: { group: 'Risk & Credit', blurb: 'VIX — 30-day expected S&P 500 volatility, the market fear gauge.' },
  BAMLH0A0HYM2: { group: 'Risk & Credit', blurb: 'High-yield OAS — the junk-bond risk premium; widening signals stress.' },
  NFCI: { group: 'Risk & Credit', blurb: 'Chicago Fed financial conditions — positive = tight, negative = loose.' },

  // FX
  DTWEXBGS: { group: 'FX', blurb: 'Broad USD index — the dollar against a wide basket of trade partners.' },
};

export interface MacroIndicator {
  key: string;
  label: string;
  value: number;
  prev?: number | null;
  forecast?: number | null;
  unit?: string | null;
  source: string;
  asOf: string;
  history?: number[];
}

export interface IndicatorGroup {
  group: MacroGroup;
  glyph: string;
  items: MacroIndicator[];
}

/**
 * Bucket raw indicators into their themed panels in GROUP_ORDER. Unknown keys
 * fall through to an "Other" panel so nothing silently disappears.
 */
export function groupIndicators(macro: MacroIndicator[]): IndicatorGroup[] {
  const buckets = new Map<MacroGroup, MacroIndicator[]>();
  const other: MacroIndicator[] = [];
  for (const m of macro) {
    const meta = INDICATOR_META[m.key];
    if (!meta) {
      other.push(m);
      continue;
    }
    const arr = buckets.get(meta.group) ?? [];
    arr.push(m);
    buckets.set(meta.group, arr);
  }
  const groups: IndicatorGroup[] = [];
  for (const g of GROUP_ORDER) {
    const items = buckets.get(g);
    if (items && items.length) groups.push({ group: g, glyph: GROUP_GLYPH[g], items });
  }
  if (other.length) {
    groups.push({ group: 'FX', glyph: '·', items: other }); // rare; keep visible
  }
  return groups;
}

/** Look up the education blurb for an indicator key. */
export function blurbFor(key: string): string | null {
  return INDICATOR_META[key]?.blurb ?? null;
}

/** Format a FRED observation date as a compact provenance stamp, e.g. "Jun 2026". */
export function formatObsDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Human label for a data source id. */
export function sourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s === 'fred') return 'FRED';
  if (s === 'binance') return 'Binance';
  if (s === 'gold-api') return 'Metals';
  if (s === 'er-api') return 'FX';
  if (s === 'finnhub') return 'Finnhub';
  return source.toUpperCase();
}
