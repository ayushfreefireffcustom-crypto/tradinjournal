// Read models for the IB layer: funnel, trading summary, admin programme view,
// review queue, event log and CSV exports.
import { prisma, Prisma } from '@tradinjournal/db';
import type {
  ClientIbDto, IbFunnelDto, PartnerEventDto2, PartnerIbOverviewDto, PartnerRangeQuery, ProgramOverviewDto,
  ProgramPartnerRowDto, ReviewItemDto, TradingSummaryDto,
} from '@tradinjournal/contracts';
import { resolveWindow, within } from '../partner.logic.js';
import { listBrokers } from './ib.service.js';

const DAY_MS = 86_400_000;
const scope = (partnerId?: string) => (partnerId ? Prisma.sql`AND r."partnerId" = ${partnerId}` : Prisma.empty);

export async function tradingSummary(partnerId?: string): Promise<TradingSummaryDto> {
  const [row] = await prisma.$queryRaw<TradingSummaryDto[]>`
    SELECT COUNT(*)::int AS connected,
           COUNT(*) FILTER (WHERE r."trades30d" > 0)::int AS trading,
           COALESCE(SUM(r."trades30d"), 0)::int AS "trades30d",
           COALESCE(SUM(r."lots30d"), 0)::float AS "lots30d",
           COALESCE(SUM(r."pnl30d"), 0)::float AS "pnl30d",
           COUNT(*) FILTER (WHERE r."trades30d" > 0 AND r."pnl30d" > 0)::int AS profitable,
           COUNT(*) FILTER (WHERE r."trades30d" > 0 AND r."pnl30d" < 0)::int AS losing
    FROM "referral" r WHERE r."connectedAt" IS NOT NULL ${scope(partnerId)}`;
  return { ...row!, lots30d: Math.round(row!.lots30d * 100) / 100, pnl30d: Math.round(row!.pnl30d * 100) / 100 };
}

export async function ibFunnel(q: PartnerRangeQuery, partnerId?: string, partnerSince?: Date): Promise<IbFunnelDto> {
  const at = within(resolveWindow(q, partnerSince ?? new Date(0)));
  // Typed counts, not raw SQL: the columns are timestamps without a zone, and a raw
  // Date parameter would be compared in the database session's time zone.
  const base: Prisma.ReferralWhereInput = { ...(partnerId ? { partnerId } : {}), ...(at ? { attributedAt: at } : {}) };
  const own = (extra: object) => (partnerId ? { partnerId, ...extra } : extra);
  const [clicks, signups, connected, verified, active, eligible] = await Promise.all([
    prisma.referralClick.count({ where: { ...(partnerId ? { partnerId } : {}), ...(at ? { createdAt: at } : {}) } }),
    prisma.referral.count({ where: base }),
    prisma.referral.count({ where: { ...base, connectedAt: { not: null } } }),
    prisma.referral.count({ where: { ...base, user: { clientVerifications: { some: own({ status: 'VERIFIED' }) } } } }),
    prisma.referral.count({ where: { ...base, connectedAt: { not: null }, isActive: true } }),
    prisma.referral.count({ where: { ...base, user: { clientEntitlements: { some: own({ status: { in: ['ACTIVE', 'GRACE'] } }) } } } }),
  ]);
  return { range: q.range, clicks, signups, connected, verified, active, eligible };
}

