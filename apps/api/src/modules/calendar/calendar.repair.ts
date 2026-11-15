// One-off repair for calendar rows written while the reconciler's title aliases
// were too loose (every "CPI…", "GDP…", "…Unemployment Rate", "…Payrolls" at
// one hour folded into one row, and euro members shared one row per currency).
// Such a row carries one release's actual next to another's forecast, and the
// other releases are missing from the calendar.
//
// The evidence is in each row's own provenance: `sources.raw` holds every
// provider row that was merged into it. The repair re-runs today's reconciler
// over those provider rows (all rows at once, so it also merges rows that now
// name the same release — e.g. a Forex Factory "CPI m/m" row and TradingView's
// "Inflation Rate MoM" row, or a duplicate an ingest created under a new key)
// and moves the table to that result:
//   • a row holding several releases keeps its id for the release whose title
//     it shows (the one users saw and watched); the others become new rows,
//   • a row whose key only changed spelling is re-keyed in place (same id),
//   • rows that now name the same release are merged into one: the survivor is
//     the one users watch (else the one already on the right key, else the
//     oldest); watches, inbox notifications and reminder-ledger entries of the
//     others are moved to it before they are deleted.
// Nothing else references an event (event_watch is the only foreign key; the
// inbox `notification.eventId` and the `reminder:<eventId>:<userId>` ledger keys
// are plain strings and are re-pointed).
//
// planCalendarRepair is pure (unit-tested); applyCalendarRepair writes the plan
// in one transaction. Script: apps/api/scripts/repair-calendar-merges.ts.
import type { Prisma, PrismaClient } from '@tradinjournal/db';
import { dedupKey, reconcileEvents, type ReconciledEvent } from '../../lib/calendar/reconcile.js';
import type { EventImpact, NormalizedEvent } from '../../lib/calendar/types.js';

export interface StoredEvent {
  id: string;
  dedupKey: string;
  title: string;
  country: string;
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTime: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  actualAt: Date | null;
  sources: unknown;
  createdAt: Date;
}

/** The columns a repaired row is written with. */
export interface EventData {
  dedupKey: string;
  title: string;
  country: string;
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTime: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  actualAt: Date | null;
  sources: Prisma.InputJsonValue;
}

export interface RepairPlan {
  scanned: number;
  unchanged: number;
  /** Rows that held more than one release. */
  splitRows: number;
  /** Rows kept (same id) but rewritten: new key and/or values. */
  updates: Array<{ id: string; fromKey: string; data: EventData }>;
  /** Releases that had no row of their own. */
  creates: Array<{ fromId: string; data: EventData }>;
  /** Rows folded into another row that names the same release. */
  deletes: Array<{ id: string; intoId: string }>;
  /** Human-readable examples (titles and values only). */
  examples: string[];
}

const PROVIDER_FIELDS = ['source', 'country', 'currency', 'title', 'impact', 'category', 'actual', 'forecast', 'previous', 'unit'] as const;

/** The provider rows stored in a row's provenance; the row itself when there are none. */
function providerRows(row: StoredEvent): NormalizedEvent[] {
  const raw = (row.sources as { raw?: unknown } | null)?.raw;
  const out: NormalizedEvent[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as Array<Record<string, unknown>>) {
      const when = new Date(String(r?.eventTimeUtc ?? ''));
      if (typeof r?.source !== 'string' || typeof r.title !== 'string' || !r.title.trim() || typeof r.currency !== 'string' || Number.isNaN(when.getTime())) continue;
      const e: Record<string, unknown> = { eventTimeUtc: when };
      for (const f of PROVIDER_FIELDS) if (typeof r[f] === 'string' && r[f] !== '') e[f] = r[f];
      e.impact = r.impact === 'HIGH' || r.impact === 'MEDIUM' || r.impact === 'LOW' ? r.impact : row.impact;
      e.country = e.country ?? row.country;
      out.push(e as unknown as NormalizedEvent);
    }
  }
  if (out.length > 0) return out;
  // No usable provenance: the stored row is the only evidence.
  const winners = (row.sources as { winners?: Record<string, string> } | null)?.winners;
  return [{
    source: winners?.title ?? 'stored',
    country: row.country,
    currency: row.currency,
    title: row.title,
    impact: row.impact,
    eventTimeUtc: row.eventTime,
    ...(row.category ? { category: row.category } : {}),
    ...(row.actual ? { actual: row.actual } : {}),
    ...(row.forecast ? { forecast: row.forecast } : {}),
    ...(row.previous ? { previous: row.previous } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
  }];
}

