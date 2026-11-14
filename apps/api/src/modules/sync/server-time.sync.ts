// Brings an account's stored deal times in line with its server clock model.
//
// Each execution row records the offset that was subtracted when it was stored
// (serverOffsetMin; null = still the raw server wall clock), so the raw value is
// always recoverable: wall = dealTime + serverOffsetMin. That makes conversion
// idempotent and lets a corrected model (e.g. a DST rule that turned out wrong)
// re-convert rows instead of shifting them twice.
import { prisma, Prisma } from '@tradinjournal/db';
import { serverWallOffset, type ServerTz } from '../../lib/server-time.js';

const MIN_MS = 60_000;
const UPDATE_CHUNK = 5000;

export interface StoredTime { id: string; dealTime: Date; serverOffsetMin: number | null }

/** One UPDATE: rows that currently carry `from` and should carry `to`. */
export interface ShiftGroup { from: number | null; to: number; ids: string[] }

/** Which rows need which shift. Pure; used by sync and by the backfill dry run. */
export function planNormalization(rows: StoredTime[], tz: ServerTz): ShiftGroup[] {
  const groups = new Map<string, ShiftGroup>();
  for (const r of rows) {
    const wall = r.dealTime.getTime() + (r.serverOffsetMin ?? 0) * MIN_MS;
    const to = serverWallOffset(tz, wall);
    if (r.serverOffsetMin === to) continue;
    const key = `${r.serverOffsetMin}:${to}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { from: r.serverOffsetMin, to, ids: [] }));
    g.ids.push(r.id);
  }
  return [...groups.values()];
}

/**
 * Convert an account's stored deal times to UTC under `tz`. Only rows still in
 * raw server time are read unless `all` (after the model changed). Every update
 * is guarded on the row's current offset, so a re-run or a race can never shift
 * a row twice. Caller holds the account's sync lease. Returns rows changed.
 */
export async function normalizeExecutionTimes(accountId: string, tz: ServerTz, opts: { all?: boolean } = {}): Promise<number> {
  const rows = await prisma.execution.findMany({
    where: { brokerAccountId: accountId, ...(opts.all ? {} : { serverOffsetMin: null }) },
    select: { id: true, dealTime: true, serverOffsetMin: true },
  });
  const groups = planNormalization(rows, tz);
  if (!groups.length) return 0;
  return prisma.$transaction(async tx => {
    let changed = 0;
    for (const g of groups) {
      const deltaMin = (g.from ?? 0) - g.to; // new dealTime = wall − to = dealTime + from − to
      for (let i = 0; i < g.ids.length; i += UPDATE_CHUNK) {
        const ids = g.ids.slice(i, i + UPDATE_CHUNK);
        changed += await tx.$executeRaw(Prisma.sql`
          UPDATE "execution"
             SET "dealTime" = "dealTime" + (${deltaMin}::int * interval '1 minute'),
                 "serverOffsetMin" = ${g.to}::int
           WHERE "brokerAccountId" = ${accountId}
             AND "id" = ANY(${ids}::text[])
             AND "serverOffsetMin" IS NOT DISTINCT FROM ${g.from}::int`);
      }
    }
    return changed;
  }, { timeout: 60_000 });
}
