// Economic-calendar service. Ingestion fetches every configured provider for a
// UTC window, reconciles them into one row per event, and upserts by dedupKey —
// back-filling `actual`/`actualAt` when a result is released. Reads serve from a
// short-lived Redis cache, falling back to Postgres (the source of truth).
//
// Providers are hit ONLY here (once per ingest), never per user request.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { CalendarQuery, EventImpact } from '@tradinjournal/contracts';
import type { Prisma } from '@tradinjournal/db';
import { getCalendarProviders } from '../../lib/calendar/providers/index.js';
import { reconcileEvents } from '../../lib/calendar/reconcile.js';
import type { NormalizedEvent } from '../../lib/calendar/types.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';

const READ_TTL_SECONDS = 45;

/**
 * Fetch every provider for [from,to], reconcile, and upsert. Returns how many
 * events were written. Never throws for a single provider failure — that
 * provider simply contributes nothing and the others still merge.
 */
export async function ingestWindow(from: Date, to: Date): Promise<{ upserted: number; providers: number }> {
  const providers = getCalendarProviders();
  if (providers.length === 0) return { upserted: 0, providers: 0 };

  const settled = await Promise.allSettled(providers.map(p => p.fetchWindow(from, to)));
  const rows: NormalizedEvent[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(...r.value);
    else logger.warn(`Calendar provider ${providers[i]!.name} failed: ${(r.reason as Error).message}`);
  });
  if (rows.length === 0) return { upserted: 0, providers: providers.length };

  const reconciled = reconcileEvents(rows, env.CALENDAR_PROVIDER_PRIORITY_LIST);

  // One read of prior state so we can (a) stamp actualAt only when a result FIRST
  // arrives, and (b) skip rewriting rows that haven't changed. Bulk-insert new
  // rows (one createMany) and update only the few that actually differ — the old
  // per-row upsert loop couldn't keep up with a full-history provider like TV.
  const existing = await prisma.economicEvent.findMany({
    where: { dedupKey: { in: reconciled.map(e => e.dedupKey) } },
    select: { dedupKey: true, actual: true, actualAt: true, forecast: true, previous: true, impact: true, eventTime: true, title: true },
  });
  const priorByKey = new Map(existing.map(e => [e.dedupKey, e]));

  const now = new Date();
  const toCreate: Prisma.EconomicEventCreateManyInput[] = [];
  const toUpdate: { dedupKey: string; data: Prisma.EconomicEventUpdateInput }[] = [];

  for (const e of reconciled) {
    const prior = priorByKey.get(e.dedupKey);
    const actualJustArrived = !!e.actual && !prior?.actual;
    const actualAt = e.actual ? (prior?.actualAt ?? (actualJustArrived ? now : null)) : null;
    const data = {
      title: e.title,
      country: e.country,
      currency: e.currency,
      category: e.category,
      impact: e.impact,
      eventTime: e.eventTimeUtc,
      actual: e.actual,
      forecast: e.forecast,
      previous: e.previous,
      unit: e.unit,
      actualAt,
      sources: e.sources as unknown as Prisma.InputJsonValue,
    };
    if (!prior) {
      toCreate.push({ dedupKey: e.dedupKey, ...data });
      continue;
    }
    const changed =
      prior.actual !== (e.actual ?? null) ||
      prior.forecast !== (e.forecast ?? null) ||
      prior.previous !== (e.previous ?? null) ||
      prior.impact !== e.impact ||
      prior.title !== e.title ||
      prior.eventTime.getTime() !== e.eventTimeUtc.getTime();
    if (changed) toUpdate.push({ dedupKey: e.dedupKey, data });
  }

  let upserted = 0;
  if (toCreate.length > 0) {
    const res = await prisma.economicEvent.createMany({ data: toCreate, skipDuplicates: true });
    upserted += res.count;
  }
  for (const u of toUpdate) {
    try {
      await prisma.economicEvent.update({ where: { dedupKey: u.dedupKey }, data: u.data });
      upserted += 1;
    } catch (err) {
      logger.warn(`Calendar update failed for ${u.dedupKey}: ${(err as Error).message}`);
    }
  }
  return { upserted, providers: providers.length };
}

function cacheKey(q: CalendarQuery): string {
  return `cal:${q.from ?? ''}:${q.to ?? ''}:${q.impact ?? ''}:${q.currency ?? ''}:${q.category ?? ''}`;
}

export interface CalendarEventDTO {
  id: string;
  title: string;
  country: string;
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTime: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  actualAt: string | null;
}

/** Default hot window when the caller doesn't specify: yesterday → +7 days. */
function defaultWindow(): { from: Date; to: Date } {
  // Wide default so a request without from/to still surfaces recent past + ahead.
  const from = new Date(Date.now() - 7 * 24 * 3600_000);
  const to = new Date(Date.now() + 30 * 24 * 3600_000);
  return { from, to };
}

export async function listEvents(q: CalendarQuery): Promise<CalendarEventDTO[]> {
  const key = cacheKey(q);
  const cached = await cacheGet<CalendarEventDTO[]>(key);
  if (cached) return cached;

  const win = defaultWindow();
  const where: Prisma.EconomicEventWhereInput = {
    eventTime: {
      gte: q.from ? new Date(q.from) : win.from,
      lte: q.to ? new Date(q.to) : win.to,
    },
    ...(q.impact ? { impact: q.impact } : {}),
    ...(q.currency ? { currency: q.currency.toUpperCase() } : {}),
    ...(q.category ? { category: q.category } : {}),
  };
  // Cap generously: a wide window with the full (holiday-inclusive) feed can hold
  // >500 events, and a 500 asc cap would return only the earliest (all past),
  // hiding today + upcoming entirely.
  const rows = await prisma.economicEvent.findMany({ where, orderBy: { eventTime: 'asc' }, take: 2000 });
  const dto = rows.map(toDTO);
  await cacheSet(key, dto, READ_TTL_SECONDS);
  return dto;
}

export async function getEvent(id: string): Promise<(CalendarEventDTO & { sources: unknown }) | null> {
  const row = await prisma.economicEvent.findUnique({ where: { id } });
  if (!row) return null;
  return { ...toDTO(row), sources: row.sources };
}

function toDTO(row: {
  id: string; title: string; country: string; currency: string; category: string | null;
  impact: 'LOW' | 'MEDIUM' | 'HIGH'; eventTime: Date; actual: string | null; forecast: string | null;
  previous: string | null; unit: string | null; actualAt: Date | null;
}): CalendarEventDTO {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    currency: row.currency,
    category: row.category,
    impact: row.impact,
    eventTime: row.eventTime.toISOString(),
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    unit: row.unit,
    actualAt: row.actualAt ? row.actualAt.toISOString() : null,
  };
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export async function watchEvent(userId: string, eventId: string): Promise<boolean> {
  const event = await prisma.economicEvent.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return false;
  await prisma.eventWatch.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId },
    update: {},
  });
  return true;
}

export async function unwatchEvent(userId: string, eventId: string): Promise<void> {
  await prisma.eventWatch.deleteMany({ where: { userId, eventId } });
}

export async function listWatchedEventIds(userId: string): Promise<string[]> {
  const rows = await prisma.eventWatch.findMany({ where: { userId }, select: { eventId: true } });
  return rows.map(r => r.eventId);
}
