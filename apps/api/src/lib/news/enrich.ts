// LLM enrichment for news items: sentiment, relevance, impact, category,
// market-moving flag. Batched (one call per ~10 headlines), budget-capped, and
// fully optional — when AI is off the caller simply serves un-enriched items.
//
// Robust to model output: parses the first JSON array, tolerates missing/extra
// entries, clamps ranges, and drops anything it can't read rather than throwing.
import { logger } from '@tradinjournal/logger';
import { getProvider } from '../ai/provider.js';
import { ENRICH_PROMPT, enrichUserContent, type EnrichInputItem } from './prompts.js';

const BATCH_SIZE = 10;

export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Impact = 'LOW' | 'MEDIUM' | 'HIGH';
export type Category = 'CRYPTO' | 'MACRO' | 'GEOPOLITICAL' | 'REGULATORY' | 'MARKETS';

export interface Enrichment {
  sentiment: Sentiment;
  relevance: number; // 0..100
  impact: Impact;
  category: Category | null;
  marketMoving: boolean;
  country: string | null;
}

export interface EnrichableItem {
  id: string;
  title: string;
  summary?: string;
}

const SENTIMENTS = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
const IMPACTS = new Set(['LOW', 'MEDIUM', 'HIGH']);
const CATEGORIES = new Set(['CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS']);

/** Parse the model's JSON array defensively into index→enrichment. */
function parseBatch(raw: string): Map<number, Enrichment> {
  const out = new Map<number, Enrichment>();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return out;
  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const el of arr) {
    if (!el || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    const i = typeof o.i === 'number' ? o.i : Number(o.i);
    if (!Number.isInteger(i)) continue;
    const sentiment = String(o.sentiment ?? '').toUpperCase();
    const impact = String(o.impact ?? '').toUpperCase();
    const category = String(o.category ?? '').toUpperCase();
    const relevanceNum = Math.round(Number(o.relevance));
    out.set(i, {
      sentiment: (SENTIMENTS.has(sentiment) ? sentiment : 'NEUTRAL') as Sentiment,
      relevance: Number.isFinite(relevanceNum) ? Math.min(100, Math.max(0, relevanceNum)) : 0,
      impact: (IMPACTS.has(impact) ? impact : 'LOW') as Impact,
      category: (CATEGORIES.has(category) ? category : null) as Category | null,
      marketMoving: o.marketMoving === true,
      country: typeof o.country === 'string' && /^[A-Za-z]{2}$/.test(o.country) ? o.country.toUpperCase() : null,
    });
  }
  return out;
}

/**
 * Enrich up to `items.length` items in batches. Returns id→enrichment for those
 * the model classified; missing ids are just left un-enriched by the caller.
 * Never throws — a failed batch contributes nothing.
 */
export async function enrichNews(items: EnrichableItem[]): Promise<Map<string, Enrichment>> {
  const result = new Map<string, Enrichment>();
  if (items.length === 0) return result;
  const provider = getProvider();

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const payload: EnrichInputItem[] = batch.map((it, idx) => ({ i: idx, title: it.title, summary: it.summary }));
    try {
      const reply = await provider.complete([
        { role: 'system', content: ENRICH_PROMPT },
        { role: 'user', content: enrichUserContent(payload) },
      ]);
      const parsed = parseBatch(reply);
      parsed.forEach((enr, idx) => {
        const item = batch[idx];
        if (item) result.set(item.id, enr);
      });
    } catch (err) {
      logger.warn(`News enrichment batch failed (skipped): ${(err as Error).message}`);
    }
  }
  return result;
}

export { parseBatch };