export async function partnerIbOverview(partnerId: string, range: PartnerRangeQuery, partnerSince: Date): Promise<PartnerIbOverviewDto> {
  const [funnel, trading, brokers, pk, holders, v] = await Promise.all([
    ibFunnel(range, partnerId, partnerSince), tradingSummary(partnerId), listBrokers(partnerId),
    prisma.partnerPackage.count({ where: { partnerId, status: 'LIVE', OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }),
    prisma.clientEntitlement.findMany({ where: { partnerId, status: { in: ['ACTIVE', 'GRACE'] } }, distinct: ['userId'], select: { userId: true } }),
    prisma.clientVerification.findMany({ where: { partnerId }, select: { status: true, userId: true } }),
  ]);
  // Clients, not accounts: someone with two accounts is one client. A client who already
  // has a verified account isn't "not found" or "at another broker", even if one of
  // their other accounts is.
  const verifiedUsers = new Set(v.filter(x => x.status === 'VERIFIED').map(x => x.userId));
  const n = (s: string) => new Set(v.filter(x => x.status === s && (s === 'MANUAL_REVIEW' || !verifiedUsers.has(x.userId))).map(x => x.userId)).size;
  return {
    funnel, trading, brokers, packages: { live: pk, holders: holders.length },
    needsAttention: { notFound: n('NOT_FOUND'), inReview: n('MANUAL_REVIEW'), unsupported: n('UNSUPPORTED_BROKER'), syncErrors: brokers.filter(b => b.status === 'ERROR').length },
  };
}

/** IB columns for client rows. P&L only with the client's consent, unless an admin asks. */
export async function clientIb(referrals: { id: string; userId: string; partnerId: string; pnl30d: number; pnlTotal: number; statsConsentAt: Date | null }[], admin = false): Promise<Map<string, ClientIbDto>> {
  if (!referrals.length) return new Map();
  const users = referrals.map(r => r.userId);
  const [verifs, ents, accounts] = await Promise.all([
    prisma.clientVerification.findMany({ where: { userId: { in: users } }, select: { userId: true, partnerId: true, status: true, broker: true } }),
    prisma.clientEntitlement.findMany({ where: { userId: { in: users } }, include: { package: { select: { name: true } } } }),
    prisma.brokerAccount.groupBy({ by: ['userId'], where: { userId: { in: users } }, _count: { _all: true } }),
  ]);
  const rank = ['VERIFIED', 'MANUAL_REVIEW', 'NOT_FOUND', 'UNSUPPORTED_BROKER', 'REJECTED', 'PENDING'] as const;
  return new Map(referrals.map(r => {
    const mine = verifs.filter(v => v.userId === r.userId && v.partnerId === r.partnerId);
    const best = rank.find(s => mine.some(v => v.status === s));
    const hasAccount = accounts.some(a => a.userId === r.userId);
    const held = ents.filter(e => e.userId === r.userId && e.partnerId === r.partnerId && e.status !== 'EXPIRED');
    const show = admin || !!r.statsConsentAt;
    return [r.id, {
      referralId: r.id, verification: hasAccount ? best ?? 'PENDING' : 'NO_ACCOUNT',
      verifiedBrokers: [...new Set(mine.filter(v => v.status === 'VERIFIED').map(v => v.broker).filter((b): b is string => !!b))],
      eligible: held.some(e => e.status === 'ACTIVE' || e.status === 'GRACE'),
      packages: held.map(e => ({ name: e.package.name, status: e.status })),
      consent: !!r.statsConsentAt, pnl30d: show ? r.pnl30d : null, pnlTotal: show ? r.pnlTotal : null,
    }];
  }));
}

// ── Admin programme view ──────────────────────────────────────────────────────

export async function programRows(): Promise<ProgramPartnerRowDto[]> {
  const partners = await prisma.partner.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    include: { user: { select: { name: true, email: true } }, codes: { where: { isPrimary: true } } },
  });
  if (!partners.length) return [];
  const ids = partners.map(p => p.id);
  const rows = await prisma.$queryRaw<(Omit<ProgramPartnerRowDto, 'id' | 'name' | 'email' | 'code' | 'status' | 'brokerErrors'> & { partnerId: string })[]>`
    SELECT r."partnerId",
           COUNT(*)::int AS clients,
           COUNT(r."connectedAt")::int AS connected,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "client_verification" v WHERE v."userId" = r."userId" AND v."partnerId" = r."partnerId" AND v.status = 'VERIFIED'))::int AS verified,
           COUNT(*) FILTER (WHERE r."isActive" AND r."connectedAt" IS NOT NULL)::int AS active,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "client_entitlement" e WHERE e."userId" = r."userId" AND e."partnerId" = r."partnerId" AND e.status IN ('ACTIVE', 'GRACE')))::int AS eligible,
           COALESCE(SUM(r."trades30d") FILTER (WHERE r."connectedAt" IS NOT NULL), 0)::int AS "trades30d",
           COALESCE(SUM(r."lots30d") FILTER (WHERE r."connectedAt" IS NOT NULL), 0)::float AS "lots30d",
           COALESCE(SUM(r."pnl30d") FILTER (WHERE r."connectedAt" IS NOT NULL), 0)::float AS "pnl30d",
           COUNT(*) FILTER (WHERE r."connectedAt" IS NOT NULL AND r."trades30d" > 0 AND r."pnl30d" > 0)::int AS profitable,
           COUNT(*) FILTER (WHERE r."connectedAt" IS NOT NULL AND r."trades30d" > 0 AND r."pnl30d" < 0)::int AS losing
    FROM "referral" r WHERE r."partnerId" IN (${Prisma.join(ids)}) GROUP BY r."partnerId"`;
  const errs = await prisma.partnerBroker.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids }, status: 'ERROR' }, _count: { _all: true } });
  const zero = { clients: 0, connected: 0, verified: 0, active: 0, eligible: 0, trades30d: 0, lots30d: 0, pnl30d: 0, profitable: 0, losing: 0 };
  return partners.map(p => {
    const { partnerId: _drop, ...c } = rows.find(r => r.partnerId === p.id) ?? { partnerId: p.id, ...zero };
    return {
      id: p.id, name: p.user.name, email: p.user.email, code: p.codes[0]?.code ?? null, status: p.status, ...c,
      lots30d: Math.round(c.lots30d * 100) / 100, pnl30d: Math.round(c.pnl30d * 100) / 100,
      brokerErrors: errs.find(e => e.partnerId === p.id)?._count._all ?? 0,
    };
  }).sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name));
}

