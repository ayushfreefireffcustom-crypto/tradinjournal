// Twelve Data provider — stocks / forex (and their crypto too, unused here since
// Binance owns crypto). Built ONLY when TWELVEDATA_API_KEY is set. The free tier
// is 8 req/min, 800/day, so every call passes a token bucket first; when the
// bucket is empty we return [] rather than exceed the quota (the cache + warm
// set keep popular symbols served without hitting the provider per user).
import { env } from '@tradinjournal/config';
import type { MarketTimeframe, AssetClass } from '@tradinjournal/contracts';
import { fetchJson } from '../http.js';
import type { GetCandlesOpts, MarketProvider, NormalizedCandle, SymbolInfo } from '../types.js';

const BASE = 'https://api.twelvedata.com';

// Our timeframe → Twelve Data interval token.
const TF_MAP: Record<MarketTimeframe, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week', '1M': '1month',
};

/** Continuous-refill token bucket. `capacity` tokens replenish over `windowMs`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private capacity: number, private windowMs: number) {
    this.tokens = capacity;
    this.last = Date.now();
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / this.windowMs) * this.capacity);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

// Free tier: 8 requests/minute. One shared bucket for the whole process.
const bucket = new TokenBucket(8, 60_000);

interface TdValue { datetime: string; open: string; high: string; low: string; close: string; volume?: string }
interface TdTimeSeries { status: string; values?: TdValue[] }

/** Twelve Data datetime → epoch ms. Intraday has time; daily+ is date-only. */
function parseTs(dt: string): number {
  const iso = dt.includes(' ') ? `${dt.replace(' ', 'T')}Z` : `${dt}T00:00:00Z`;
  return new Date(iso).getTime();
}

async function getCandles(
  symbol: string,
  tf: MarketTimeframe,
  opts: GetCandlesOpts,
  signal?: AbortSignal,
): Promise<NormalizedCandle[]> {
  if (!env.TWELVEDATA_API_KEY || !bucket.take()) return [];
  const params = new URLSearchParams({
    symbol,
    interval: TF_MAP[tf],
    outputsize: String(Math.min(opts.limit ?? 500, 5000)),
    apikey: env.TWELVEDATA_API_KEY,
    format: 'JSON',
  });
  try {
    const body = await fetchJson<TdTimeSeries>(`${BASE}/time_series?${params}`, signal);
    if (body.status !== 'ok' || !Array.isArray(body.values)) return [];
    // Twelve Data returns newest-first — reverse to oldest→newest.
    return body.values
      .map(v => ({
        openTime: parseTs(v.datetime),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
        volume: v.volume ? Number(v.volume) : 0,
      }))
      .filter(c => Number.isFinite(c.openTime))
      .reverse();
  } catch {
    return [];
  }
}

interface TdSearchRow { symbol: string; instrument_name?: string; instrument_type?: string }
interface TdSearch { data?: TdSearchRow[] }

function toAssetClass(instrumentType?: string): AssetClass {
  const t = (instrumentType ?? '').toLowerCase();
  if (t.includes('currency') || t.includes('forex')) return 'forex';
  if (t.includes('commodit')) return 'commodity';
  return 'stock';
}

async function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
  if (!env.TWELVEDATA_API_KEY || !bucket.take()) return [];
  const params = new URLSearchParams({ symbol: q, apikey: env.TWELVEDATA_API_KEY });
  try {
    const body = await fetchJson<TdSearch>(`${BASE}/symbol_search?${params}`, signal);
    return (body.data ?? []).slice(0, 30).map(r => ({
      symbol: r.symbol,
      name: r.instrument_name ?? r.symbol,
      assetClass: toAssetClass(r.instrument_type),
      provider: 'twelvedata',
    }));
  } catch {
    return [];
  }
}

export function createTwelveDataProvider(): MarketProvider {
  return { name: 'twelvedata', getCandles, searchSymbols };
}
