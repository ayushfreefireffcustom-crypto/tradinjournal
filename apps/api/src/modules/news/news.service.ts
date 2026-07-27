// News service. Two decoupled phases (each its own worker cron), so neither the
// feed fetch nor the LLM blocks the other:
//   ingestNews()        — fetch every provider, reconcile, BULK-insert new items
//                         (one createMany, not N upserts), publish to the live feed.
//   enrichPendingNews() — separately pick un-enriched items and tag them (LLM).
// Reads are cursor-paginated from Postgres with a short cache on the first page.
// Providers/LLM are hit ONLY here, never per user request.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { Prisma } from '@tradinjournal/db';
import type { NewsQuery, NewsCategory, Sentiment, EventImpact } from '@tradinjournal/contracts';
import { getNewsProviders } from '../../lib/news/providers/index.js';
import { reconcileNews } from '../../lib/news/reconcile.js';
import type { NormalizedNews } from '../../lib/news/types.js';
import { enrichNews } from '../../lib/news/enrich.js';
import { publishNews } from '../../lib/news/stream.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';

const FIRST_PAGE_TTL_SECONDS = 30;
const DEFAULT_LIMIT = 40;

/**
 * Fetch → reconcile → bulk-insert NEW items → publish. Fast: one `createMany`
 * instead of a per-row upsert loop, and no LLM in the hot path (that's a separate
 * pass). Existing items aren't rewritten — news content doesn't change.
 */
export async function ingestNews(): Promise<{ fetched: number; inserted: number }> {
  const providers = getNewsProviders();
  const settled = await Promise.allSettled(providers.map(p => p.fetchLatest()));
  const rows: NormalizedNews[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(...r.value);
    else logger.warn(`News provider ${providers[i]!.name} failed: ${(r.reason as Error).message}`);
  });
  if (rows.length === 0) return { fetched: 0, inserted: 0 };

  const reconciled = reconcileNews(rows);
  const existing = await prisma.newsItem.findMany({
    where: { dedupKey: { in: reconciled.map(r => r.dedupKey) } },
    select: { dedupKey: true },
  });
  const existingKeys = new Set(existing.map(e => e.dedupKey));
  const fresh = reconciled.filter(r => !existingKeys.has(r.dedupKey));

  if (fresh.length > 0) {
    // One bulk insert. skipDuplicates guards a race with a concurrent tick.
    await prisma.newsItem.createMany({
      data: fresh.map(r => ({
        dedupKey: r.dedupKey,
        url: r.url,
        title: r.title,
        summary: r.summary,
        source: r.source,
        sources: (r.outlets.length > 1 ? { outlets: r.outlets } : undefined) as Prisma.InputJsonValue | undefined,
        imageUrl: r.imageUrl,
        publishedAt: r.publishedAt,
        country: r.country,
        category: r.category ?? undefined,
      })),
      skipDuplicates: true,
    });

    // Load what we just inserted and push it to any live SSE subscribers. Items
    // stream in un-enriched (chips appear once the enrich pass tags them).
    try {
      const inserted = await prisma.newsItem.findMany({
        where: { dedupKey: { in: fresh.map(r => r.dedupKey) } },
        orderBy: { publishedAt: 'desc' },
      });
      await publishNews(inserted.map(toNewsDTO));
    } catch (err) {
      logger.warn(`News publish failed (non-fatal): ${(err as Error).message}`);
    }
  }

  // Keep the table lean — news is ephemeral. Drop items older than the window
  // (indexed on publishedAt; usually a no-op). Non-fatal.
  try {
    await prisma.newsItem.deleteMany({ where: { publishedAt: { lt: new Date(Date.now() - 45 * 24 * 3600_000) } } });
  } catch (err) {
    logger.warn(`News prune failed (non-fatal): ${(err as Error).message}`);
  }

  return { fetched: rows.length, inserted: fresh.length };
}

/**
 * Enrich up to `limit` un-tagged items with the LLM (sentiment / relevance /
 * impact / category). Runs on its own cron, decoupled from ingestion. Items the
 * model omits are marked done so they don't block the queue forever.
 */
export async function enrichPendingNews(limit: number): Promise<{ enriched: number }> {
  if (!env.NEWS_ENRICH_ENABLED) return { enriched: 0 };
  const pending = await prisma.newsItem.findMany({
    where: { enrichedAt: null },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { id: true, title: true, summary: true },
  });
  if (pending.length === 0) return { enriched: 0 };

  const results = await enrichNews(pending.map(p => ({ id: p.id, title: p.title, summary: p.summary ?? undefined })));
  const now = new Date();
  let enriched = 0;
  for (const item of pending) {
    const e = results.get(item.id);
    try {
      await prisma.newsItem.update({
        where: { id: item.id },
        data: e
          ? {
              sentiment: e.sentiment,
              relevance: e.relevance,
              impact: e.impact,
              marketMoving: e.marketMoving,
              category: e.category ?? undefined,
              country: e.country ?? undefined,
              enrichedAt: now,
            }
          : { enrichedAt: now }, // model omitted it — mark done, don't retry forever
      });
      if (e) enriched += 1;
    } catch (err) {
      logger.warn(`News enrich-update failed for ${item.id}: ${(err as Error).message}`);
    }
  }
  return { enriched };
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
  category: NewsCategory | null;
  sentiment: Sentiment | null;
  relevance: number | null;
  impact: EventImpact | null;
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