const sig = (r: NormalizedEvent) => `${r.source}|${r.country}|${r.currency}|${r.title}|${r.eventTimeUtc.toISOString()}`;
const rawSigs = (raw: Array<Partial<NormalizedEvent>>) =>
  raw.map(r => sig({ ...r, eventTimeUtc: new Date(r.eventTimeUtc as unknown as string) } as NormalizedEvent)).sort().join('\n');

const fmt = (e: { title: string; actual: string | null; forecast: string | null }) =>
  `"${e.title}" ${e.actual ?? '–'}/${e.forecast ?? '–'}`;

/**
 * Plan the repair. `watchCounts` (event id → number of watches) only steers which
 * row survives a merge. `priority` is the provider-priority list.
 */
export function planCalendarRepair(rows: StoredEvent[], watchCounts: Map<string, number>, priority: string[], maxExamples = 12): RepairPlan {
  const byId = new Map(rows.map(r => [r.id, r]));
  // Unique provider rows across the table, each remembering every row it came
  // from (an ingest under a new key can have copied a provider row already held
  // by an old merged row). The most recently stored copy wins.
  const unique = new Map<string, { row: NormalizedEvent; origins: Set<string> }>();
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const stored of sorted) {
    for (const r of providerRows(stored)) {
      const k = sig(r);
      const u = unique.get(k);
      if (u) { u.row = r; u.origins.add(stored.id); } else unique.set(k, { row: r, origins: new Set([stored.id]) });
    }
  }

  const targets = reconcileEvents([...unique.values()].map(u => u.row), priority);
  if (new Set(targets.map(t => t.dedupKey)).size !== targets.length) throw new Error('reconciler produced duplicate keys; aborting');

  // Which stored rows fed each target. reconcile copies its input rows into
  // sources.raw, so map back through the provider-row signature.
  const originsOf = targets.map(t => {
    const s = new Set<string>();
    for (const r of t.sources.raw) for (const id of unique.get(sig({ ...r, eventTimeUtc: r.eventTimeUtc } as NormalizedEvent))?.origins ?? []) s.add(id);
    return s;
  });

  // Each stored row's home target: the release whose title it shows.
  const targetsOfRow = new Map<string, number[]>();
  originsOf.forEach((ids, ti) => ids.forEach(id => (targetsOfRow.get(id) ?? targetsOfRow.set(id, []).get(id)!).push(ti)));
  const homeOf = new Map<string, number>();
  for (const [id, tis] of targetsOfRow) {
    const row = byId.get(id)!;
    const ownKey = dedupKey({ currency: row.currency, country: row.country, title: row.title, eventTimeUtc: row.eventTime });
    const home =
      tis.find(ti => targets[ti]!.dedupKey === ownKey) ??
      tis.find(ti => targets[ti]!.sources.raw.some(r => r.title === row.title)) ??
      [...tis].sort((a, b) => targets[b]!.sources.raw.length - targets[a]!.sources.raw.length)[0]!;
    homeOf.set(id, home);
  }

  const plan: RepairPlan = { scanned: rows.length, unchanged: 0, splitRows: 0, updates: [], creates: [], deletes: [], examples: [] };
  plan.splitRows = [...targetsOfRow.values()].filter(t => t.length > 1).length;
  const splitExamples = new Map<string, string[]>();
  const mergeExamples: string[] = [];

  targets.forEach((t, ti) => {
    const homeRows = [...originsOf[ti]!].filter(id => homeOf.get(id) === ti).map(id => byId.get(id)!);
    const survivor = homeRows.sort((a, b) =>
      Number((watchCounts.get(b.id) ?? 0) > 0) - Number((watchCounts.get(a.id) ?? 0) > 0) ||
      Number(b.dedupKey === t.dedupKey) - Number(a.dedupKey === t.dedupKey) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
    )[0];
    // The moment the actual was first seen: from the row(s) this release came from.
    const fromRows = [...originsOf[ti]!].map(id => byId.get(id)!);
    const seen = (survivor?.actual ? survivor.actualAt : null) ??
      fromRows.map(r => r.actualAt).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const data = toData(t, t.actual ? seen : null);

    if (!survivor) {
      const from = fromRows[0]!;
      plan.creates.push({ fromId: from.id, data });
      (splitExamples.get(from.id) ?? splitExamples.set(from.id, []).get(from.id)!).push(`new ${t.country !== from.country ? `${t.country} ` : ''}${fmt(t)}`);
      return;
    }
    for (const loser of homeRows.slice(1)) plan.deletes.push({ id: loser.id, intoId: survivor.id });
    if (homeRows.length > 1) {
      mergeExamples.push(`merge ${t.currency} ${t.eventTimeUtc.toISOString().slice(0, 16)} ${homeRows.map(r => fmt(r)).join(' + ')} → one row ${fmt(t)}`);
    }
    const same =
      survivor.dedupKey === data.dedupKey && survivor.title === data.title && survivor.country === data.country &&
      survivor.currency === data.currency && survivor.category === data.category && survivor.impact === data.impact &&
      survivor.eventTime.getTime() === data.eventTime.getTime() && survivor.actual === data.actual &&
      survivor.forecast === data.forecast && survivor.previous === data.previous && survivor.unit === data.unit &&
      rawSigs(((survivor.sources as { raw?: Array<Partial<NormalizedEvent>> } | null)?.raw) ?? []) === rawSigs(t.sources.raw);
    if (same) { plan.unchanged += 1; return; }
    plan.updates.push({ id: survivor.id, fromKey: survivor.dedupKey, data });
    if ((targetsOfRow.get(survivor.id)?.length ?? 0) > 1) {
      (splitExamples.get(survivor.id) ?? splitExamples.set(survivor.id, []).get(survivor.id)!).unshift(`keeps id ${fmt(t)}`);
    }
  });

  // Splits first (the wrong-number rows), then merges.
  const splits: string[] = [];
  for (const [id, parts] of splitExamples) {
    const row = byId.get(id)!;
    if ((targetsOfRow.get(id)?.length ?? 0) < 2) continue;
    splits.push(`split ${row.currency}/${row.country} ${row.eventTime.toISOString().slice(0, 16)} ${fmt(row)} → ${parts.join(' + ')}`);
  }
  const nSplits = Math.min(splits.length, Math.max(maxExamples - Math.min(mergeExamples.length, 4), 0));
  plan.examples = [...splits.slice(0, nSplits), ...mergeExamples.slice(0, maxExamples - nSplits)];
  return plan;
}

