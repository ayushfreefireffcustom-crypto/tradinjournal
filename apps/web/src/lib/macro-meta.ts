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
  | 'Liquidity Plumbing'
  | 'Risk & Credit'
  | 'FX';

/** Reading order of the themed panels on the dashboard. */
export const GROUP_ORDER: MacroGroup[] = [
  'Rates & Yield Curve',
  'Liquidity Plumbing',
  'Inflation & Prices',
  'Growth & Demand',
  'Labor',
  'Risk & Credit',
  'FX',
];

/** Short glyph shown beside each panel header. */
export const GROUP_GLYPH: Record<MacroGroup, string> = {
  'Inflation & Prices': '↗',
  'Growth & Demand': '◱',
  'Labor': '⚒',
  'Rates & Yield Curve': '∿',
  'Liquidity Plumbing': '≋',
  'Risk & Credit': '⚡',
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
  RSAFS: { group: 'Growth & Demand', blurb: 'Retail sales — the pulse of US consumer spending.' },
  UMCSENT: { group: 'Growth & Demand', blurb: 'U. Michigan consumer sentiment — how confident households feel.' },
  MORTGAGE30US: { group: 'Growth & Demand', blurb: '30-year mortgage rate — housing affordability and credit tightness.' },

  // Labor
  UNRATE: { group: 'Labor', blurb: "Unemployment rate — labor-market slack; the Fed's other mandate." },
  PAYEMS: { group: 'Labor', blurb: 'Nonfarm payrolls — total jobs on US books, the marquee labor print.' },

  // Rates & Yield Curve
  FEDFUNDS: { group: 'Rates & Yield Curve', blurb: 'Fed funds target — the policy rate that anchors all short-term rates.' },
  DFF: { group: 'Rates & Yield Curve', blurb: 'Effective fed funds — the actual overnight rate trading in the market.' },
  DGS2: { group: 'Rates & Yield Curve', blurb: "2-year yield — the market's read on near-term Fed policy." },
  DGS10: { group: 'Rates & Yield Curve', blurb: '10-year yield — the global benchmark risk-free rate.' },
  T10Y2Y: { group: 'Rates & Yield Curve', blurb: '2s10s spread — negative = inverted curve, a classic recession flag.' },

  // Liquidity Plumbing
  WALCL: { group: 'Liquidity Plumbing', blurb: 'Fed balance sheet — total assets; QE expands it, QT shrinks it.' },
  RRPONTSYD: { group: 'Liquidity Plumbing', blurb: 'Reverse repo — cash parked at the Fed; draining it adds liquidity.' },
  WTREGEN: { group: 'Liquidity Plumbing', blurb: "Treasury General Account — the government's checking account at the Fed." },
  NET_LIQUIDITY: { group: 'Liquidity Plumbing', blurb: 'Net liquidity = balance sheet − reverse repo − TGA; the fuel for risk assets.' },

  // Risk & Credit
  VIXCLS: { group: 'Risk & Credit', blurb: 'VIX — 30-day expected S&P 500 volatility, the market fear gauge.' },
  BAMLH0A0HYM2: { group: 'Risk & Credit', blurb: 'High-yield OAS — the junk-bond risk premium; widening signals stress.' },

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
