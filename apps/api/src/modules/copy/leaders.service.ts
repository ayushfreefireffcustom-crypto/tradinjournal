// Copy-trading leaders: the public leaderboard, leader pages, and a user's own
// leader application. Stats come from what the engine writes (LeaderStat,
// LeaderEquityPoint); nothing here invents numbers. A leader that is not
// VERIFIED and listed is visible only to its owner and its existing followers.
import { env } from '@tradinjournal/config';
import { Prisma, prisma, type CopyLeader, type ExchangeConnection, type LeaderStat } from '@tradinjournal/db';
import type {
  ApplyLeaderInput,
  CursorQuery,
  EquityPointDto,
  LeaderCardDto,
  LeaderDetailDto,
  LeaderOpenPositionDto,
  LeaderRange,
  LeaderStatsDto,
  LeaderTradeDto,
  LeadersQuery,
  MyLeaderDto,
  Page,
  RiskGrade,
  UpdateLeaderInput,
} from '@tradinjournal/contracts';
import { requireEncryptionKey } from '@tradinjournal/secrets';
import { logger } from '@tradinjournal/logger';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { logAdminAction } from '../admin/admin-audit.service.js';
import { adapterFor } from '../exchanges/exchanges.adapters.js';
import { credsOf, type ExchangeDeps } from '../exchanges/exchanges.service.js';

export type LeaderDeps = Pick<ExchangeDeps, 'adapterFor' | 'key'>;
const defaultDeps: LeaderDeps = { adapterFor, key: () => requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY) };

/** Leader positions read from the exchange, cached briefly so page views don't hammer it. */
const POSITIONS_TTL_MS = 30_000;
const positionsCache = new Map<string, { at: number; rows: Array<{ symbol: string; size: number }> }>();

const DAY = 24 * 3600_000;
const RANGE_MS: Record<LeaderRange, number> = { '7d': 7 * DAY, '30d': 30 * DAY, all: 0 };
const SPARK_POINTS = 40;
/** Curve bucket per range (fixed list; interpolated into SQL as a literal). */
const BUCKET: Record<LeaderRange, string> = { '7d': '1 hour', '30d': '6 hours', all: '1 day' };
const LIVE_FOLLOW = { in: ['ACTIVE', 'PAUSED'] as Array<'ACTIVE' | 'PAUSED'> };

/**
 * Risk grade from the all-time max drawdown of the leader's equity curve:
 * A under 10 %, B under 20 %, C under 30 %, D under 45 %, E otherwise.
 * Needs 7 days of history; younger leaders show no grade.
 */
export function riskGrade(maxDrawdownPct: number, historyMs: number): RiskGrade | null {
  if (historyMs < 7 * DAY) return null;
  if (maxDrawdownPct < 10) return 'A';
  if (maxDrawdownPct < 20) return 'B';
  if (maxDrawdownPct < 30) return 'C';
  if (maxDrawdownPct < 45) return 'D';
  return 'E';
}

/**
 * Smallest balance that copies the leader's median entry at 1x as at least one
 * contract: leader equity / median entry size in contracts, rounded up to $10.
 */
export function recommendedMargin(leaderEquityUsd: number | null, entrySizes: number[]): number | null {
  if (!leaderEquityUsd || leaderEquityUsd <= 0 || !entrySizes.length) return null;
  const sorted = [...entrySizes].filter((n) => n > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.ceil(leaderEquityUsd / Math.max(1, median) / 10) * 10;
}

/** Last value per UTC day, oldest first. */
function dailyCloses(curve: Array<{ t: Date; v: number }>): number[] {
  const byDay = new Map<string, number>();
  for (const p of curve) byDay.set(p.t.toISOString().slice(0, 10), p.v);
  return [...byDay.values()];
}

/**
 * Annualised Sharpe from daily equity returns (risk-free rate 0, crypto trades
 * every day so √365). Needs 14 days; null before that or with no variation.
 */
export function sharpeRatio(curve: Array<{ t: Date; v: number }>): number | null {
  const closes = dailyCloses(curve);
  if (closes.length < 15) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1]! > 0) rets.push(closes[i]! / closes[i - 1]! - 1);
  if (rets.length < 14) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  return sd > 0 ? Math.round((mean / sd) * Math.sqrt(365) * 100) / 100 : null;
}

