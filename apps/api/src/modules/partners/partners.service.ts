// Partner programme — data access + read models shared by the partner portal and
// the admin pages. Tracking only: no commissions, wallets or payouts.
import { prisma, Prisma } from '@tradinjournal/db';
import type {
  PartnerProfileDto, PartnerFunnelDto, PartnerDailyPointDto, PartnerChannelDto, PartnerCodeDto,
  PartnerClientDto, PartnerClientCountsDto, PartnerEventDto, PartnerClickDto, PartnerOverviewDto,
  PartnerLinksDto, PartnerRange, PartnerClientsQuery, ReferralStatusDto, PartnerApplyInput,
} from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import {
  dayKeys, isBuiltinReserved, normalizeCode, primaryCodeCandidates, rangeStart, referralStatus, referralUrl, slugify,
} from './partner.logic.js';

const DAY_MS = 86_400_000;
export const DEFAULT_CHANNEL_LABEL = 'Direct link';

export type PartnerWithUser = Prisma.PartnerGetPayload<{ include: { user: { select: { id: true; name: true; email: true } }; codes: true } }>;
const partnerInclude = { user: { select: { id: true, name: true, email: true } }, codes: { orderBy: { createdAt: 'asc' } } } as const;

export const activeRule = () => ({ minTrades: env.ACCESS_MIN_TRADES_7D, windowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS });
const appUrl = () => env.APP_URL;

// ── Lookups ───────────────────────────────────────────────────────────────────

export async function findPartnerByUser(userId: string): Promise<PartnerWithUser | null> {
  return prisma.partner.findUnique({ where: { userId }, include: partnerInclude });
}

export async function getPartnerById(id: string): Promise<PartnerWithUser> {
  const p = await prisma.partner.findUnique({ where: { id }, include: partnerInclude });
  if (!p) throw new NotFoundError('Partner not found');
  return p;
}

/** Portal gate: the caller must hold an ACTIVE partner record. */
export async function requireActivePartner(userId: string): Promise<PartnerWithUser> {
  const p = await findPartnerByUser(userId);
  if (!p) throw new AppError(403, 'NOT_A_PARTNER', 'You are not a TRADElogs partner.');
  if (p.status === 'PENDING') throw new AppError(403, 'PARTNER_PENDING', 'Your partner application is waiting for approval.');
  if (p.status === 'SUSPENDED') throw new AppError(403, 'PARTNER_SUSPENDED', 'Your partner account is suspended. Contact support.');
  if (p.status === 'REVOKED') throw new AppError(403, 'PARTNER_REVOKED', 'Your partner access has ended.');
  return p;
}

export function primaryCode(p: { codes: { code: string; isPrimary: boolean }[] }): string | null {
  return p.codes.find(c => c.isPrimary)?.code ?? p.codes[0]?.code ?? null;
}

export function toProfile(p: PartnerWithUser): PartnerProfileDto {
  return {
    id: p.id, name: p.user.name, status: p.status, code: primaryCode(p) ?? '',
    since: (p.approvedAt ?? p.createdAt).toISOString(), activeRule: activeRule(), cookieDays: env.PARTNER_COOKIE_DAYS,
  };
}

// ── Codes ─────────────────────────────────────────────────────────────────────