export async function programOverview(range: PartnerRangeQuery): Promise<ProgramOverviewDto> {
  const [statuses, funnel, trading, rows, reviews, flags, syncErrors] = await Promise.all([
    prisma.partner.groupBy({ by: ['status'], _count: { _all: true } }),
    ibFunnel(range), tradingSummary(), programRows(),
    prisma.clientVerification.count({ where: { status: 'MANUAL_REVIEW' } }),
    flagItems().then(f => f.length),
    prisma.partnerBroker.count({ where: { status: 'ERROR' } }),
  ]);
  const s = (k: string) => statuses.find(x => x.status === k)?._count._all ?? 0;
  return {
    range: range.range,
    partners: { pending: s('PENDING'), needsInfo: s('NEEDS_INFO'), active: s('ACTIVE'), suspended: s('SUSPENDED'), rejected: s('REJECTED'), revoked: s('REVOKED') },
    funnel, trading, rows, attention: { reviews, flags, syncErrors },
  };
}

// ── Review queue ──────────────────────────────────────────────────────────────

type VerifAccounts = {
  brokerAccount: { id: string; mt5Login: bigint; broker: string; server: string } | null;
  externalAccount: { id: string; login: string; broker: string; server: string; platform: string } | null;
};
function acct(v: VerifAccounts): ReviewItemDto['account'] {
  if (v.brokerAccount) return { id: v.brokerAccount.id, login: v.brokerAccount.mt5Login.toString(), broker: v.brokerAccount.broker, server: v.brokerAccount.server, platform: 'MT5' };
  if (v.externalAccount) return { id: v.externalAccount.id, login: v.externalAccount.login, broker: v.externalAccount.broker, server: v.externalAccount.server, platform: v.externalAccount.platform };
  return null;
}

