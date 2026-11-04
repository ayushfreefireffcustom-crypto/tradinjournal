// Advanced partner reports and programme-wide retention.
// All time filters compare against UTC timestamps (the columns have no zone), never raw
// Date parameters, so results don't depend on the database session's time zone.
import { prisma, Prisma } from '@tradinjournal/db';
import type { CohortRowDto, PartnerRange, PartnerReportsDto } from '@tradinjournal/contracts';
import { dayKeys, rangeStart } from '../partner.logic.js';
import { PERKS } from './perks.js';
import { DEFAULT_CHANNEL_LABEL } from '../partners.service.js';

const ts = (d: Date) => Prisma.sql`${d.toISOString().slice(0, 23).replace('T', ' ')}::timestamp`;
const scope = (partnerId?: string) => (partnerId ? Prisma.sql`AND r."partnerId" = ${partnerId}` : Prisma.empty);

/** Signup-month cohorts: how many connected, verified, were ever active, are active and unlocked now. */
export async function cohorts(partnerId?: string, months = 12): Promise<CohortRowDto[]> {
  const from = new Date();
  from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0); from.setUTCMonth(from.getUTCMonth() - (months - 1));
  return prisma.$queryRaw<CohortRowDto[]>`
    SELECT to_char(r."attributedAt", 'YYYY-MM') AS month,
           COUNT(*)::int AS signups,
           COUNT(r."connectedAt")::int AS connected,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "client_verification" v WHERE v."userId" = r."userId" AND v."partnerId" = r."partnerId" AND v.status = 'VERIFIED'))::int AS verified,
           COUNT(r."firstActiveAt")::int AS "everActive",
           COUNT(*) FILTER (WHERE r."isActive" AND r."connectedAt" IS NOT NULL)::int AS "activeNow",
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "client_entitlement" e WHERE e."userId" = r."userId" AND e."partnerId" = r."partnerId" AND e.status IN ('ACTIVE', 'GRACE')))::int AS "unlockedNow"
    FROM "referral" r WHERE r."attributedAt" >= ${ts(from)} ${scope(partnerId)}
    GROUP BY 1 ORDER BY 1`;
}

