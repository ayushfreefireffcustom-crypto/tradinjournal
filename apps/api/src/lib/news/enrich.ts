// LLM enrichment for news items: sentiment, relevance, impact, category,
// market-moving flag. Batched (one call per ~10 headlines), budget-capped, and
// fully optional — when AI is off the caller simply serves un-enriched items.
//
// Robust to model output: parses the first JSON array, tolerates missing/extra
// entries, clamps ranges, and drops anything it can't read rather than throwing.
import { logger } from '@tradinjournal/logger';
import {
  EVENT_IMPACTS,
  NEWS_CATEGORIES,
  SENTIMENTS,
  type EventImpact,
  type NewsCategory,
  type Sentiment,
} from '@tradinjournal/contracts';
import { getProvider } from '../ai/provider.js';
import { ENRICH_PROMPT, enrichUserContent, type EnrichInputItem } from './prompts.js';

const BATCH_SIZE = 10;

const ENRICH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          sentiment: { type: 'string', enum: [...SENTIMENTS] },
          relevance: { type: 'integer', description: '0-100' },
          impact: { type: 'string', enum: [...EVENT_IMPACTS] },
          category: { anyOf: [{ type: 'string', enum: [...NEWS_CATEGORIES] }, { type: 'null' }] },
          marketMoving: { type: 'boolean' },
          country: { anyOf: [{ type: 'string', description: 'ISO-3166 alpha-2' }, { type: 'null' }] },
        },
        required: ['i', 'sentiment', 'relevance', 'impact', 'category', 'marketMoving', 'country'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export interface Enrichment {
  sentiment: Sentiment;
  relevance: number; // 0..100
  impact: EventImpact;
  category: NewsCategory | null;
  marketMoving: boolean;
  country: string | null;
}

export interface EnrichableItem {
  id: string;
  title: string;
  summary?: string;
}

// Membership sets for defensive parsing, built from the shared enum tuples.
const SENTIMENT_SET = new Set<string>(SENTIMENTS);
const IMPACT_SET = new Set<string>(EVENT_IMPACTS);
const CATEGORY_SET = new Set<string>(NEWS_CATEGORIES);

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
      sentiment: (SENTIMENT_SET.has(sentiment) ? sentiment : 'NEUTRAL') as Sentiment,
      relevance: Number.isFinite(relevanceNum) ? Math.min(100, Math.max(0, relevanceNum)) : 0,
      impact: (IMPACT_SET.has(impact) ? impact : 'LOW') as EventImpact,
      category: (CATEGORY_SET.has(category) ? category : null) as NewsCategory | null,
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
      // Fast model, no reasoning: a labelling job run on every feed refresh.
      const reply = (await provider.json(
        [
          { role: 'system', content: ENRICH_PROMPT },
          { role: 'user', content: enrichUserContent(payload) },
        ],
        ENRICH_SCHEMA,
        { tier: 'fast', effort: 'low', thinking: false, maxTokens: 3000 },
      )) as { items?: unknown };
      const parsed = parseBatch(JSON.stringify(reply.items ?? []));
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
