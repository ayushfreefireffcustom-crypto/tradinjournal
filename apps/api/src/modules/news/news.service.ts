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
import { getSourceCatalog, type SourceCatalogEntry } from '../../lib/news/providers/rss.js';
import { reconcileNews } from '../../lib/news/reconcile.js';
import type { NormalizedNews } from '../../lib/news/types.js';
import { enrichNews } from '../../lib/news/enrich.js';
import { publishNews } from '../../lib/news/stream.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { tickersFor, deskFor, storyScore, isKept } from '../../lib/news/tickers.js';
import { getReactionSeries, trimSince } from '../../lib/news/reactions.js';
import type { NewsDesk, NewsScoreSource, NewsTodayDTO, NewsReactionsDTO } from '@tradinjournal/contracts';

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
    select: { id: true, title: true, summary: true, sources: true },
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
              // The short tile title and the one-line takeaway ride in the
              // `sources` JSON next to the outlet cluster (no schema change).
              ...(e.short || e.line
                ? { sources: { ...sourcesMeta(item.sources), ...(e.short ? { short: e.short } : {}), ...(e.line ? { line: e.line } : {}) } as Prisma.InputJsonValue }
                : {}),
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
  /** Derived at read time (lib/news/tickers.ts). */
  tickers: string[];
  desk: NewsDesk | null;
  /** 0..100: the LLM relevance, or the rules fallback when not enriched yet. */
  score: number;
  scoreSource: NewsScoreSource;
  /** Outlets that carried it (1 = only the canonical one). */
  sourceCount: number;
  /** LLM tile title (≤ 6 words) and takeaway (≤ 8 words), when enriched with them. */
  short: string | null;
  line: string | null;
}

/** The `sources` JSON: `{ outlets?, short?, line? }` (older rows: outlets only or null). */
function sourcesMeta(raw: unknown): { outlets?: string[]; short?: string; line?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    ...(Array.isArray(o.outlets) ? { outlets: o.outlets.filter((x): x is string => typeof x === 'string') } : {}),
    ...(typeof o.short === 'string' && o.short.trim() ? { short: o.short.trim() } : {}),
    ...(typeof o.line === 'string' && o.line.trim() ? { line: o.line.trim() } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` = Prisma's "all scalar fields" payload
type NewsRow = Prisma.NewsItemGetPayload<{ /* all scalar fields */ }>;

export function toNewsDTO(row: NewsRow): NewsItemDTO {
  const meta = sourcesMeta(row.sources);
  const outlets = meta.outlets?.length ? meta.outlets : [row.source];
  const sourceCount = Math.max(1, outlets.length);
  const { score, source: scoreSource } = storyScore({
    title: row.title, summary: row.summary, relevance: row.relevance, impact: row.impact,
    marketMoving: row.marketMoving, category: row.category, sourceCount,
  });
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
    tickers: tickersFor(row.title, row.summary),
    desk: deskFor(row.category, row.title, row.summary),
    score,
    scoreSource,
    sourceCount,
    short: meta.short ?? null,
    line: meta.line ?? null,
  };
}

export interface NewsPage {
  items: NewsItemDTO[];
  nextCursor: string | null;
}

/** Split a CSV query param into a trimmed, de-empted list. */
function csvList(v: string | undefined): string[] {
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
}

export async function listNews(q: NewsQuery): Promise<NewsPage> {
  const limit = q.limit ?? DEFAULT_LIMIT;
  const sources = csvList(q.sources);
  const excludeSources = csvList(q.excludeSources);
  const filtered = !!(q.category || q.country || q.impact || q.sentiment || sources.length || excludeSources.length);
  const cacheable = !q.cursor && !filtered; // only the unfiltered first page

  const key = 'news:first';
  if (cacheable) {
    const cached = await cacheGet<NewsPage>(key);
    if (cached) return cached;
  }

  const where: Prisma.NewsItemWhereInput = {
    // Stories dated in the future came from bad feed dates; never lead the feed with them.
    publishedAt: { lte: new Date(Date.now() + 60 * 60_000) },
    ...(sources.length ? { source: { in: sources } } : {}),
    ...(excludeSources.length ? { source: { notIn: excludeSources } } : {}),
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

// ── News map (v2) ───────────────────────────────────────────────────────────

const TODAY_TTL_SECONDS = 30;
const TODAY_MAX_STORIES = 400;
const TODAY_MAX_ROWS = 5000;

/**
 * The last 24h for the story map: kept stories (score 40+ or HIGH impact),
 * newest first, plus the noise counts. merged = the extra outlets folded into
 * a story; hidden = stories under the bar; headlines = kept + merged + hidden.
 */
export async function getNewsToday(): Promise<NewsTodayDTO<NewsItemDTO>> {
  const key = 'news:today:v1';
  const cached = await cacheGet<NewsTodayDTO<NewsItemDTO>>(key);
  if (cached) return cached;

  const now = Date.now();
  const from = new Date(now - 24 * 3600_000);
  const rows = await prisma.newsItem.findMany({
    where: { publishedAt: { gte: from, lte: new Date(now + 60 * 60_000) } },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: TODAY_MAX_ROWS,
  });
  const dtos = rows.map(toNewsDTO);
  const kept = dtos.filter(d => isKept(d.score, d.impact));
  const merged = dtos.reduce((a, d) => a + (d.sourceCount - 1), 0);
  const outlets = new Set<string>();
  for (const d of dtos) for (const o of d.outlets) outlets.add(o);

  const result: NewsTodayDTO<NewsItemDTO> = {
    asOf: new Date(now).toISOString(),
    from: from.toISOString(),
    counts: {
      headlines: dtos.length + merged,
      stories: dtos.length,
      kept: kept.length,
      merged,
      hidden: dtos.length - kept.length,
      sources: outlets.size,
    },
    stories: kept.slice(0, TODAY_MAX_STORIES),
  };
  await cacheSet(key, result, TODAY_TTL_SECONDS);
  return result;
}

/** 5-minute series for the watch set (cached 60s), trimmed to `since` when given. */
export async function getNewsReactions(since?: string): Promise<NewsReactionsDTO> {
  return trimSince(await getReactionSeries(), since);
}

/** The outlets a user can choose to prioritize (the curated feed catalog). */
export function listSources(): SourceCatalogEntry[] {
  return getSourceCatalog();
}

/**
 * A user's preferred outlet keys. Degrades to "no preference" ([]) if the row is
 * missing or the table isn't there yet (pre-migration) — the feed then renders
 * as one unpersonalized list rather than erroring.
 */
export async function getNewsPreferences(userId: string): Promise<{ sources: string[] }> {
  try {
    const pref = await prisma.newsPreference.findUnique({ where: { userId }, select: { sources: true } });
    return { sources: pref?.sources ?? [] };
  } catch (err) {
    logger.warn(`News preferences read failed (serving empty): ${(err as Error).message}`);
    return { sources: [] };
  }
}

/** Save a user's preferred outlets. Unknown keys are dropped against the catalog. */
export async function setNewsPreferences(userId: string, sources: string[]): Promise<{ sources: string[] }> {
  const valid = new Set(getSourceCatalog().map(s => s.key));
  const clean = [...new Set(sources.filter(s => valid.has(s)))];
  const pref = await prisma.newsPreference.upsert({
    where: { userId },
    create: { userId, sources: clean },
    update: { sources: clean },
    select: { sources: true },
  });
  return { sources: pref.sources };
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