export async function partnerReports(p: { id: string; userId: string; approvedAt: Date | null; createdAt: Date }, range: PartnerRange): Promise<PartnerReportsDto> {
  const since = p.approvedAt ?? p.createdAt;
  const from = rangeStart(range, since) ?? since;
  const keys = dayKeys(from, new Date());
  const first = new Date(`${keys[0]}T00:00:00.000Z`);
  const day = (col: Prisma.Sql) => Prisma.sql`to_char(${col}, 'YYYY-MM-DD')`;
  const series = (rows: { d: string; n: number }[]) => new Map(rows.map(r => [r.d, r.n]));
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [clicks, signups, connected, verified, unlocked, coh, channels, products, featureRows, pkgSubs, stratSubs, ib, sales] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT ${day(Prisma.sql`"createdAt"`)} AS d, COUNT(*)::int AS n FROM "referral_click" WHERE "partnerId" = ${p.id} AND "createdAt" >= ${ts(first)} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT ${day(Prisma.sql`"attributedAt"`)} AS d, COUNT(*)::int AS n FROM "referral" WHERE "partnerId" = ${p.id} AND "attributedAt" >= ${ts(first)} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT ${day(Prisma.sql`"connectedAt"`)} AS d, COUNT(*)::int AS n FROM "referral" WHERE "partnerId" = ${p.id} AND "connectedAt" >= ${ts(first)} GROUP BY 1`,
    // First time each client was verified, from the event trail.
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT ${day(Prisma.sql`f`)} AS d, COUNT(*)::int AS n FROM (
        SELECT "userId", MIN("createdAt") AS f FROM "partner_event"
        WHERE "partnerId" = ${p.id} AND kind IN ('verify.verified', 'verify.manual_approve') GROUP BY "userId") x
      WHERE f >= ${ts(first)} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT ${day(Prisma.sql`f`)} AS d, COUNT(*)::int AS n FROM (
        SELECT "userId", MIN("grantedAt") AS f FROM "client_entitlement" WHERE "partnerId" = ${p.id} GROUP BY "userId") x
      WHERE f >= ${ts(first)} GROUP BY 1`,
    cohorts(p.id),
    prisma.$queryRaw<{ label: string | null; clicks: number; signups: number; verified: number; unlocked: number }[]>`
      SELECT c.label,
             (SELECT COUNT(*) FROM "referral_click" k WHERE k."channelId" = c.id)::int AS clicks,
             COUNT(r.id)::int AS signups,
             COUNT(r.id) FILTER (WHERE EXISTS (SELECT 1 FROM "client_verification" v WHERE v."userId" = r."userId" AND v."partnerId" = r."partnerId" AND v.status = 'VERIFIED'))::int AS verified,
             COUNT(r.id) FILTER (WHERE EXISTS (SELECT 1 FROM "client_entitlement" e WHERE e."userId" = r."userId" AND e."partnerId" = r."partnerId" AND e.status IN ('ACTIVE', 'GRACE')))::int AS unlocked
      FROM "partner_channel" c LEFT JOIN "referral" r ON r."channelId" = c.id
      WHERE c."partnerId" = ${p.id} GROUP BY c.id, c.label ORDER BY signups DESC`,
    prisma.$queryRaw<{ id: string; name: string; type: string; opens: number; users: number }[]>`
      SELECT pp.id, pp.name, pp.type, COUNT(u.id)::int AS opens, COUNT(DISTINCT u."userId")::int AS users
      FROM "partner_product" pp LEFT JOIN "usage_event" u ON u.feature = 'product:' || pp.id AND u."createdAt" >= ${ts(since30)}
      WHERE pp."partnerId" = ${p.id} AND pp.status <> 'ARCHIVED' GROUP BY pp.id, pp.name, pp.type ORDER BY opens DESC`,
    // Page views of TRADElogs features by this partner's clients (last 30 days).
    prisma.$queryRaw<{ path: string; users: number; views: number }[]>`
      SELECT split_part(u.path, '/', 2) AS path, COUNT(DISTINCT u."userId")::int AS users, COUNT(*)::int AS views
      FROM "usage_event" u JOIN "referral" r ON r."userId" = u."userId" AND r."partnerId" = ${p.id}
      WHERE u.type = 'page_view' AND u."createdAt" >= ${ts(since30)} GROUP BY 1`,
    prisma.$queryRaw<{ name: string; active: number; total: number; revenueCents: number; currency: string }[]>`
      SELECT pk.name, COUNT(s.id) FILTER (WHERE s.status IN ('ACTIVE', 'CANCELLED') AND s."currentPeriodEnd" > (now() AT TIME ZONE 'UTC'))::int AS active,
             COUNT(s.id)::int AS total,
             COALESCE((SELECT SUM(pay."amountCents") FROM "payment" pay JOIN "package_subscription" s2 ON s2.id = pay."subscriptionId" WHERE s2."packageId" = pk.id AND pay.status = 'PAID'), 0)::int AS "revenueCents",
             pk.currency
      FROM "partner_package" pk LEFT JOIN "package_subscription" s ON s."packageId" = pk.id
      WHERE pk."partnerId" = ${p.id} AND pk."priceCents" > 0 GROUP BY pk.id, pk.name, pk.currency`,
    prisma.$queryRaw<{ name: string; active: number; total: number }[]>`
      SELECT t.name, COUNT(s.id) FILTER (WHERE s.status IN ('active', 'paused'))::int AS active, COUNT(s.id)::int AS total
      FROM "strategy_template" t LEFT JOIN "template_subscription" s ON s."templateId" = t.id
      WHERE t."creatorId" = ${p.userId} GROUP BY t.id, t.name ORDER BY total DESC`,
    prisma.$queryRaw<{ month: string; amount: number }[]>`SELECT to_char("earnedAt", 'YYYY-MM') AS month, SUM(amount)::float AS amount FROM "ib_earning" WHERE "partnerId" = ${p.id} GROUP BY 1`,
    prisma.$queryRaw<{ month: string; cents: number }[]>`SELECT to_char("paidAt", 'YYYY-MM') AS month, SUM("partnerShareCents")::int AS cents FROM "payment" WHERE "partnerId" = ${p.id} AND status = 'PAID' GROUP BY 1`,
  ]);

  const c = series(clicks), s = series(signups), cn = series(connected), v = series(verified), u = series(unlocked);
  const months = [...new Set([...ib.map(x => x.month), ...sales.map(x => x.month)])].sort().slice(-12);
  return {
    range,
    daily: keys.map(date => ({ date, clicks: c.get(date) ?? 0, signups: s.get(date) ?? 0, connected: cn.get(date) ?? 0, verified: v.get(date) ?? 0, unlocked: u.get(date) ?? 0 })),
    cohorts: coh,
    channels: channels.map(x => ({ ...x, label: x.label || DEFAULT_CHANNEL_LABEL })),
    products,
    features: PERKS.map(pk => {
      const rows = featureRows.filter(f => pk.pages.some(pg => pg.slice(1) === f.path));
      return { key: pk.key, label: pk.label, users: rows.reduce((n, r) => Math.max(n, r.users), 0), views: rows.reduce((n, r) => n + r.views, 0) };
    }).filter(f => f.views > 0).sort((a, b) => b.users - a.users),
    marketplace: { packageSubs: pkgSubs, strategySubs: stratSubs },
    earningsByMonth: months.map(m => ({ month: m, ib: Math.round((ib.find(x => x.month === m)?.amount ?? 0) * 100) / 100, salesShareCents: sales.find(x => x.month === m)?.cents ?? 0 })),
  };
}
