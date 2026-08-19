// Yahoo Finance provider — FREE, no API key. Covers forex, metals, indices and
// stocks (crypto stays on Binance). Uses the public chart endpoint (v8) for
// candles and the search endpoint (v1) for symbol lookup. This is the zero-cost
// fallback the resolver uses when Twelve Data isn't configured.
//
// Yahoo has no native 4h interval, so 4h is fetched at 60m and aggregated 4→1.
// Provider convention: never throw for "no data" — return [].
import type { MarketTimeframe, AssetClass } from '@tradinjournal/contracts';
import { fetchJson } from '../http.js';
import type { GetCandlesOpts, MarketProvider, NormalizedCandle, SymbolInfo } from '../types.js';

const BASE = 'https://query1.finance.yahoo.com';
// Yahoo rejects some requests without a browser-ish UA.
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; TradinJournal/1.0)' };

// Our timeframe → { Yahoo interval, range, optional aggregation factor }.
const TF_MAP: Record<MarketTimeframe, { interval: string; range: string; agg?: number }> = {
  '1m': { interval: '1m', range: '5d' },
  '5m': { interval: '5m', range: '1mo' },
  '15m': { interval: '15m', range: '1mo' },
  '30m': { interval: '30m', range: '1mo' },
  '1h': { interval: '60m', range: '3mo' },
  '4h': { interval: '60m', range: '1y', agg: 4 },
  '1d': { interval: '1d', range: '2y' },
  '1w': { interval: '1wk', range: '5y' },
  '1M': { interval: '1mo', range: '10y' },
};

// Common instruments Yahoo lists under a non-obvious ticker (metals/energy are
// futures, not FX pairs; spot indices use a caret prefix).
const ALIASES: Record<string, string> = {
  XAUUSD: 'GC=F', // gold (COMEX future — Yahoo has no XAUUSD=X)
  XAGUSD: 'SI=F', // silver
  XPTUSD: 'PL=F', // platinum
  WTIUSD: 'CL=F', // WTI crude
  USOIL: 'CL=F',
  UKOIL: 'BZ=F', // Brent
  US30: '^DJI',
  US500: '^GSPC',
  SPX500: '^GSPC',
  NAS100: '^NDX',
  US100: '^NDX',
  GER40: '^GDAXI',
  UK100: '^FTSE',
  JP225: '^N225',
};

/**
 * Map a plain symbol to Yahoo's ticker. Known aliases (XAUUSD→GC=F, US30→^DJI…)
 * first; then 6-letter FX pairs like EURUSD → `EURUSD=X`; anything already
 * carrying a Yahoo suffix/prefix (=X, =F, ^, -, .) passes through untouched.
 */
export function yahooSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (ALIASES[s]) return ALIASES[s];
  if (/[=^.-]/.test(s)) return s; // already a Yahoo-style ticker
  if (/^[A-Z]{6}$/.test(s)) return `${s}=X`; // 6-letter FX pair
  return s; // equities etc.
}

/** Aggregate consecutive candles in groups of `factor` (oldest→newest). */
function aggregate(candles: NormalizedCandle[], factor: number): NormalizedCandle[] {
  if (factor <= 1) return candles;
  const out: NormalizedCandle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    if (group.length === 0) continue;
    out.push({
      openTime: group[0]!.openTime,
      open: group[0]!.open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1]!.close,
      volume: group.reduce((a, c) => a + c.volume, 0),
    });
  }
  return out;
}

interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: unknown;
  };
}

async function getCandles(
  symbol: string,
  tf: MarketTimeframe,
  opts: GetCandlesOpts,
  signal?: AbortSignal,
): Promise<NormalizedCandle[]> {
  const map = TF_MAP[tf];
  const ySym = encodeURIComponent(yahooSymbol(symbol));
  const params = new URLSearchParams({ interval: map.interval, range: map.range });
  try {
    const body = await fetchJson<YahooChart>(`${BASE}/v8/finance/chart/${ySym}?${params}`, signal, UA);
    const result = body.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!Array.isArray(ts) || !q) return [];

    let candles: NormalizedCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      // Yahoo pads gaps with nulls — skip any incomplete bar.
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ openTime: ts[i]! * 1000, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    if (map.agg) candles = aggregate(candles, map.agg);

    // Honour an explicit epoch-second window, then a latest-N limit.
    if (opts.from) candles = candles.filter((k) => k.openTime >= opts.from! * 1000);
    if (opts.to) candles = candles.filter((k) => k.openTime <= opts.to! * 1000);
    if (opts.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
    return candles;
  } catch {
    return [];
  }
}

interface YahooSearch {
  quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[];
}

function toAssetClass(quoteType?: string): AssetClass {
  const t = (quoteType ?? '').toUpperCase();
  if (t === 'CRYPTOCURRENCY') return 'crypto';
  if (t === 'CURRENCY') return 'forex';
  if (t === 'FUTURE') return 'commodity';
  return 'stock';
}

async function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
  const needle = q.trim();
  if (!needle) return [];
  const params = new URLSearchParams({ q: needle, quotesCount: '20', newsCount: '0' });
  try {
    const body = await fetchJson<YahooSearch>(`${BASE}/v1/finance/search?${params}`, signal, UA);
    return (body.quotes ?? [])
      .filter((r) => r.symbol)
      .slice(0, 30)
      .map((r) => ({
        symbol: r.symbol!,
        name: r.longname ?? r.shortname ?? r.symbol!,
        assetClass: toAssetClass(r.quoteType),
        provider: 'yahoo',
      }));
  } catch {
    return [];
  }
}

export function createYahooProvider(): MarketProvider {
  return { name: 'yahoo', getCandles, searchSymbols };
}
