// Santiment social/on-chain sentiment for the major crypto names.
// GraphQL, paid key. Unknown slugs omit the lane.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { noteVendor, readSnap, writeSnap } from './vendor-note.js';
import type { FlowSnap } from './unusual-whales.js';

const TTL = 180;
const SOURCE = 'Santiment';

const SLUGS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  BNB: 'binance-coin',
  LTC: 'litecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche',
  LINK: 'chainlink',
};

export function scoreSantiment(values: number[]): { score: number; rationale: string } | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const last = finite[finite.length - 1]!;
  // sentiment_balance_total is unbounded; typical prints sit inside ±5.
  const score = Math.max(-1, Math.min(1, last / 5));
  return { score, rationale: `sentiment ${last >= 0 ? '+' : ''}${last.toFixed(2)}` };
}

function slugOf(symbol: string): string | null {
  const base = symbol.toUpperCase().replace(/USDT$|USDC$|BUSD$|USD$/, '');
  return SLUGS[base] ?? null;
}

export async function fetchSantiment(symbol: string): Promise<FlowSnap | null> {
  const key = env.SANTIMENT_API_KEY;
  const slug = slugOf(symbol);
  if (!key || !slug) return null;
  const cacheKey = `trader:santiment:${slug}`;
  const cached = await readSnap<Omit<FlowSnap, 'asOf' | 'stale'>>(cacheKey, TTL);

  const to = new Date();
  const from = new Date(to.getTime() - 3 * 86400_000);
  const query = {
    query: `query ($slug: String!, $from: DateTime!, $to: DateTime!) {
      getMetric(metric: "sentiment_balance_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") { datetime value }
      }
    }`,
    variables: { slug, from: from.toISOString(), to: to.toISOString() },
  };

  try {
    const res = await fetch('https://api.santiment.net/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Apikey ${key}`,
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { getMetric?: { timeseriesData?: Array<{ value?: number }> } };
    };
    const values = (json.data?.getMetric?.timeseriesData ?? []).map((p) => Number(p.value));
    const scored = scoreSantiment(values);
    if (!scored) {
      await noteVendor('santiment', false);
      return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
    }
    const snap = { score: scored.score, rationale: `${SOURCE} ${scored.rationale}`, source: SOURCE };
    const asOf = await writeSnap(cacheKey, snap);
    await noteVendor('santiment', true);
    return { ...snap, asOf, stale: false };
  } catch (err) {
    logger.warn(`[trader/santiment] ${slug}: ${(err as Error).message}`);
    await noteVendor('santiment', false);
    return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
  }
}