/** Share of whole weeks (Monday-based, UTC) in which equity rose. Needs 4 weeks. */
export function profitableWeeksPct(curve: Array<{ t: Date; v: number }>): number | null {
  const weeks = new Map<number, { first: number; last: number }>();
  for (const p of curve) {
    const d = new Date(p.t);
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const w = weeks.get(monday);
    if (w) w.last = p.v;
    else weeks.set(monday, { first: p.v, last: p.v });
  }
  // A week's change runs from the previous week's last value to this week's.
  const ordered = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w);
  const changes = ordered.slice(1).map((w, i) => w.last - ordered[i]!.last);
  if (changes.length < 4) return null;
  return Math.round((changes.filter((c) => c > 0).length / changes.length) * 1000) / 10;
}

/** Evenly thin a series to at most `n` points, keeping the last one. */
export function downsample<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = (xs.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => xs[Math.round(i * step)]!);
}

type LeaderRow = CopyLeader & { connection: Pick<ExchangeConnection, 'exchange' | 'environment'>; stats: LeaderStat[] };

interface LeaderExtras {
  followers: Map<string, number>;
  curves: Map<string, Array<{ t: Date; v: number }>>;
  entrySizes: Map<string, number[]>;
  firstPointAt: Map<string, Date>;
  following: Set<string>;
}

function statsFor(l: LeaderRow, range: LeaderRange, curve: Array<{ t: Date; v: number }>, nowMs: number): LeaderStatsDto {
  const s = l.stats.find((x) => x.window === range);
  const since = RANGE_MS[range] ? nowMs - RANGE_MS[range] : 0;
  const inRange = curve.filter((p) => p.t.getTime() >= since);
  // One sample (or none) can't show a return or a drawdown: unknown, not 0.
  const known = !!s && inRange.length >= 2;
  return {
    range,
    roiPct: known ? Number(s.roiPct) : null,
    pnlUsd: inRange.length >= 2 ? Math.round((inRange[inRange.length - 1]!.v - inRange[0]!.v) * 100) / 100 : null,
    maxDrawdownPct: known ? Number(s.maxDrawdownPct) : null,
    winRatePct: s?.winRatePct != null ? Number(s.winRatePct) : null,
    tradeCount: s?.tradeCount ?? 0,
    sharpe: sharpeRatio(inRange),
    profitableWeeksPct: profitableWeeksPct(inRange),
    top3ProfitSharePct: s?.top3ProfitSharePct != null ? Number(s.top3ProfitSharePct) : null,
    closedTradeCount: s?.closedTradeCount ?? null,
  };
}

function toCard(l: LeaderRow, range: LeaderRange, x: LeaderExtras, userId: string, nowMs: number): LeaderCardDto {
  const curve = x.curves.get(l.id) ?? [];
  const since = RANGE_MS[range] ? nowMs - RANGE_MS[range] : 0;
  const all = l.stats.find((s) => s.window === 'all');
  const first = x.firstPointAt.get(l.id);
  const equityUsd = curve.length ? curve[curve.length - 1]!.v : null;
  return {
    id: l.id,
    displayName: l.displayName,
    bio: l.bio,
    exchange: l.connection.exchange,
    environment: l.connection.environment,
    followers: x.followers.get(l.id) ?? 0,
    maxFollowers: l.maxFollowers,
    daysActive: Math.max(0, Math.floor((nowMs - l.createdAt.getTime()) / DAY)),
    equityUsd,
    stats: statsFor(l, range, curve, nowMs),
    riskGrade: riskGrade(all ? Number(all.maxDrawdownPct) : 0, first ? nowMs - first.getTime() : 0),
    recommendedMarginUsd: recommendedMargin(equityUsd, x.entrySizes.get(l.id) ?? []),
    sparkline: downsample(curve.filter((p) => p.t.getTime() >= since), SPARK_POINTS).map((p) => p.v),
    following: x.following.has(l.id),
    isMine: l.userId === userId,
  };
}

