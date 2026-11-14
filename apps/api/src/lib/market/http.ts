// Hard-timeout JSON GET for market provider adapters (the calendar util's
// fetchJson is coupled to calendar types, so market keeps its own tiny copy).
// Hosts that refuse US servers go through the Singapore relay when one is set.
import { env } from '@tradinjournal/config';

const FETCH_TIMEOUT_MS = 10_000;
const RELAYED = new Set(['api.bybit.com', 'fapi.binance.com']);

/** The relay URL for a host that blocks US servers; otherwise the URL as given. */
export function viaRelay(url: string, relay = env.MARKET_RELAY_URL, token = env.MARKET_RELAY_TOKEN): { url: string; headers: Record<string, string> } {
  if (!relay || !token) return { url, headers: {} };
  const u = new URL(url);
  if (u.protocol !== 'https:' || !RELAYED.has(u.hostname)) return { url, headers: {} };
  return { url: `${relay.replace(/\/$/, '')}/r/${u.hostname}${u.pathname}${u.search}`, headers: { 'x-relay-token': token } };
}

/** GET JSON with a hard timeout merged onto the caller's abort signal. */
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const r = viaRelay(url);
    const res = await fetch(r.url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...extraHeaders, ...r.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * GET JSON from one of the relay's own routes (e.g. `/liquidations/recent?coin=BTC`).
 * Throws when no relay is configured, so callers can report "no feed".
 */
export async function fetchRelayJson<T>(path: string, signal?: AbortSignal, relay = env.MARKET_RELAY_URL, token = env.MARKET_RELAY_TOKEN): Promise<T> {
  if (!relay || !token) throw new Error('no market relay configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${relay.replace(/\/$/, '')}${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'x-relay-token': token },
    });
    if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