/** Things a human should look at that aren't a pending verification. */
async function flagItems(): Promise<ReviewItemDto[]> {
  const items: ReviewItemDto[] = [];
  // 1. Account listed under another partner's IB than the one who referred the client.
  const other = await prisma.clientVerification.findMany({
    where: { signal: 'other-partner', status: { not: 'VERIFIED' } },
    include: { partner: { include: { user: { select: { name: true } } } }, user: { select: { id: true, name: true, email: true } }, brokerAccount: { select: { id: true, mt5Login: true, broker: true, server: true } }, externalAccount: { select: { id: true, login: true, broker: true, server: true, platform: true } } },
    take: 100, orderBy: { updatedAt: 'desc' },
  });
  for (const v of other) {
    items.push({
      id: `flag:other:${v.id}`, kind: 'flag', flag: 'Account is under a different partner’s IB than the one who referred this client',
      partner: { id: v.partnerId, name: v.partner.user.name }, client: v.user,
      account: acct(v),
      status: v.status, signal: v.signal, reason: v.reason, brokerEmail: v.brokerEmail, note: null, at: v.updatedAt.toISOString(),
    });
  }
  // 2. The same account in two partners' lists.
  const dup = await prisma.$queryRaw<{ broker: string; accountId: string; partners: string[] }[]>`
    SELECT broker, "accountId", array_agg(DISTINCT "partnerId") AS partners FROM "ib_account"
    WHERE "removedAt" IS NULL GROUP BY broker, "accountId" HAVING COUNT(DISTINCT "partnerId") > 1 LIMIT 100`;
  if (dup.length) {
    const names = new Map((await prisma.partner.findMany({ where: { id: { in: dup.flatMap(d => d.partners) } }, include: { user: { select: { name: true } } } })).map(p => [p.id, p.user.name]));
    for (const d of dup) {
      items.push({
        id: `flag:dup:${d.broker}:${d.accountId}`, kind: 'flag', flag: `Account ${d.accountId} appears in ${d.partners.length} partners’ ${d.broker} lists (${d.partners.map(p => names.get(p) ?? p).join(', ')})`,
        partner: { id: d.partners[0]!, name: names.get(d.partners[0]!) ?? '' }, client: null, account: null,
        status: null, signal: 'duplicate-ib', reason: null, brokerEmail: null, note: null, at: new Date().toISOString(),
      });
    }
  }
  // 3. Several signups from one network for one partner within a day.
  const burst = await prisma.$queryRaw<{ partnerId: string; ipHash: string; n: number; last: Date }[]>`
    SELECT "partnerId", "ipHash", COUNT(*)::int AS n, MAX("createdAt") AS last FROM "referral_click"
    WHERE "convertedUserId" IS NOT NULL AND "createdAt" >= (now() AT TIME ZONE 'UTC') - interval '30 days'
    GROUP BY "partnerId", "ipHash", date_trunc('day', "createdAt") HAVING COUNT(*) >= 3 LIMIT 50`;
  if (burst.length) {
    const names = new Map((await prisma.partner.findMany({ where: { id: { in: burst.map(b => b.partnerId) } }, include: { user: { select: { name: true } } } })).map(p => [p.id, p.user.name]));
    for (const b of burst) {
      items.push({
        id: `flag:burst:${b.partnerId}:${b.ipHash}:${b.last.toISOString().slice(0, 10)}`, kind: 'flag',
        flag: `${b.n} signups from one network on ${b.last.toISOString().slice(0, 10)}`,
        partner: { id: b.partnerId, name: names.get(b.partnerId) ?? '' }, client: null, account: null,
        status: null, signal: 'signup-burst', reason: null, brokerEmail: null, note: null, at: b.last.toISOString(),
      });
    }
  }
  return items;
}

export async function reviewQueue(): Promise<ReviewItemDto[]> {
  const pending = await prisma.clientVerification.findMany({
    where: { status: 'MANUAL_REVIEW' },
    include: { partner: { include: { user: { select: { name: true } } } }, user: { select: { id: true, name: true, email: true } }, brokerAccount: { select: { id: true, mt5Login: true, broker: true, server: true } }, externalAccount: { select: { id: true, login: true, broker: true, server: true, platform: true } } },
    orderBy: { updatedAt: 'asc' }, take: 200,
  });
  const items: ReviewItemDto[] = pending.map(v => ({
    id: v.id, kind: 'verification', flag: null, partner: { id: v.partnerId, name: v.partner.user.name }, client: v.user,
    account: acct(v),
    status: v.status, signal: v.signal, reason: v.reason, brokerEmail: v.brokerEmail, note: v.reviewNote,
    at: (v.reviewRequestedAt ?? v.updatedAt).toISOString(),
  }));
  return [...items, ...await flagItems()];
}