async function extras(leaderIds: string[], userId: string, curveSince: Date | null, bucket = '1 hour'): Promise<LeaderExtras> {
  if (!leaderIds.length) return { followers: new Map(), curves: new Map(), entrySizes: new Map(), firstPointAt: new Map(), following: new Set() };
  const [counts, points, entries, firsts, mine] = await Promise.all([
    prisma.copyFollow.groupBy({ by: ['leaderId'], where: { leaderId: { in: leaderIds }, status: LIVE_FOLLOW }, _count: { _all: true } }),
    // Buckets (last value in each) keep the curve small however often the engine samples.
    prisma.$queryRaw<Array<{ leaderId: string; t: Date; v: number }>>`
      -- t is the last sample's own time, not the bucket start, so range filters stay exact.
      -- Dates go in as UTC text cast to timestamp: a Date parameter would be shifted by the session time zone.
      SELECT "leaderId", max(ts) AS t, (array_agg("equityUsd" ORDER BY ts DESC))[1]::float AS v
      FROM leader_equity_point
      WHERE "leaderId" IN (${Prisma.join(leaderIds)}) ${curveSince ? Prisma.sql`AND ts >= ${curveSince.toISOString()}::timestamp` : Prisma.empty}
      GROUP BY "leaderId", date_bin(${Prisma.raw(`'${bucket}'::interval`)}, ts, TIMESTAMP '2000-01-01')
      ORDER BY 1, 2 ASC`,
    // Last 50 opening fills per leader, for the recommended margin.
    prisma.$queryRaw<Array<{ leaderId: string; qty: number }>>`
      SELECT "leaderId", qty::float AS qty FROM (
        SELECT "leaderId", qty, row_number() OVER (PARTITION BY "leaderId" ORDER BY "exchTs" DESC) AS rn
        FROM leader_fill WHERE "leaderId" IN (${Prisma.join(leaderIds)}) AND "reduceOnly" = false
      ) x WHERE rn <= 50`,
    prisma.leaderEquityPoint.groupBy({ by: ['leaderId'], where: { leaderId: { in: leaderIds } }, _min: { ts: true } }),
    prisma.copyFollow.findMany({ where: { userId, leaderId: { in: leaderIds }, status: LIVE_FOLLOW }, select: { leaderId: true } }),
  ]);
  const curves = new Map<string, Array<{ t: Date; v: number }>>();
  for (const p of points) {
    const arr = curves.get(p.leaderId) ?? [];
    arr.push({ t: p.t, v: p.v });
    curves.set(p.leaderId, arr);
  }
  const entrySizes = new Map<string, number[]>();
  for (const e of entries) entrySizes.set(e.leaderId, [...(entrySizes.get(e.leaderId) ?? []), e.qty]);
  return {
    followers: new Map(counts.map((c) => [c.leaderId, c._count._all])),
    curves,
    entrySizes,
    firstPointAt: new Map(firsts.filter((f) => f._min.ts).map((f) => [f.leaderId, f._min.ts!])),
    following: new Set(mine.map((m) => m.leaderId)),
  };
}

const leaderInclude = { connection: { select: { exchange: true, environment: true } }, stats: true } as const;

/** Compare with unknown (null) values always last, whichever the direction. */
export function byKnown(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return (a - b) * dir;
}

const SORTS: Record<LeadersQuery['sort'], (a: LeaderCardDto, b: LeaderCardDto) => number> = {
  roi: (a, b) => byKnown(a.stats.roiPct, b.stats.roiPct, -1),
  pnl: (a, b) => byKnown(a.stats.pnlUsd, b.stats.pnlUsd, -1),
  drawdown: (a, b) => byKnown(a.stats.maxDrawdownPct, b.stats.maxDrawdownPct, 1),
  followers: (a, b) => b.followers - a.followers,
  winrate: (a, b) => byKnown(a.stats.winRatePct, b.stats.winRatePct, -1),
  sharpe: (a, b) => byKnown(a.stats.sharpe, b.stats.sharpe, -1),
  newest: (a, b) => a.daysActive - b.daysActive,
};