function toData(t: ReconciledEvent, actualAt: Date | null): EventData {
  return {
    dedupKey: t.dedupKey,
    title: t.title,
    country: t.country,
    currency: t.currency,
    category: t.category,
    impact: t.impact,
    eventTime: t.eventTimeUtc,
    actual: t.actual,
    forecast: t.forecast,
    previous: t.previous,
    unit: t.unit,
    actualAt,
    sources: JSON.parse(JSON.stringify(t.sources)) as Prisma.InputJsonValue,
  };
}

/**
 * Load rows (optionally only events in [from, to) — keys are per hour, so a
 * window of whole days is self-contained) and plan their repair.
 */
export async function loadCalendarRepair(prisma: PrismaClient, priority: string[], window: { from?: Date; to?: Date } = {}): Promise<RepairPlan> {
  const rows = await prisma.economicEvent.findMany({
    where: window.from || window.to ? { eventTime: { ...(window.from ? { gte: window.from } : {}), ...(window.to ? { lt: window.to } : {}) } } : {},
    select: {
      id: true, dedupKey: true, title: true, country: true, currency: true, category: true, impact: true,
      eventTime: true, actual: true, forecast: true, previous: true, unit: true, actualAt: true, sources: true, createdAt: true,
    },
  });
  const watches = await prisma.eventWatch.groupBy({ by: ['eventId'], where: { eventId: { in: rows.map(r => r.id) } }, _count: { _all: true } });
  return planCalendarRepair(rows, new Map(watches.map(w => [w.eventId, w._count._all])), priority);
}

export interface RepairResult { updated: number; created: number; deleted: number; watchesMoved: number; notificationsMoved: number; ledgerMoved: number }