/** Why a code can't be taken, or null when it's free. */
export async function codeUnavailableReason(code: string, db: Prisma.TransactionClient = prisma): Promise<string | null> {
  if (isBuiltinReserved(code)) return 'That code is reserved.';
  if (await db.reservedPartnerCode.findUnique({ where: { code } })) return 'That code is reserved.';
  if (await db.partnerCode.findUnique({ where: { code } })) return 'That code is already taken.';
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Creates a partner with a primary code (the requested one if free, else generated
 * from their name) and the default "Direct link" channel, in one transaction.
 */
export async function createPartnerRecord(input: {
  userId: string; name: string; status: 'PENDING' | 'ACTIVE'; audience?: string | null; requestedCode?: string | null;
}): Promise<PartnerWithUser> {
  const requested = input.requestedCode ? normalizeCode(input.requestedCode) : null;
  if (input.requestedCode && !requested) throw new ValidationError('Codes are 3–20 letters, numbers, hyphens or underscores.');
  if (requested) {
    const why = await codeUnavailableReason(requested);
    if (why) throw new ConflictError(why);
  }
  const candidates = requested ? [requested] : primaryCodeCandidates(input.name);
  for (const code of candidates) {
    if (!requested && await codeUnavailableReason(code)) continue;
    try {
      const p = await prisma.$transaction(async tx => {
        const partner = await tx.partner.create({
          data: {
            userId: input.userId, status: input.status, audience: input.audience ?? null,
            approvedAt: input.status === 'ACTIVE' ? new Date() : null,
          },
        });
        await tx.partnerCode.create({ data: { partnerId: partner.id, code, isPrimary: true } });
        await tx.partnerChannel.create({ data: { partnerId: partner.id, label: DEFAULT_CHANNEL_LABEL, slug: '' } });
        return partner;
      });
      return getPartnerById(p.id);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const target = String((err as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
      if (target.includes('userId')) throw new ConflictError('This user is already a partner.');
      if (requested) throw new ConflictError('That code is already taken.');
      // generated code raced with someone else — try the next candidate
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Could not generate a partner code. Try again.');
}

/** Self-service application. Re-applying after a decline/revoke reopens the same record. */
export async function applyAsPartner(userId: string, name: string, input: PartnerApplyInput): Promise<PartnerProfileDto> {
  if (!env.PARTNER_SELF_SIGNUP) throw new AppError(403, 'PARTNER_SIGNUP_CLOSED', 'Partner applications are closed right now.');
  const existing = await findPartnerByUser(userId);
  if (existing) {
    if (existing.status === 'ACTIVE') throw new ConflictError('You are already a partner.');
    if (existing.status === 'PENDING') throw new ConflictError('Your application is already waiting for review.');
    if (existing.status === 'SUSPENDED') throw new ConflictError('Your partner account is suspended. Contact support.');
    await prisma.partner.update({ where: { id: existing.id }, data: { status: 'PENDING', audience: input.audience, revokedAt: null } });
    return toProfile(await getPartnerById(existing.id));
  }
  return toProfile(await createPartnerRecord({ userId, name, status: 'PENDING', audience: input.audience, requestedCode: input.code ?? null }));
}

export async function reserveCode(p: PartnerWithUser, code: string): Promise<PartnerCodeDto> {
  if (p.codes.length >= env.PARTNER_MAX_CODES) throw new ConflictError(`You can hold up to ${env.PARTNER_MAX_CODES} codes. Release one first.`);
  const why = await codeUnavailableReason(code);
  if (why) throw new ConflictError(why);
  try {
    const c = await prisma.partnerCode.create({ data: { partnerId: p.id, code } });
    return { id: c.id, code: c.code, isPrimary: false, url: referralUrl(appUrl(), c.code), clicks: 0, signups: 0, createdAt: c.createdAt.toISOString() };
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('That code is already taken.');
    throw err;
  }
}

export async function releaseCode(partnerId: string, codeId: string): Promise<{ code: string }> {
  const c = await prisma.partnerCode.findFirst({ where: { id: codeId, partnerId } });
  if (!c) throw new NotFoundError('Code not found');
  if (c.isPrimary) throw new ConflictError('Your primary code can’t be released.');
  await prisma.partnerCode.delete({ where: { id: c.id } });
  return { code: c.code };
}

// ── Channels ──────────────────────────────────────────────────────────────────

export async function createChannel(p: PartnerWithUser, label: string): Promise<PartnerChannelDto> {
  const dup = await prisma.partnerChannel.findFirst({ where: { partnerId: p.id, archivedAt: null, label: { equals: label, mode: 'insensitive' } } });
  if (dup) throw new ConflictError(`You already have a link called “${dup.label}”. Pick another name.`);
  const live = await prisma.partnerChannel.count({ where: { partnerId: p.id, archivedAt: null, NOT: { slug: '' } } });
  if (live >= env.PARTNER_MAX_CHANNELS) throw new ConflictError(`You can have up to ${env.PARTNER_MAX_CHANNELS} channel links. Archive one first.`);
  const base = slugify(label);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 28)}-${i + 1}`;
    const clash = await prisma.partnerChannel.findUnique({ where: { partnerId_slug: { partnerId: p.id, slug } } });
    if (clash && !clash.archivedAt) continue;
    try {
      const ch = clash
        ? await prisma.partnerChannel.update({ where: { id: clash.id }, data: { label, archivedAt: null } })
        : await prisma.partnerChannel.create({ data: { partnerId: p.id, label, slug } });
      return {
        id: ch.id, label: ch.label, slug: ch.slug, url: referralUrl(appUrl(), primaryCode(p) ?? '', ch.slug),
        clicks: 0, converted: 0, signups: 0, connected: 0, active: 0, createdAt: ch.createdAt.toISOString(),
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new ConflictError('Could not create a unique link for that name.');
}

export async function archiveChannel(partnerId: string, channelId: string): Promise<void> {
  const ch = await prisma.partnerChannel.findFirst({ where: { id: channelId, partnerId, archivedAt: null } });
  if (!ch) throw new NotFoundError('Channel not found');
  if (ch.slug === '') throw new ConflictError('The default link can’t be archived.');
  await prisma.partnerChannel.update({ where: { id: ch.id }, data: { archivedAt: new Date() } });
}

// ── Connection sync (cheap, no MT5 bridge) ────────────────────────────────────

/** Stamps connectedAt from the client's first broker account. One UPDATE. */
export async function syncConnected(partnerId?: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "referral" r SET "connectedAt" = b.first
    FROM (SELECT "userId", MIN("createdAt") AS first FROM "broker_account" GROUP BY "userId") b
    WHERE r."userId" = b."userId" AND r."connectedAt" IS NULL
    ${partnerId ? Prisma.sql`AND r."partnerId" = ${partnerId}` : Prisma.empty}`;
}

// ── Conversions ───────────────────────────────────────────────────────────────
// A click counts as converted only while the person it brought in is still this
// partner's client — after an admin moves or unlinks clients, the old partner's
// click → signup % must not claim them (it read "0 signups · 86% convert").
async function convertedBy(partnerIds: string[], key: 'channelId' | 'partnerId', from?: Date | null): Promise<Map<string | null, number>> {
  if (!partnerIds.length) return new Map();
  const col = key === 'channelId' ? Prisma.sql`k."channelId"` : Prisma.sql`k."partnerId"`;
  const rows = await prisma.$queryRaw<{ k: string | null; n: number }[]>`
    SELECT ${col} AS k, COUNT(*)::int AS n
    FROM "referral_click" k
    JOIN "referral" r ON r."userId" = k."convertedUserId" AND r."partnerId" = k."partnerId"
    WHERE k."partnerId" IN (${Prisma.join(partnerIds)}) ${from ? Prisma.sql`AND k."createdAt" >= ${from}` : Prisma.empty}
    GROUP BY 1`;
  return new Map(rows.map(r => [r.k, r.n]));
}

// ── Read models ───────────────────────────────────────────────────────────────

type ReferralRow = Prisma.ReferralGetPayload<{ include: { user: { select: { name: true; city: true; country: true } }; channel: { select: { label: true } } } }>;
const referralInclude = { user: { select: { name: true, city: true, country: true } }, channel: { select: { label: true } } } as const;

export function toClient(r: ReferralRow): PartnerClientDto {
  return {
    id: r.id, name: r.user.name, city: r.user.city, country: r.user.country,
    channel: r.channel?.label ?? DEFAULT_CHANNEL_LABEL,
    via: r.source === 'LINK' ? 'link' : r.source === 'CODE' ? 'code' : 'admin',
    signedUpAt: r.attributedAt.toISOString(), connectedAt: r.connectedAt?.toISOString() ?? null,
    status: referralStatus(r), trades30d: r.connectedAt ? r.trades30d : 0, lots30d: r.connectedAt ? r.lots30d : 0,
    lastActiveAt: r.lastTradeAt?.toISOString() ?? r.connectedAt?.toISOString() ?? null,
  };
}

export function statusWhere(s: ReferralStatusDto): Prisma.ReferralWhereInput {
  switch (s) {
    case 'SIGNED_UP': return { connectedAt: null };
    case 'CONNECTED': return { connectedAt: { not: null }, isActive: false, firstActiveAt: null };
    case 'ACTIVE': return { connectedAt: { not: null }, isActive: true };
    case 'INACTIVE': return { connectedAt: { not: null }, isActive: false, firstActiveAt: { not: null } };
  }
}

export async function clientCounts(partnerId: string): Promise<PartnerClientCountsDto> {
  const [all, SIGNED_UP, CONNECTED, ACTIVE, INACTIVE] = await Promise.all([
    prisma.referral.count({ where: { partnerId } }),
    ...(['SIGNED_UP', 'CONNECTED', 'ACTIVE', 'INACTIVE'] as const).map(s => prisma.referral.count({ where: { partnerId, ...statusWhere(s) } })),
  ]);
  return { all, SIGNED_UP: SIGNED_UP!, CONNECTED: CONNECTED!, ACTIVE: ACTIVE!, INACTIVE: INACTIVE! };
}

export async function listClients(partnerId: string, q: PartnerClientsQuery) {
  await syncConnected(partnerId);
  const where: Prisma.ReferralWhereInput = {
    partnerId,
    ...(q.status ? statusWhere(q.status) : {}),
    ...(q.channel ? { channelId: q.channel } : {}),
    ...(q.q ? { user: { OR: [
      { name: { contains: q.q, mode: 'insensitive' } },
      { city: { contains: q.q, mode: 'insensitive' } },
      { country: { contains: q.q, mode: 'insensitive' } },
    ] } } : {}),
  };
  const orderBy: Prisma.ReferralOrderByWithRelationInput[] =
    q.sort === 'trades' ? [{ trades30d: 'desc' }, { attributedAt: 'desc' }]
    : q.sort === 'name' ? [{ user: { name: 'asc' } }]
    : [{ attributedAt: 'desc' }];
  const [total, rows, counts] = await Promise.all([
    prisma.referral.count({ where }),
    prisma.referral.findMany({ where, orderBy, include: referralInclude, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    clientCounts(partnerId),
  ]);
  return {
    items: rows.map(toClient), counts,
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
  };
}

export async function channelStats(p: { id: string; codes: { code: string; isPrimary: boolean }[] }, includeArchived = false): Promise<PartnerChannelDto[]> {
  const [channels, clicks, convs, refs] = await Promise.all([
    prisma.partnerChannel.findMany({ where: { partnerId: p.id, ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: { createdAt: 'asc' } }),
    prisma.referralClick.groupBy({ by: ['channelId'], where: { partnerId: p.id }, _count: { _all: true } }),
    convertedBy([p.id], 'channelId'),
    prisma.$queryRaw<{ channelId: string | null; signups: number; connected: number; active: number }[]>`
      SELECT "channelId", COUNT(*)::int AS signups,
             COUNT("connectedAt")::int AS connected,
             COUNT(*) FILTER (WHERE "isActive" AND "connectedAt" IS NOT NULL)::int AS active
      FROM "referral" WHERE "partnerId" = ${p.id} GROUP BY "channelId"`,
  ]);
  const code = primaryCode(p) ?? '';
  const def = channels.find(c => c.slug === '');
  // Clicks/referrals whose channel was deleted fold into the default link.
  const key = (id: string | null) => (id && channels.some(c => c.id === id) ? id : def?.id ?? null);
  const clickBy = new Map<string | null, number>(), convBy = new Map<string | null, number>(), refBy = new Map<string | null, { signups: number; connected: number; active: number }>();
  for (const c of clicks) clickBy.set(key(c.channelId), (clickBy.get(key(c.channelId)) ?? 0) + c._count._all);
  for (const [ch, n] of convs) convBy.set(key(ch), (convBy.get(key(ch)) ?? 0) + n);
  for (const r of refs) {
    const k = key(r.channelId), cur = refBy.get(k) ?? { signups: 0, connected: 0, active: 0 };
    refBy.set(k, { signups: cur.signups + r.signups, connected: cur.connected + r.connected, active: cur.active + r.active });
  }
  return channels
    .map(c => ({
      id: c.id, label: c.label, slug: c.slug || null, url: referralUrl(appUrl(), code, c.slug || null),
      clicks: clickBy.get(c.id) ?? 0, converted: convBy.get(c.id) ?? 0, ...(refBy.get(c.id) ?? { signups: 0, connected: 0, active: 0 }),
      createdAt: c.createdAt.toISOString(),
    }))
    .sort((a, b) => b.signups - a.signups || b.clicks - a.clicks);
}

export async function funnel(partnerId: string, range: PartnerRange, since: Date): Promise<PartnerFunnelDto> {
  const from = rangeStart(range, since);
  const at = from ? { gte: from } : undefined;
  const [clicks, converted, signups, connected, active] = await Promise.all([
    prisma.referralClick.count({ where: { partnerId, ...(at ? { createdAt: at } : {}) } }),
    convertedBy([partnerId], 'partnerId', from).then(m => m.get(partnerId) ?? 0),
    prisma.referral.count({ where: { partnerId, ...(at ? { attributedAt: at } : {}) } }),
    prisma.referral.count({ where: { partnerId, connectedAt: { not: null }, ...(at ? { attributedAt: at } : {}) } }),
    prisma.referral.count({ where: { partnerId, connectedAt: { not: null }, isActive: true, ...(at ? { attributedAt: at } : {}) } }),
  ]);
  return { range, from: from?.toISOString() ?? null, clicks, converted, signups, connected, active };
}

export async function daily(partnerId: string, range: PartnerRange, since: Date): Promise<PartnerDailyPointDto[]> {
  const from = rangeStart(range, since) ?? since;
  const keys = dayKeys(from, new Date());
  const first = new Date(`${keys[0]}T00:00:00.000Z`);
  const [clickRows, signupRows, activeRows, baseClients, baseActive] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM "referral_click"
      WHERE "partnerId" = ${partnerId} AND "createdAt" >= ${first} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char("attributedAt", 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM "referral"
      WHERE "partnerId" = ${partnerId} AND "attributedAt" >= ${first} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char("firstActiveAt", 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM "referral"
      WHERE "partnerId" = ${partnerId} AND "isActive" AND "connectedAt" IS NOT NULL AND "firstActiveAt" >= ${first} GROUP BY 1`,
    prisma.referral.count({ where: { partnerId, attributedAt: { lt: first } } }),
    prisma.referral.count({ where: { partnerId, isActive: true, connectedAt: { not: null }, firstActiveAt: { lt: first } } }),
  ]);
  const m = (rows: { d: string; n: number }[]) => new Map(rows.map(r => [r.d, r.n]));
  const ck = m(clickRows), su = m(signupRows), ac = m(activeRows);
  let clients = baseClients, active = baseActive;
  return keys.map(date => {
    clients += su.get(date) ?? 0;
    active += ac.get(date) ?? 0;
    return { date, clicks: ck.get(date) ?? 0, signups: su.get(date) ?? 0, clients, active };
  });
}

export async function activity(partnerId: string, limit = 10): Promise<PartnerEventDto[]> {
  const pick = (field: 'attributedAt' | 'connectedAt' | 'firstActiveAt' | 'inactiveAt', extra: Prisma.ReferralWhereInput = {}) =>
    prisma.referral.findMany({
      where: { partnerId, ...(field === 'attributedAt' ? {} : { [field]: { not: null } }), ...extra },
      orderBy: { [field]: 'desc' }, take: limit, include: referralInclude,
    });
  const [s, c, a, i] = await Promise.all([
    pick('attributedAt'), pick('connectedAt'), pick('firstActiveAt', { connectedAt: { not: null } }), pick('inactiveAt', { isActive: false }),
  ]);
  const ev = (r: ReferralRow, kind: PartnerEventDto['kind'], at: Date | null): PartnerEventDto | null =>
    at ? { id: `${r.id}:${kind}`, at: at.toISOString(), kind, client: r.user.name, channel: r.channel?.label ?? DEFAULT_CHANNEL_LABEL } : null;
  return [
    ...s.map(r => ev(r, 'signup', r.attributedAt)), ...c.map(r => ev(r, 'connected', r.connectedAt)),
    ...a.map(r => ev(r, 'active', r.firstActiveAt)), ...i.map(r => ev(r, 'inactive', r.inactiveAt)),
  ].filter((e): e is PartnerEventDto => !!e).sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export async function overview(p: PartnerWithUser, range: PartnerRange): Promise<PartnerOverviewDto> {
  await syncConnected(p.id);
  const since = p.approvedAt ?? p.createdAt;
  const [f, d, channels, events, recent, totalClients] = await Promise.all([
    funnel(p.id, range, since), daily(p.id, range, since), channelStats(p), activity(p.id),
    prisma.referral.findMany({ where: { partnerId: p.id }, orderBy: { attributedAt: 'desc' }, take: 6, include: referralInclude }),
    prisma.referral.count({ where: { partnerId: p.id } }),
  ]);
  return { partner: toProfile(p), funnel: f, daily: d, channels, activity: events, recentClients: recent.map(toClient), totalClients };
}

export async function codeStats(p: PartnerWithUser): Promise<PartnerCodeDto[]> {
  const [clicks, refs] = await Promise.all([
    prisma.referralClick.groupBy({ by: ['code'], where: { partnerId: p.id }, _count: { _all: true } }),
    prisma.referral.groupBy({ by: ['code'], where: { partnerId: p.id }, _count: { _all: true } }),
  ]);
  const ck = new Map(clicks.map(c => [c.code, c._count._all])), su = new Map(refs.map(r => [r.code, r._count._all]));
  return [...p.codes]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.getTime() - b.createdAt.getTime())
    .map(c => ({
      id: c.id, code: c.code, isPrimary: c.isPrimary, url: referralUrl(appUrl(), c.code),
      clicks: ck.get(c.code) ?? 0, signups: su.get(c.code) ?? 0, createdAt: c.createdAt.toISOString(),
    }));
}

export async function links(p: PartnerWithUser): Promise<PartnerLinksDto> {
  const [codes, channels, clicks, totalClicks, totalConverted, totalSignups] = await Promise.all([
    codeStats(p), channelStats(p),
    prisma.referralClick.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: 'desc' }, take: 15, include: { channel: { select: { label: true } } } }),
    prisma.referralClick.count({ where: { partnerId: p.id } }),
    convertedBy([p.id], 'partnerId').then(m => m.get(p.id) ?? 0),
    prisma.referral.count({ where: { partnerId: p.id } }),
  ]);
  // "Signed up" only while that person is still this partner's client.
  const convertedIds = clicks.map(c => c.convertedUserId).filter((x): x is string => !!x);
  const stillMine = new Set(convertedIds.length
    ? (await prisma.referral.findMany({ where: { partnerId: p.id, userId: { in: convertedIds } }, select: { userId: true } })).map(r => r.userId)
    : []);
  const recentClicks: PartnerClickDto[] = clicks.map(c => ({
    id: c.id, at: c.createdAt.toISOString(), channel: c.channel?.label ?? DEFAULT_CHANNEL_LABEL,
    device: (['Mobile', 'Tablet'].includes(c.device) ? c.device : 'Desktop') as PartnerClickDto['device'],
    country: c.country, converted: !!c.convertedUserId && stillMine.has(c.convertedUserId),
  }));
  return {
    partner: toProfile(p), baseUrl: referralUrl(appUrl(), primaryCode(p) ?? ''), codes, channels, recentClicks,
    totals: { clicks: totalClicks, converted: totalConverted, signups: totalSignups },
    limits: { maxChannels: env.PARTNER_MAX_CHANNELS, maxCodes: env.PARTNER_MAX_CODES },
  };
}

/** Rolling 30-day counters for admin rows, for many partners in three queries. */
export async function rowCounters(partnerIds: string[]) {
  if (!partnerIds.length) return new Map<string, { clicks30d: number; converted30d: number; signups30d: number; clients: number; connected: number; active: number }>();
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [clicks, conv, refs] = await Promise.all([
    prisma.referralClick.groupBy({ by: ['partnerId'], where: { partnerId: { in: partnerIds }, createdAt: { gte: since } }, _count: { _all: true } }),
    convertedBy(partnerIds, 'partnerId', since),
    prisma.$queryRaw<{ partnerId: string; clients: number; signups30d: number; connected: number; active: number }[]>`
      SELECT "partnerId", COUNT(*)::int AS clients,
             COUNT(*) FILTER (WHERE "attributedAt" >= ${since})::int AS signups30d,
             COUNT("connectedAt")::int AS connected,
             COUNT(*) FILTER (WHERE "isActive" AND "connectedAt" IS NOT NULL)::int AS active
      FROM "referral" WHERE "partnerId" IN (${Prisma.join(partnerIds)}) GROUP BY "partnerId"`,
  ]);
  const out = new Map(partnerIds.map(id => [id, { clicks30d: 0, converted30d: 0, signups30d: 0, clients: 0, connected: 0, active: 0 }]));
  for (const c of clicks) out.get(c.partnerId)!.clicks30d = c._count._all;
  for (const [id, n] of conv) if (id && out.has(id)) out.get(id)!.converted30d = n;
  for (const r of refs) Object.assign(out.get(r.partnerId)!, { clients: r.clients, signups30d: r.signups30d, connected: r.connected, active: r.active });
  return out;
}

export { referralInclude };
