// Admin trade counts from the deals table (execution).
// The old `trade` table is no longer written; trades are rebuilt from deals,
// one trade per (broker account, MT5 position). These queries mirror that rule
// (packages/core reconstruct.ts) in SQL so the admin pages stay cheap:
//   - a trade exists when its position has an opening deal (IN or INOUT)
//   - it is open while opened volume > closed volume (INOUT counts both ways)
//   - it closed in a window when any closing deal (OUT, INOUT, OUT_BY) falls in it
import { prisma, Prisma } from '@tradinjournal/db';

export interface PositionCounts {
  total: number;
  open: number;
  closed7d: number;
  closed30d: number;
}

/** Trade counts per broker account. Pass brokerIds to limit the scan. */
export async function positionCountsByBroker(
  d7: Date,
  d30: Date,
  brokerIds?: string[],
): Promise<Map<string, PositionCounts>> {
  if (brokerIds && brokerIds.length === 0) return new Map();
  const scope = brokerIds
    ? Prisma.sql`AND e."brokerAccountId" IN (${Prisma.join(brokerIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { brokerAccountId: string; total: number; open: number; closed7d: number; closed30d: number }[]
  >`
    SELECT p."brokerAccountId",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE p.net > 0)::int AS open,
           COUNT(*) FILTER (WHERE p.last_close >= ${d7})::int AS closed7d,
           COUNT(*) FILTER (WHERE p.last_close >= ${d30})::int AS closed30d
    FROM (
      SELECT e."brokerAccountId",
             e."positionId",
             bool_or(e.entry IN ('IN', 'INOUT')) AS has_open,
             SUM(CASE WHEN e.entry = 'IN' THEN e.volume
                      WHEN e.entry IN ('OUT', 'OUT_BY') THEN -e.volume
                      ELSE 0 END) AS net,
             MAX(e."dealTime") FILTER (WHERE e.entry IN ('OUT', 'INOUT', 'OUT_BY')) AS last_close
      FROM "execution" e
      WHERE e.type IN ('BUY', 'SELL') ${scope}
      GROUP BY e."brokerAccountId", e."positionId"
    ) p
    WHERE p.has_open
    GROUP BY p."brokerAccountId"`;
  return new Map(
    rows.map(r => [
      r.brokerAccountId,
      { total: r.total, open: r.open, closed7d: r.closed7d, closed30d: r.closed30d },
    ]),
  );
}

export function sumCounts(counts: Iterable<PositionCounts>): PositionCounts {
  const out: PositionCounts = { total: 0, open: 0, closed7d: 0, closed30d: 0 };
  for (const c of counts) {
    out.total += c.total;
    out.open += c.open;
    out.closed7d += c.closed7d;
    out.closed30d += c.closed30d;
  }
  return out;
}

/**
 * Active = users with a trading deal since `activeSince`.
 * Inactive = users with a broker account but no trading deal since `inactiveSince`.
 * Pass userIds to limit the count (tests).
 */
export async function traderActivity(
  activeSince: Date,
  inactiveSince: Date,
  userIds?: string[],
): Promise<{ active: number; inactive: number }> {
  if (userIds && userIds.length === 0) return { active: 0, inactive: 0 };
  const scope = userIds ? Prisma.sql`AND b."userId" IN (${Prisma.join(userIds)})` : Prisma.empty;
  const [row] = await prisma.$queryRaw<{ active: number; inactive: number }[]>`
    WITH last_deal AS (
      SELECT b."userId", MAX(e."dealTime") AS at
      FROM "broker_account" b
      LEFT JOIN "execution" e
        ON e."brokerAccountId" = b.id AND e.type IN ('BUY', 'SELL') AND e."dealTime" >= ${inactiveSince}
      WHERE TRUE ${scope}
      GROUP BY b."userId"
    )
    SELECT COUNT(*) FILTER (WHERE at >= ${activeSince})::int AS active,
           COUNT(*) FILTER (WHERE at IS NULL)::int AS inactive
    FROM last_deal`;
  return { active: row?.active ?? 0, inactive: row?.inactive ?? 0 };
}