export async function listEvents(q: { partnerId?: string; kind?: string; limit: number }): Promise<PartnerEventDto2[]> {
  const rows = await prisma.partnerEvent.findMany({
    where: { ...(q.partnerId ? { partnerId: q.partnerId } : {}), ...(q.kind ? { kind: { startsWith: q.kind } } : {}) },
    orderBy: { createdAt: 'desc' }, take: q.limit,
  });
  return rows.map(e => ({ id: e.id, at: e.createdAt.toISOString(), kind: e.kind, message: e.message, partnerId: e.partnerId, userId: e.userId, actorEmail: e.actorEmail }));
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas in user-entered text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const csv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';

/** "2026-10-01..2026-10-31" style label for a range, for CSV columns. */
function rangeLabel(q: PartnerRangeQuery): string {
  const w = resolveWindow(q, new Date(0));
  if (!w.from) return 'all time';
  const last = w.to ? new Date(w.to.getTime() - DAY_MS) : new Date();
  return `${w.from.toISOString().slice(0, 10)}..${last.toISOString().slice(0, 10)}`;
}

export async function exportCsv(type: 'clients' | 'partners', q: PartnerRangeQuery = { range: 'ALL' }): Promise<string> {
  const at = within(resolveWindow(q, new Date(0)));
  if (type === 'partners') {
    const rows = await programRows();
    // Totals are all time; with a range, the funnel for that window is added per partner.
    const ranged = at ? await Promise.all(rows.map(r => ibFunnel(q, r.id))) : null;
    return csv([
      ['partner', 'email', 'code', 'status', 'clients', 'connected', 'verified', 'active', 'eligible', 'trades_30d', 'lots_30d', 'net_pnl_30d', 'profitable', 'losing', 'broker_errors',
        ...(ranged ? ['range', 'clicks_in_range', 'signups_in_range', 'connected_in_range', 'verified_in_range', 'active_in_range', 'eligible_in_range'] : [])],
      ...rows.map((r, i) => [r.name, r.email, r.code, r.status, r.clients, r.connected, r.verified, r.active, r.eligible, r.trades30d, r.lots30d, r.pnl30d, r.profitable, r.losing, r.brokerErrors,
        ...(ranged ? [rangeLabel(q), ranged[i]!.clicks, ranged[i]!.signups, ranged[i]!.connected, ranged[i]!.verified, ranged[i]!.active, ranged[i]!.eligible] : [])]),
    ]);
  }
  const refs = await prisma.referral.findMany({
    ...(at ? { where: { attributedAt: at } } : {}),
    include: { user: { select: { name: true, email: true, country: true } }, partner: { include: { user: { select: { name: true } } } } },
    orderBy: { attributedAt: 'desc' }, take: 50_000,
  });
  const ib = await clientIb(refs, true);
  return csv([
    ['client', 'email', 'country', 'partner', 'source', 'signed_up', 'connected', 'verification', 'eligible', 'packages', 'active', 'trades_30d', 'lots_30d', 'net_pnl_30d', 'net_pnl_since_signup', 'pnl_shared_with_partner'],
    ...refs.map(r => {
      const x = ib.get(r.id)!;
      return [r.user.name, r.user.email, r.user.country, r.partner.user.name, r.source.toLowerCase(), r.attributedAt.toISOString().slice(0, 10),
        r.connectedAt?.toISOString().slice(0, 10) ?? '', x.verification, x.eligible ? 'yes' : 'no', x.packages.map(p => `${p.name} (${p.status.toLowerCase()})`).join('; '),
        r.isActive && r.connectedAt ? 'yes' : 'no', r.trades30d, r.lots30d, r.pnl30d, r.pnlTotal, x.consent ? 'yes' : 'no'];
    }),
  ]);
}

/** The partner's own client list as CSV. Same privacy as the portal: no emails, P&L only with consent. */
export async function partnerClientsCsv(partnerId: string, q: PartnerRangeQuery = { range: 'ALL' }): Promise<string> {
  const at = within(resolveWindow(q, new Date(0)));
  const refs = await prisma.referral.findMany({
    where: { partnerId, ...(at ? { attributedAt: at } : {}) }, include: { user: { select: { name: true, city: true, country: true } }, channel: { select: { label: true } } },
    orderBy: { attributedAt: 'desc' }, take: 50_000,
  });
  const ib = await clientIb(refs, false);
  return csv([
    ['client', 'city', 'country', 'channel', 'source', 'signed_up', 'connected', 'broker_check', 'unlocked', 'packages', 'active', 'trades_30d', 'lots_30d', 'net_pnl_30d'],
    ...refs.map(r => {
      const x = ib.get(r.id)!;
      return [r.user.name, r.user.city, r.user.country, r.channel?.label ?? 'Direct link', r.source.toLowerCase(), r.attributedAt.toISOString().slice(0, 10),
        r.connectedAt?.toISOString().slice(0, 10) ?? '', x.verification, x.eligible ? 'yes' : 'no', x.packages.map(p => `${p.name} (${p.status.toLowerCase()})`).join('; '),
        r.isActive && r.connectedAt ? 'yes' : 'no', r.trades30d, r.lots30d, x.pnl30d ?? 'private'];
    }),
  ]);
}