export async function listLeaders(userId: string, q: LeadersQuery, now = new Date()): Promise<LeaderCardDto[]> {
  const rows = (await prisma.copyLeader.findMany({
    where: { status: 'VERIFIED', listed: true, ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' as const } } : {}) },
    include: leaderInclude,
    take: 500,
  })) as LeaderRow[];
  const since = RANGE_MS[q.range] ? new Date(now.getTime() - RANGE_MS[q.range]) : null;
  const x = await extras(rows.map((r) => r.id), userId, since, BUCKET[q.range]);
  const cards = rows.map((r) => toCard(r, q.range, x, userId, now.getTime()));
  return cards.sort((a, b) => SORTS[q.sort](a, b) || a.displayName.localeCompare(b.displayName));
}

/** Leaders a user may see: public ones, their own, and ones they copy. */
async function visibleLeader(userId: string, id: string): Promise<LeaderRow> {
  const l = (await prisma.copyLeader.findFirst({
    where: { id, OR: [{ status: 'VERIFIED', listed: true }, { userId }, { follows: { some: { userId, status: LIVE_FOLLOW } } }] },
    include: leaderInclude,
  })) as LeaderRow | null;
  if (!l) throw new NotFoundError('Leader not found');
  return l;
}

/**
 * What the leader holds now. The exchange is the truth (it includes positions
 * opened before we started watching); fills we recorded are the fallback when
 * the exchange can't be reached.
 */
async function livePositions(l: LeaderRow, deps: LeaderDeps, nowMs: number): Promise<LeaderOpenPositionDto[] | null> {
  const hit = positionsCache.get(l.id);
  let rows = hit && nowMs - hit.at < POSITIONS_TTL_MS ? hit.rows : null;
  if (!rows) {
    const conn = await prisma.exchangeConnection.findUnique({ where: { id: l.connectionId } });
    if (!conn || conn.status !== 'ACTIVE') return null;
    try {
      rows = (await deps.adapterFor(conn.exchange, conn.environment).getPositions(credsOf(conn, deps.key()))).map((p) => ({ symbol: p.symbol, size: p.size }));
      positionsCache.set(l.id, { at: nowMs, rows });
    } catch (err) {
      logger.debug('[copy] leader positions unavailable; using recorded fills', { leaderId: l.id, err: String(err) });
      return null;
    }
  }
  const fromFills = await openPositionsOf(l.id);
  return rows
    .filter((r) => r.size !== 0)
    .map((r) => ({
      symbol: r.symbol,
      side: r.size > 0 ? ('LONG' as const) : ('SHORT' as const),
      size: Math.abs(r.size),
      since: fromFills.find((f) => f.symbol === r.symbol)?.since ?? null,
    }));
}

export async function openPositionsOf(leaderId: string): Promise<LeaderOpenPositionDto[]> {
  const latest = await prisma.$queryRaw<Array<{ symbol: string; pos: number; at: Date }>>`
    SELECT DISTINCT ON (symbol) symbol, "positionAfter"::float AS pos, "exchTs" AS at
    FROM leader_fill WHERE "leaderId" = ${leaderId} AND "positionAfter" IS NOT NULL
    ORDER BY symbol, "exchTs" DESC`;
  const open = latest.filter((r) => r.pos !== 0);
  return Promise.all(
    open.map(async (r) => {
      // Opened at the first fill after the last time the leader was flat.
      const flat = await prisma.leaderFill.findFirst({ where: { leaderId, symbol: r.symbol, positionAfter: 0 }, orderBy: { exchTs: 'desc' }, select: { exchTs: true } });
      const first = await prisma.leaderFill.findFirst({
        where: { leaderId, symbol: r.symbol, ...(flat ? { exchTs: { gt: flat.exchTs } } : {}) },
        orderBy: { exchTs: 'asc' },
        select: { exchTs: true },
      });
      return { symbol: r.symbol, side: r.pos > 0 ? ('LONG' as const) : ('SHORT' as const), size: Math.abs(r.pos), since: (first?.exchTs ?? r.at).toISOString() };
    }),
  );
}

export async function getLeader(userId: string, id: string, range: LeaderRange = '30d', now = new Date(), deps: LeaderDeps = defaultDeps): Promise<LeaderDetailDto> {
  const l = await visibleLeader(userId, id);
  const x = await extras([l.id], userId, null);
  const card = toCard(l, range, x, userId, now.getTime());
  const curve = x.curves.get(l.id) ?? [];
  const [openPositions, last] = await Promise.all([
    livePositions(l, deps, now.getTime()).then((live) => live ?? openPositionsOf(l.id)),
    prisma.leaderFill.findFirst({ where: { leaderId: l.id }, orderBy: { exchTs: 'desc' }, select: { exchTs: true } }),
  ]);
  return {
    ...card,
    createdAt: l.createdAt.toISOString(),
    statsByRange: { '7d': statsFor(l, '7d', curve, now.getTime()), '30d': statsFor(l, '30d', curve, now.getTime()), all: statsFor(l, 'all', curve, now.getTime()) },
    openPositions,
    lastTradeAt: last?.exchTs.toISOString() ?? null,
  };
}

export async function leaderTrades(userId: string, id: string, q: CursorQuery): Promise<Page<LeaderTradeDto>> {
  const l = await visibleLeader(userId, id);
  const rows = await prisma.leaderFill.findMany({
    where: { leaderId: l.id },
    orderBy: [{ exchTs: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const more = rows.length > q.limit;
  const items = rows.slice(0, q.limit).map((f) => ({
    id: f.id,
    symbol: f.symbol,
    side: f.side,
    qty: Number(f.qty),
    price: Number(f.price),
    reduceOnly: f.reduceOnly,
    positionAfter: f.positionAfter != null ? Number(f.positionAfter) : null,
    at: f.exchTs.toISOString(),
  }));
  return { items, nextCursor: more ? items[items.length - 1]!.id : null };
}

export async function leaderEquity(userId: string, id: string, range: LeaderRange, now = new Date()): Promise<EquityPointDto[]> {
  const l = await visibleLeader(userId, id);
  const since = RANGE_MS[range] ? new Date(now.getTime() - RANGE_MS[range]) : null;
  const x = await extras([l.id], userId, since, range === '7d' ? '15 minutes' : BUCKET[range]);
  return downsample(x.curves.get(l.id) ?? [], 500).map((p) => ({ t: p.t.toISOString(), equityUsd: p.v }));
}

// ── The signed-in user's own leader profile ─────────────────────────────────

async function myLeaderDto(l: CopyLeader & { connection: Pick<ExchangeConnection, 'label'> }): Promise<MyLeaderDto> {
  const [counts, realized, open] = await Promise.all([
    prisma.copyFollow.groupBy({ by: ['status'], where: { leaderId: l.id, status: LIVE_FOLLOW }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ usd: number | null }>>`
      SELECT SUM(o."realizedPnl")::float AS usd FROM exchange_order o JOIN copy_follow f ON f.id = o."followId"
      WHERE f."leaderId" = ${l.id} AND o."filledAt" >= f."startedAt"`,
    prisma.exchangePosition.aggregate({ where: { follow: { leaderId: l.id }, closedAt: null, qty: { gt: 0 } }, _sum: { unrealizedPnl: true }, _count: { _all: true } }),
  ]);
  const by = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return {
    id: l.id,
    displayName: l.displayName,
    bio: l.bio,
    status: l.status,
    listed: l.listed,
    connectionId: l.connectionId,
    connectionLabel: l.connection.label,
    followers: by('ACTIVE') + by('PAUSED'),
    pausedFollowers: by('PAUSED'),
    openCopiedPositions: open._count._all,
    followersPnlUsd: Math.round(((realized[0]?.usd ?? 0) + Number(open._sum.unrealizedPnl ?? 0)) * 100) / 100,
    createdAt: l.createdAt.toISOString(),
  };
}

export async function getMyLeader(userId: string): Promise<MyLeaderDto | null> {
  const l = await prisma.copyLeader.findFirst({ where: { userId }, include: { connection: { select: { label: true } } }, orderBy: { createdAt: 'desc' } });
  return l ? myLeaderDto(l) : null;
}

export async function applyAsLeader(actor: { id: string; email: string }, input: ApplyLeaderInput): Promise<MyLeaderDto> {
  const existing = await prisma.copyLeader.findFirst({ where: { userId: actor.id }, select: { status: true } });
  if (existing) {
    throw new ConflictError(existing.status === 'DELISTED' ? 'Your leader profile was removed. Contact support to apply again.' : 'You already have a leader profile.');
  }
  const c = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId: actor.id, status: { not: 'REVOKED' } } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('Reconnect this exchange account first: the exchange rejected its key.');
  const copying = await prisma.copyFollow.count({ where: { connectionId: c.id, status: LIVE_FOLLOW } });
  if (copying) throw new ConflictError('This account is copying another leader. Use an account you trade yourself.');

  let leader;
  try {
    leader = await prisma.copyLeader.create({
      data: { userId: actor.id, connectionId: c.id, displayName: input.displayName, bio: input.bio, status: 'PENDING' },
      include: { connection: { select: { label: true } } },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new ConflictError('This exchange account already belongs to a leader profile.');
    throw err;
  }
  await notifyAdmins('copy.leader_applied', 'New copy-trading leader application', `${input.displayName} applied to become a leader.`, '/admin/leaders');
  await logAdminAction({ action: 'copy.leader_apply', actorId: actor.id, actorEmail: actor.email, targetType: 'copy_leader', targetId: leader.id }).catch(() => undefined);
  return myLeaderDto(leader);
}

export async function updateMyLeader(userId: string, input: UpdateLeaderInput): Promise<MyLeaderDto> {
  const l = await prisma.copyLeader.findFirst({ where: { userId, status: { not: 'DELISTED' } } });
  if (!l) throw new NotFoundError('You have no leader profile');
  const updated = await prisma.copyLeader.update({ where: { id: l.id }, data: input, include: { connection: { select: { label: true } } } });
  return myLeaderDto(updated);
}

async function notifyAdmins(kind: string, title: string, body: string, href: string): Promise<void> {
  const emails = env.ADMIN_EMAILS_LIST;
  if (!emails.length) return;
  const admins = await prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { id: true } });
  if (!admins.length) return;
  await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, kind, title, body, href })) }).catch(() => undefined);
}
