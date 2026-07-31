// MT5 market-data provider — the user's own broker symbols (AUDCAD.z, GOLD.i#…).
// Calls the bridge POST /candles (same X-Bridge-Secret auth as broker sync).
// Requires broker credentials (opts.broker); without them it returns [] — the
// bridge is per-broker, so there is no generic market feed here. Live updates
// are polled by the LiveHub (the bridge has no push), and only when creds flow.
import { env } from '@tradinjournal/config';
import type { MarketTimeframe } from '@tradinjournal/contracts';
import { fetchJson } from '../http.js';
import type { GetCandlesOpts, MarketProvider, NormalizedCandle } from '../types.js';

interface BridgeCandle {
  time: number; // unix seconds
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  spread: number;
}
interface BridgeCandlesResponse {
  candles: BridgeCandle[];
  total: number;
}

async function postCandles(body: object, signal?: AbortSignal): Promise<BridgeCandlesResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${env.MT5_BRIDGE_URL}/candles`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': env.MT5_BRIDGE_SHARED_SECRET },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as BridgeCandlesResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function getCandles(
  symbol: string,
  tf: MarketTimeframe,
  opts: GetCandlesOpts,
  signal?: AbortSignal,
): Promise<NormalizedCandle[]> {
  if (!opts.broker) return []; // no account → cannot reach the right terminal
  const body: Record<string, unknown> = {
    login: opts.broker.login,
    password: opts.broker.password,
    server: opts.broker.server,
    symbol,
    timeframe: tf,
  };
  if (opts.from) {
    body.from_time = new Date(opts.from * 1000).toISOString();
    body.to_time = new Date((opts.to ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  } else {
    body.count = opts.limit ?? 500;
  }

  const data = await postCandles(body, signal);
  if (!data?.candles?.length) return [];
  return data.candles.map(c => ({
    openTime: c.time * 1000, // seconds → ms
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume),
  }));
}

export function createMt5Provider(): MarketProvider {
  return { name: 'mt5', getCandles };
}
