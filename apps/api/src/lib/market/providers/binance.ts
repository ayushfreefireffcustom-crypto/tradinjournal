// Binance market-data provider — crypto candles. Uses the public market-data
// hosts (data-api / data-stream .binance.vision) which need **no API key**.
// REST klines for history/backfill; a WebSocket kline stream for the live
// forming bar (WS messages don't count against REST weight). Our timeframe
// tokens ('1m'…'1M') are already valid Binance intervals, so they pass through.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { MarketTimeframe } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../cache.js';
import { fetchJson } from '../http.js';
import type { GetCandlesOpts, MarketProvider, NormalizedCandle, SymbolInfo } from '../types.js';

// Node 22+ exposes a global WebSocket (undici). Minimal typing avoids pulling DOM libs.
type WsCtor = new (url: string) => {
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'open' | 'close' | 'error', cb: () => void): void;
  close(): void;
};
const WSImpl = (globalThis as unknown as { WebSocket?: WsCtor }).WebSocket;

const EXCHANGE_INFO_TTL = 6 * 60 * 60; // symbols list is near-static — cache 6h
const KLINES_MAX = 1000;

/** Binance klines row: [openTime, open, high, low, close, volume, closeTime, …]. */
type KlineRow = [number, string, string, string, string, string, ...unknown[]];

function toCandle(r: KlineRow): NormalizedCandle {
  return {
    openTime: r[0], // already epoch ms
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  };
}

async function getCandles(
  symbol: string,
  tf: MarketTimeframe,
  opts: GetCandlesOpts,
  signal?: AbortSignal,
): Promise<NormalizedCandle[]> {
  const params = new URLSearchParams({ symbol: symbol.toUpperCase(), interval: tf });
  params.set('limit', String(Math.min(opts.limit ?? KLINES_MAX, KLINES_MAX)));
  if (opts.from) params.set('startTime', String(opts.from * 1000));
  if (opts.to) params.set('endTime', String(opts.to * 1000));
  try {
    const rows = await fetchJson<KlineRow[]>(`${env.BINANCE_REST_URL}/api/v3/klines?${params}`, signal);
    return Array.isArray(rows) ? rows.map(toCandle) : [];
  } catch {
    return [];
  }
}

interface ExchangeInfo {
  symbols: { symbol: string; baseAsset: string; quoteAsset: string; status: string }[];
}

/** Load + cache the tradable symbol catalog (drives search + crypto detection). */
async function loadSymbols(signal?: AbortSignal): Promise<SymbolInfo[]> {
  const key = 'market:binance:symbols';
  const cached = await cacheGet<SymbolInfo[]>(key);
  if (cached) return cached;
  try {
    const info = await fetchJson<ExchangeInfo>(`${env.BINANCE_REST_URL}/api/v3/exchangeInfo`, signal);
    const list: SymbolInfo[] = (info.symbols ?? [])
      .filter(s => s.status === 'TRADING')
      .map(s => ({ symbol: s.symbol, name: `${s.baseAsset}/${s.quoteAsset}`, assetClass: 'crypto' as const, provider: 'binance' }));
    await cacheSet(key, list, EXCHANGE_INFO_TTL);
    return list;
  } catch {
    return [];
  }
}

async function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const all = await loadSymbols(signal);
  return all.filter(s => s.symbol.includes(needle) || s.name.toUpperCase().includes(needle)).slice(0, 30);
}

/** In-memory symbol set for the resolver's crypto check (backed by the cache). */
let symbolSet: Set<string> | null = null;
let symbolSetAt = 0;
export async function isBinanceSymbol(symbol: string): Promise<boolean> {
  const now = Date.now();
  if (!symbolSet || now - symbolSetAt > EXCHANGE_INFO_TTL * 1000) {
    const list = await loadSymbols();
    if (list.length) {
      symbolSet = new Set(list.map(s => s.symbol));
      symbolSetAt = now;
    }
  }
  return symbolSet?.has(symbol.toUpperCase()) ?? false;
}

interface KlineMsg {
  k?: { t: number; o: string; h: string; l: string; c: string; v: string };
}

/** Subscribe to the live forming bar over WebSocket. Reconnects with backoff. */
function subscribe(symbol: string, tf: MarketTimeframe, onCandle: (c: NormalizedCandle) => void): () => void {
  if (!WSImpl) {
    logger.warn('Binance live: no global WebSocket — crypto live updates disabled');
    return () => {};
  }
  const streamUrl = `${env.BINANCE_WS_URL}/ws/${symbol.toLowerCase()}@kline_${tf}`;
  let closed = false;
  let ws: InstanceType<WsCtor> | null = null;
  let backoff = 1000;

  const connect = () => {
    if (closed) return;
    ws = new WSImpl(streamUrl);
    ws.addEventListener('open', () => { backoff = 1000; });
    ws.addEventListener('message', (ev: { data: unknown }) => {
      try {
        const msg = JSON.parse(String(ev.data)) as KlineMsg;
        const k = msg.k;
        if (!k) return;
        onCandle({ openTime: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
      } catch { /* ignore malformed frames */ }
    });
    const retry = () => {
      if (closed) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
    ws.addEventListener('close', retry);
    ws.addEventListener('error', () => { try { ws?.close(); } catch { /* noop */ } });
  };
  connect();

  return () => {
    closed = true;
    try { ws?.close(); } catch { /* noop */ }
  };
}

export function createBinanceProvider(): MarketProvider {
  return { name: 'binance', getCandles, searchSymbols, subscribe };
}
