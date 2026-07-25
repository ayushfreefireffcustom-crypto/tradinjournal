// News service. Ingestion fetches every provider, reconciles duplicates, upserts
// by dedupKey, and (when AI is on) enriches newly-seen items in a budget-capped
// batch. Reads are cursor-paginated from Postgres with a short cache on the first
// page. Providers/LLM are hit ONLY here, never per user request.
import { createHash } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { Prisma } from '@tradinjournal/db';
import type { NewsQuery } from '@tradinjournal/contracts';
import { getNewsProviders } from '../../lib/news/providers/index.js';
import { reconcileNews } from '../../lib/news/reconcile.js';
import type { NormalizedNews } from '../../lib/news/types.js';
import { enrichNews, type EnrichableItem } from '../../lib/news/enrich.js';
import { publishNews } from '../../lib/news/stream.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';

const FIRST_PAGE_TTL_SECONDS = 30;
const DEFAULT_LIMIT = 40;

/** Content hash → skip re-enriching an unchanged item. */
function enrichHash(title: string, summary: string | null): string {
  return createHash('sha1').update(`${title}\n${summary ?? ''}`).digest('hex');
}

export async function ingestNews(): Promise<{ fetched: number; inserted: number; enriched: number }> {
  const providers = getNewsProviders();
  const settled = await Promise.allSettled(providers.map(p => p.fetchLatest()));
  const rows: NormalizedNews[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(...r.value);
    else logger.warn(`News provider ${providers[i]!.name} failed: ${(r.reason as Error).message}`);
  });
  if (rows.length === 0) return { fetched: 0, inserted: 0, enriched: 0 };

  const reconciled = reconcileNews(rows);
  const keys = reconciled.map(r => r.dedupKey);
  const existing = await prisma.newsItem.findMany({
    where: { dedupKey: { in: keys } },
    select: { id: true, dedupKey: true, enrichHash: true, enrichedAt: true },
  });
  const priorByKey = new Map(existing.map(e => [e.dedupKey, e]));

  // Upsert base fields; collect items still needing enrichment.
  const toEnrich: EnrichableItem[] = [];
  const insertedIds: string[] = [];
  let inserted = 0;
  for (const r of reconciled) {
    const hash = enrichHash(r.title, r.summary);
    const prior = priorByKey.get(r.dedupKey);
    const base = {
      url: r.url,
      title: r.title,
      summary: r.summary,
      source: r.source,
      sources: (r.outlets.length > 1 ? { outlets: r.outlets } : undefined) as Prisma.InputJsonValue | undefined,
      imageUrl: r.imageUrl,
      publishedAt: r.publishedAt,
      country: r.country,
      category: r.category ?? undefined,
    };
    try {
      const row = await prisma.newsItem.upsert({
        where: { dedupKey: r.dedupKey },
        create: { dedupKey: r.dedupKey, ...base },
        update: { url: base.url, summary: base.summary, sources: base.sources, imageUrl: base.imageUrl },
        select: { id: true },
      });
      if (!prior) {
        inserted += 1;
        insertedIds.push(row.id);
      }
      const needsEnrich = !prior || prior.enrichHash !== hash || !prior.enrichedAt;
      if (needsEnrich) toEnrich.push({ id: row.id, title: r.title, summary: r.summary ?? undefined });
    } catch (err) {
      logger.warn(`News upsert failed for ${r.dedupKey}: ${(err as Error).message}`);
    }
  }

  // Enrich a budget-capped slice (newest first — most relevant to surface).
  let enriched = 0;
  if (env.NEWS_ENRICH_ENABLED && toEnrich.length > 0) {
    const batch = toEnrich.slice(0, env.NEWS_ENRICH_MAX_PER_TICK);
    const results = await enrichNews(batch);
    const now = new Date();
    for (const item of batch) {
      const e = results.get(item.id);
      if (!e) continue;
      try {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            sentiment: e.sentiment,
            relevance: e.relevance,
            impact: e.impact,
            marketMoving: e.marketMoving,
            category: e.category ?? undefined,
            country: e.country ?? undefined,
            enrichedAt: now,
            enrichHash: enrichHash(item.title, item.summary ?? null),
          },
        });
        enriched += 1;
      } catch (err) {
        logger.warn(`News enrich-update failed for ${item.id}: ${(err as Error).message}`);
      }
    }
  }

  // Push the newly-inserted items (now enriched) to any live SSE subscribers.
  if (insertedIds.length > 0) {
    try {
      const fresh = await prisma.newsItem.findMany({
        where: { id: { in: insertedIds } },
        orderBy: { publishedAt: 'desc' },
      });
      await publishNews(fresh.map(toNewsDTO));
    } catch (err) {
      logger.warn(`News publish failed (non-fatal): ${(err as Error).message}`);
    }
  }

  return { fetched: rows.length, inserted, enriched };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface NewsItemDTO {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  outlets: string[];
  imageUrl: string | null;
  publishedAt: string;
  country: string | null;
  category: 'CRYPTO' | 'MACRO' | 'GEOPOLITICAL' | 'REGULATORY' | 'MARKETS' | null;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  relevance: number | null;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  marketMoving: boolean;
}

type NewsRow = Prisma.NewsItemGetPayload<{ /* all scalar fields */ }>;

export function toNewsDTO(row: NewsRow): NewsItemDTO {
  const outlets =
    row.sources && typeof row.sources === 'object' && 'outlets' in row.sources && Array.isArray((row.sources as { outlets: unknown }).outlets)
      ? ((row.sources as { outlets: string[] }).outlets)
      : [row.source];
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    summary: row.summary,
    source: row.source,
    outlets,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt.toISOString(),
    country: row.country,
    category: row.category,
    sentiment: row.sentiment,
    relevance: row.relevance,
    impact: row.impact,
    marketMoving: row.marketMoving,
  };
}

export interface NewsPage {
  items: NewsItemDTO[];
  nextCursor: string | null;
}

export async function listNews(q: NewsQuery): Promise<NewsPage> {
  const limit = q.limit ?? DEFAULT_LIMIT;
  const filtered = !!(q.category || q.country || q.impact || q.sentiment);
  const cacheable = !q.cursor && !filtered; // only the unfiltered first page

  const key = 'news:first';
  if (cacheable) {
    const cached = await cacheGet<NewsPage>(key);
    if (cached) return cached;
  }

  const where: Prisma.NewsItemWhereInput = {
    ...(q.category ? { category: q.category } : {}),
    ...(q.country ? { country: q.country.toUpperCase() } : {}),
    ...(q.impact ? { impact: q.impact } : {}),
    ...(q.sentiment ? { sentiment: q.sentiment } : {}),
  };
  const rows = await prisma.newsItem.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const result: NewsPage = {
    items: page.map(toNewsDTO),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
  if (cacheable) await cacheSet(key, result, FIRST_PAGE_TTL_SECONDS);
  return result;
}

/** Top items for the morning brief: highest-impact/most-relevant from the last day. */
export async function getBriefHeadlines(): Promise<Array<{ title: string; source: string; impact: string | null }>> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await prisma.newsItem.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: [{ marketMoving: 'desc' }, { relevance: 'desc' }, { publishedAt: 'desc' }],
    take: 20,
    select: { title: true, source: true, impact: true },
  });
  return rows.map(r => ({ title: r.title, source: r.source, impact: r.impact }));
}
