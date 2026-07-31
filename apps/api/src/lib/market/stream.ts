// Live candle fan-out over Redis pub/sub, cloned from news/stream.ts, keyed per
// (symbol, timeframe). The LiveHub keeps exactly ONE upstream feed per active
// (symbol,tf) — a Binance WebSocket where available, else a poll — ref-counted
// so it opens on the first subscriber and closes on the last. Ticks are
// published to Redis and fanned out to every SSE connection (across instances).
//
// Fully optional: with no REDIS_URL, publish is a no-op and subscribe returns an
// immediate no-op cleanup; the SSE endpoint then just heartbeats and the client
// falls back to periodic re-fetch.
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { MarketTimeframe } from '@tradinjournal/contracts';
import type { BridgeCreds, NormalizedCandle } from './types.js';
import { resolveProvider } from './providers/index.js';

function channel(symbol: string, tf: MarketTimeframe): string {
  return `market:candle:${symbol}:${tf}`;
}

let publisher: Redis | null = null;
let pubDown = false;

function pub(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (publisher) return publisher;
  publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  publisher.on('error', () => {
    if (!pubDown) logger.warn('Market stream publisher Redis unavailable');
    pubDown = true;
  });
  publisher.on('ready', () => { pubDown = false; });
  return publisher;
}

/** Publish one forming/closed bar to every connected stream. Best-effort. */
export async function publishCandle(symbol: string, tf: MarketTimeframe, candle: NormalizedCandle): Promise<void> {
  const c = pub();
  if (!c || pubDown) return;
  try {
    await c.publish(channel(symbol, tf), JSON.stringify(candle));
  } catch {
    /* best-effort — the client sees the bar on its next re-fetch */
  }
}

/**
 * Subscribe to live bars for one (symbol,tf). `onCandle` fires per published
 * bar. Returns a cleanup that unsubscribes + closes the dedicated connection.
 * No-op when Redis isn't configured.
 */
export function subscribeCandle(
  symbol: string,
  tf: MarketTimeframe,
  onCandle: (c: NormalizedCandle) => void,
): () => void {
  if (!env.REDIS_URL) return () => {};
  const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on('error', () => {}); // no live updates just means the client re-fetches
  void sub.subscribe(channel(symbol, tf)).catch(() => {});
  sub.on('message', (_channel, message) => {
    try {
      onCandle(JSON.parse(message) as NormalizedCandle);
    } catch {
      /* ignore malformed */
    }
  });
  return () => {
    void sub.quit().catch(() => {});
  };
}

// ─── LiveHub — one ref-counted upstream feed per (symbol,tf) ──────────────────

interface HubEntry {
  refs: number;
  stop: () => void;
}
const hub = new Map<string, HubEntry>();
const POLL_MS = 5_000; // poll cadence for providers without a push feed (Twelve Data / MT5)

/**
 * Ensure a single upstream feed is running for (symbol,tf) and count this
 * subscriber. Binance streams over WS; other providers are polled. Broker
 * (MT5) symbols only get live updates when creds are supplied.
 */
export async function acquireLive(
  symbol: string,
  tf: MarketTimeframe,
  opts: { broker?: BridgeCreds } = {},
): Promise<void> {
  const key = channel(symbol, tf);
  const existing = hub.get(key);
  if (existing) {
    existing.refs += 1;
    return;
  }
  // Reserve synchronously so a concurrent acquire doesn't open a second upstream.
  const entry: HubEntry = { refs: 1, stop: () => {} };
  hub.set(key, entry);

  const provider = await resolveProvider(symbol, !!opts.broker);
  if (!provider) return; // nothing to stream; the reserved entry just heartbeats

  if (provider.subscribe) {
    entry.stop = provider.subscribe(symbol, tf, c => { void publishCandle(symbol, tf, c); });
  } else {
    const timer = setInterval(() => {
      void provider
        .getCandles(symbol, tf, { limit: 2, broker: opts.broker })
        .then(bars => {
          const last = bars[bars.length - 1];
          if (last) void publishCandle(symbol, tf, last);
        })
        .catch(() => {});
    }, POLL_MS);
    entry.stop = () => clearInterval(timer);
  }
}

/** Drop this subscriber; close the upstream feed when the last one leaves. */
export function releaseLive(symbol: string, tf: MarketTimeframe): void {
  const key = channel(symbol, tf);
  const entry = hub.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entry.stop();
    hub.delete(key);
  }
}

/** Test/telemetry helper: number of live upstream feeds currently open. */
export function liveFeedCount(): number {
  return hub.size;
}
