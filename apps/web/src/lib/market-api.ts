// Client for the charting API (candles / search / watchlist + live SSE). Kept
// separate from api.ts but follows the same conventions: NEXT_PUBLIC_API_URL,
// cookie auth, unwrap `{ data }`. Types are declared locally (the web app is
// decoupled from the backend packages, mirroring api.ts) but kept in lockstep
// with @tradinjournal/contracts.
export const MARKET_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'] as const;
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];

/** Friendly names for common symbols (watchlist subtitles). Unknown → none. */
export const MARKET_SYMBOL_NAMES: Record<string, string> = {
  BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', SOLUSDT: 'Solana', BNBUSDT: 'BNB', XRPUSDT: 'XRP', DOGEUSDT: 'Dogecoin',
  XAUUSD: 'Gold', XAGUSD: 'Silver', EURUSD: 'Euro / Dollar', GBPUSD: 'Pound / Dollar', USDJPY: 'Dollar / Yen',
  AUDUSD: 'Aussie / Dollar', USDCAD: 'Dollar / Loonie', US100: 'Nasdaq 100', NAS100: 'Nasdaq 100', US30: 'Dow 30',
  US500: 'S&P 500', SPX: 'S&P 500', AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', TSLA: 'Tesla',
};

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';

export interface Candle {
  openTime: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSymbol {
  symbol: string;
  name: string;
  assetClass: string;
  provider: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

/** Read an SSE stream, invoking onEvent per `data:` payload. Aborts on signal. */
async function sseRead(url: string, signal: AbortSignal, onEvent: (p: Record<string, unknown>) => void): Promise<void> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const line = evt.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        /* ignore heartbeats / non-JSON */
      }
    }
  }
}

export interface CandlesParams {
  symbol: string;
  tf: MarketTimeframe;
  from?: number; // epoch seconds
  to?: number;
  limit?: number;
  accountId?: string; // broker symbols route through an account
}

export const marketApi = {
  candles: (p: CandlesParams) =>
    req<{ candles: Candle[] }>(
      `${PREFIX}/market/candles${qs({ symbol: p.symbol, tf: p.tf, from: p.from, to: p.to, limit: p.limit, accountId: p.accountId })}`,
    ),
  search: (q: string) => req<{ symbols: MarketSymbol[] }>(`${PREFIX}/market/search${qs({ q })}`),
  watchlist: () => req<{ symbols: string[] }>(`${PREFIX}/market/watchlist`),
  setWatchlist: (symbols: string[]) =>
    req<{ symbols: string[] }>(`${PREFIX}/market/watchlist`, { method: 'PUT', body: JSON.stringify({ symbols }) }),
};

/**
 * Subscribe to live forming bars for one symbol/timeframe over SSE. Returns an
 * unsubscribe fn (aborts the stream). Silently ends if the stream errors — the
 * chart still has its last-fetched history and re-fetches on the next load.
 */
export function streamCandles(
  symbol: string,
  tf: MarketTimeframe,
  onBar: (c: Candle) => void,
  opts: { accountId?: string } = {},
): () => void {
  const controller = new AbortController();
  const path = `${API}${PREFIX}/market/stream${qs({ symbol, tf, accountId: opts.accountId })}`;
  void sseRead(path, controller.signal, payload => {
    if (payload.candle) onBar(payload.candle as Candle);
  }).catch(() => {});
  return () => controller.abort();
}
