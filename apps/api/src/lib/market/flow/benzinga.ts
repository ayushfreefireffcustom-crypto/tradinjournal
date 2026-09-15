// Benzinga headline sentiment for stocks and forex. Missing key or no scored
// articles omits the lane — titles are not guessed.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import { noteVendor, readSnap, writeSnap } from './vendor-note.js';
import type { FlowSnap } from './unusual-whales.js';

const TTL = 180;
const SOURCE = 'Benzinga';

interface BzArticle {
  sentiment?: string | number;
  stocks?: Array<{ name?: string; sentiment?: string | number }>;
}

export function scoreBenzinga(articles: BzArticle[]): { score: number; rationale: string } | null {
  const scores: number[] = [];
  for (const a of articles) {
    const raw = a.sentiment ?? a.stocks?.find((s) => s.sentiment != null)?.sentiment;
    const n = sentimentNumber(raw);
    if (n != null) scores.push(n);
  }
  if (scores.length === 0) return null;
  const score = scores.reduce((s, n) => s + n, 0) / scores.length;
  return { score: Math.max(-1, Math.min(1, score)), rationale: `${scores.length} scored headlines` };
}

function sentimentNumber(raw: string | number | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1 || raw < -1) return Math.max(-1, Math.min(1, raw / 100));
    return raw;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase();
  if (s === 'positive' || s === 'bullish' || s === 'good') return 0.6;
  if (s === 'negative' || s === 'bearish' || s === 'bad') return -0.6;
  if (s === 'neutral') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n > 1 || n < -1 ? n / 100 : n)) : null;
}

function ticker(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/USDT$|USDC$/, '').slice(0, 12);
}

export async function fetchBenzinga(symbol: string): Promise<FlowSnap | null> {
  const key = env.BENZINGA_API_KEY;
  if (!key) return null;
  const tick = ticker(symbol);
  if (!tick) return null;
  const cacheKey = `trader:benzinga:${tick}`;
  const cached = await readSnap<Omit<FlowSnap, 'asOf' | 'stale'>>(cacheKey, TTL);

  try {
    const url = `https://api.benzinga.com/api/v2/news?token=${encodeURIComponent(key)}&tickers=${encodeURIComponent(tick)}&pageSize=12&displayOutput=abstract`;
    const json = await fetchJson<BzArticle[] | { articles?: BzArticle[] }>(url, undefined, {
      accept: 'application/json',
    });
    const articles = Array.isArray(json) ? json : (json.articles ?? []);
    const scored = scoreBenzinga(articles);
    if (!scored) {
      await noteVendor('benzinga', false);
      return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
    }
    const snap = { score: scored.score, rationale: `${SOURCE} ${scored.rationale}`, source: SOURCE };
    const asOf = await writeSnap(cacheKey, snap);
    await noteVendor('benzinga', true);
    return { ...snap, asOf, stale: false };
  } catch (err) {
    logger.warn(`[trader/benzinga] ${tick}: ${(err as Error).message}`);
    await noteVendor('benzinga', false);
    return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
  }
}