/** Write a plan in one transaction. Re-running after success is a no-op plan. */
export async function applyCalendarRepair(prisma: PrismaClient, plan: RepairPlan): Promise<RepairResult> {
  const res: RepairResult = { updated: 0, created: 0, deleted: 0, watchesMoved: 0, notificationsMoved: 0, ledgerMoved: 0 };
  await prisma.$transaction(async (tx) => {
    // 1. Re-point everything that references a row about to be folded away.
    for (const d of plan.deletes) {
      const watches = await tx.eventWatch.findMany({ where: { eventId: d.id }, select: { id: true, userId: true } });
      if (watches.length) {
        const already = new Set((await tx.eventWatch.findMany({ where: { eventId: d.intoId, userId: { in: watches.map(w => w.userId) } }, select: { userId: true } })).map(w => w.userId));
        const move = watches.filter(w => !already.has(w.userId)).map(w => w.id);
        if (move.length) res.watchesMoved += (await tx.eventWatch.updateMany({ where: { id: { in: move } }, data: { eventId: d.intoId } })).count;
      }
      res.notificationsMoved += (await tx.notification.updateMany({ where: { eventId: d.id }, data: { eventId: d.intoId } })).count;
      // Reminder ledger: "reminder:<eventId>:<userId>" — move so nobody is reminded twice.
      const ledger = await tx.notificationDelivery.findMany({ where: { dedupKey: { startsWith: `reminder:${d.id}:` } }, select: { id: true, dedupKey: true, channel: true } });
      for (const l of ledger) {
        const moved = l.dedupKey.replace(`reminder:${d.id}:`, `reminder:${d.intoId}:`);
        const clash = await tx.notificationDelivery.findUnique({ where: { dedupKey_channel: { dedupKey: moved, channel: l.channel } }, select: { id: true } });
        if (!clash) { await tx.notificationDelivery.update({ where: { id: l.id }, data: { dedupKey: moved } }); res.ledgerMoved += 1; }
      }
    }
    // 2. Fold away (remaining watches cascade — they were duplicates of a moved one).
    if (plan.deletes.length) res.deleted = (await tx.economicEvent.deleteMany({ where: { id: { in: plan.deletes.map(d => d.id) } } })).count;
    // 3. Park re-keyed rows on a unique temporary key so keys can swap freely,
    //    then rewrite every row. Bulk statements: run from far away, thousands
    //    of single-row updates would outlast the transaction.
    const rekeyed = plan.updates.filter(u => u.fromKey !== u.data.dedupKey).map(u => u.id);
    for (const ids of chunks(rekeyed, 1000)) {
      await tx.$executeRaw`UPDATE "economic_event" SET "dedupKey" = 'repair:' || "id" WHERE "id" = ANY(${ids}::text[])`;
    }
    for (const part of chunks(plan.updates, 300)) {
      const rows = part.map(u => ({
        id: u.id,
        dedupKey: u.data.dedupKey, title: u.data.title, country: u.data.country, currency: u.data.currency,
        category: u.data.category, impact: u.data.impact,
        // Columns are timestamp without time zone holding UTC.
        eventTime: u.data.eventTime.toISOString().replace('Z', ''),
        actualAt: u.data.actualAt ? u.data.actualAt.toISOString().replace('Z', '') : null,
        actual: u.data.actual, forecast: u.data.forecast, previous: u.data.previous, unit: u.data.unit,
        sources: u.data.sources,
      }));
      res.updated += await tx.$executeRaw`
        UPDATE "economic_event" AS e SET
          "dedupKey" = v."dedupKey", "title" = v."title", "country" = v."country", "currency" = v."currency",
          "category" = v."category", "impact" = v."impact"::"EventImpact", "eventTime" = v."eventTime",
          "actual" = v."actual", "forecast" = v."forecast", "previous" = v."previous", "unit" = v."unit",
          "actualAt" = v."actualAt", "sources" = v."sources", "updatedAt" = now()
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(
          "id" text, "dedupKey" text, "title" text, "country" text, "currency" text, "category" text, "impact" text,
          "eventTime" timestamp(3), "actualAt" timestamp(3), "actual" text, "forecast" text, "previous" text,
          "unit" text, "sources" jsonb)
        WHERE e."id" = v."id"`;
    }
    // 4. The releases that were hidden inside merged rows.
    if (plan.creates.length) res.created = (await tx.economicEvent.createMany({ data: plan.creates.map(c => c.data), skipDuplicates: true })).count;
  }, { timeout: 900_000, maxWait: 30_000 });
  return res;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
