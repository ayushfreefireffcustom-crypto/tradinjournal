// Partner-package access: who holds what, why something is locked, consent, and the
// "join a partner later" path. Entitlements are recomputed after every relevant event
// and on a schedule (scheduler.ts › partner-stats).
import { prisma } from '@tradinjournal/db';
import type { AccessPackageDto, ClientAccessDto, EntitlementStatusDto } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { ConflictError, NotFoundError } from '../../../http/errors.js';
import { isAdmin } from '../../../lib/admin.js';
import { resolveActiveCode } from '../attribution.service.js';
import { firstName } from '../partner.logic.js';
import { brokerKeyFor, brokerLabel } from './brokers.js';
import { allowedPerks, evaluatePackage, nextEntitlement, sameState, type EntitlementState } from './ib.logic.js';
import { clientProducts } from './products.service.js';
import { PERKS, perkDtos } from './perks.js';
import { getProgramSettings } from './settings.js';
import { logEvent } from './events.js';
import { accountsOf, verifyUser } from './ib.service.js';

const LIVE: EntitlementStatusDto[] = ['ACTIVE', 'GRACE'];

const KIND: Record<EntitlementStatusDto, string> = { ACTIVE: 'access.grant', GRACE: 'access.grace', SUSPENDED: 'access.suspend', EXPIRED: 'access.expire' };

/** Recomputes one client's access to every package of their partner. */
export async function recomputeUser(userId: string, now = new Date()): Promise<void> {
  const ref = await prisma.referral.findUnique({
    where: { userId },
    include: { partner: { include: { user: { select: { name: true } }, packages: true } } },
  });
  const existing = await prisma.clientEntitlement.findMany({ where: { userId } });
  if (!ref) {
    // No partner any more (admin unlinked): everything they held lapses now.
    for (const e of existing.filter(x => LIVE.includes(x.status))) {
      await prisma.clientEntitlement.update({ where: { id: e.id }, data: { status: 'SUSPENDED', suspendedAt: now, graceUntil: null, reason: 'You are no longer linked to this partner.' } });
    }
    return;
  }
  const rule = await getProgramSettings();
  const verified = await prisma.clientVerification.findMany({ where: { userId, partnerId: ref.partnerId, status: 'VERIFIED' }, select: { broker: true } });
  const verifiedBrokers = [...new Set(verified.map(v => v.broker).filter((b): b is string => !!b))];
  const name = firstName(ref.partner.user.name);
  for (const pkg of ref.partner.packages) {
    const prevRow = existing.find(e => e.packageId === pkg.id) ?? null;
    if (!prevRow && (pkg.status !== 'LIVE' || pkg.adminHold)) continue;
    const ev = evaluatePackage({
      partnerName: name, partnerActive: ref.partner.status === 'ACTIVE', pkg, verifiedBrokers,
      activeTrader: ref.isActive && !!ref.connectedAt, rule,
    });
    const prev: EntitlementState | null = prevRow
      ? { status: prevRow.status, grantedAt: prevRow.grantedAt, expiresAt: prevRow.expiresAt, graceUntil: prevRow.graceUntil, suspendedAt: prevRow.suspendedAt, reason: prevRow.reason }
      : null;
    const next = nextEntitlement(prev, ev, pkg.accessDays, rule, now);
    if (!next || (prev && sameState(prev, next))) continue;
    if (prevRow) await prisma.clientEntitlement.update({ where: { id: prevRow.id }, data: next });
    else await prisma.clientEntitlement.create({ data: { userId, partnerId: ref.partnerId, packageId: pkg.id, ...next } });
    if (prev?.status !== next.status) {
      await logEvent({
        kind: prev && next.status === 'ACTIVE' ? 'access.restore' : KIND[next.status], partnerId: ref.partnerId, userId,
        message: `${pkg.name}: ${prev?.status ?? 'none'} → ${next.status}${next.reason ? ` (${next.reason})` : ''}`,
      });
    }
  }
  // Rows for another partner's packages (client was moved) lapse.
  for (const e of existing.filter(x => x.partnerId !== ref.partnerId && LIVE.includes(x.status))) {
    await prisma.clientEntitlement.update({ where: { id: e.id }, data: { status: 'SUSPENDED', suspendedAt: now, graceUntil: null, reason: 'You are no longer linked to this partner.' } });
  }
  perkCache.delete(userId);
}

export async function recomputePartner(partnerId: string): Promise<number> {
  const refs = await prisma.referral.findMany({ where: { partnerId }, select: { userId: true } });
  for (const r of refs) await recomputeUser(r.userId);
  return refs.length;
}

/** Scheduled pass: every client with a verification or an entitlement. */
export async function recomputeAll(): Promise<number> {
  const [a, b] = await Promise.all([
    prisma.clientVerification.findMany({ distinct: ['userId'], select: { userId: true } }),
    prisma.clientEntitlement.findMany({ distinct: ['userId'], select: { userId: true } }),
  ]);
  const ids = [...new Set([...a, ...b].map(r => r.userId))];
  for (const id of ids) await recomputeUser(id);
  return ids.length;
}

// ── Perks (feature locks) ─────────────────────────────────────────────────────

const perkCache = new Map<string, { perks: string[]; at: number }>();
const PERK_CACHE_MS = 60_000;

/** Perks this user may use. Admins and active partners are never locked out. */
export async function perksFor(userId: string, email: string): Promise<{ locked: string[]; mine: string[] }> {
  const { lockedPerks } = await getProgramSettings();
  const all = PERKS.map(p => p.key);
  if (!lockedPerks.length || isAdmin(email)) return { locked: lockedPerks, mine: all };
  const hit = perkCache.get(userId);
  if (hit && Date.now() - hit.at < PERK_CACHE_MS) return { locked: lockedPerks, mine: hit.perks };
  const [partner, held] = await Promise.all([
    prisma.partner.findUnique({ where: { userId }, select: { status: true } }),
    prisma.clientEntitlement.findMany({ where: { userId, status: { in: LIVE } }, include: { package: { select: { perks: true } } } }),
  ]);
  const mine = partner?.status === 'ACTIVE' ? all : allowedPerks(lockedPerks, held.map(h => ({ status: h.status, perks: h.package.perks })), all);
  perkCache.set(userId, { perks: mine, at: Date.now() });
  return { locked: lockedPerks, mine };
}

export function clearPerkCache(): void {
  perkCache.clear();
}

/** Templates marked partner-only that this user may see (as holder, creator or admin). */
export async function visiblePartnerTemplates(userId: string): Promise<string[]> {
  const held = await prisma.clientEntitlement.findMany({ where: { userId, status: { in: LIVE } }, include: { package: { select: { templateIds: true } } } });
  return [...new Set(held.flatMap(h => h.package.templateIds))];
}

// ── The client's Access page ──────────────────────────────────────────────────

/** Every condition a package checks, for one client, without writing anything. */
async function packageContext(userId: string) {
  const rule = await getProgramSettings();
  const [ref, verifs, ents] = await Promise.all([
    prisma.referral.findUnique({ where: { userId }, include: { partner: { include: { user: { select: { name: true } }, codes: true, packages: { where: { status: 'LIVE', adminHold: false } } } } } }),
    prisma.clientVerification.findMany({ where: { userId } }),
    prisma.clientEntitlement.findMany({ where: { userId }, include: { package: true } }),
  ]);
  const verifiedBrokers = [...new Set(verifs.filter(v => v.status === 'VERIFIED' && v.partnerId === ref?.partnerId).map(v => v.broker).filter((b): b is string => !!b))];
  const evaluate = (p: { status: string; brokers: string[]; requireActive: boolean; adminHold: boolean }) => evaluatePackage({
    partnerName: ref ? firstName(ref.partner.user.name) : '', partnerActive: ref?.partner.status === 'ACTIVE', pkg: p, verifiedBrokers,
    activeTrader: !!ref?.isActive && !!ref?.connectedAt, rule,
  });
  return { rule, ref, verifs, ents, evaluate };
}

export async function clientAccess(userId: string, email: string): Promise<ClientAccessDto> {
  const [{ rule, ref, verifs, ents, evaluate }, accounts, perks, products] = await Promise.all([
    packageContext(userId), accountsOf(userId), perksFor(userId, email), clientProducts(userId),
  ]);
  const extra = ref ? await prisma.partnerBroker.findMany({ where: { partnerId: ref.partnerId }, select: { serverMatch: true } }) : [];

  const accountDtos = accounts.map(a => {
    const v = verifs.find(x => (a.kind === 'mt5' ? x.brokerAccountId : x.externalAccountId) === a.id);
    const key = v?.broker ?? brokerKeyFor(a, extra);
    return {
      id: a.id, label: `${a.login} · ${a.server}`, broker: key ? brokerLabel(key) : a.broker, brokerKey: key,
      status: v?.status ?? 'PENDING', reason: v ? v.reason : ref ? 'Not checked yet.' : null, brokerEmail: v?.brokerEmail ?? null,
      checkedAt: v?.checkedAt?.toISOString() ?? null, reviewRequested: !!v?.reviewRequestedAt,
      canRetry: !!ref && v?.status !== 'VERIFIED' && !(v?.method === 'manual' && v.status === 'REJECTED'),
      kind: a.kind, platform: a.platform,
    };
  });

  // Live packages of the current partner, plus anything the client still holds.
  const pkgs = new Map<string, AccessPackageDto>();
  const templateIds = new Set<string>(), productIds = new Set<string>();
  for (const p of [...(ref?.partner.packages ?? []), ...ents.map(e => e.package)]) {
    p.templateIds.forEach(t => templateIds.add(t));
    p.productIds.forEach(t => productIds.add(t));
  }
  const [templates, prods] = await Promise.all([
    templateIds.size ? prisma.strategyTemplate.findMany({ where: { id: { in: [...templateIds] } }, select: { id: true, name: true } }) : [],
    productIds.size ? prisma.partnerProduct.findMany({ where: { id: { in: [...productIds] }, status: 'APPROVED' }, select: { id: true, name: true, type: true } }) : [],
  ]);
  const tpl = (ids: string[]) => templates.filter(t => ids.includes(t.id));
  const prd = (ids: string[]) => prods.filter(t => ids.includes(t.id));
  for (const p of ref?.partner.packages ?? []) {
    const e = ents.find(x => x.packageId === p.id);
    const ev = evaluate(p);
    pkgs.set(p.id, {
      id: p.id, name: p.name, description: p.description, perks: perkDtos(p.perks), templates: tpl(p.templateIds), products: prd(p.productIds),
      status: e?.status ?? 'LOCKED', reasons: e && e.status === 'ACTIVE' ? [] : ev.reasons,
      grantedAt: e?.grantedAt.toISOString() ?? null, expiresAt: e?.expiresAt?.toISOString() ?? null, graceUntil: e?.graceUntil?.toISOString() ?? null,
    });
  }
  for (const e of ents) {
    if (pkgs.has(e.packageId) || !LIVE.includes(e.status)) continue;
    pkgs.set(e.packageId, {
      id: e.packageId, name: e.package.name, description: e.package.description, perks: perkDtos(e.package.perks), templates: tpl(e.package.templateIds),
      products: prd(e.package.productIds), status: e.status, reasons: e.reason ? [e.reason] : [], grantedAt: e.grantedAt.toISOString(),
      expiresAt: e.expiresAt?.toISOString() ?? null, graceUntil: e.graceUntil?.toISOString() ?? null,
    });
  }

  return {
    partner: ref ? { name: ref.partner.user.name, code: ref.partner.codes.find(c => c.isPrimary)?.code ?? ref.code, status: ref.partner.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' } : null,
    canJoin: !ref,
    accounts: accountDtos,
    activity: {
      active: !!ref?.isActive && !!ref?.connectedAt, trades: ref?.tradeCount7d ?? 0, lots: ref?.lots30d ?? 0,
      rule: { minTrades: rule.activeMinTrades, windowDays: rule.activeWindowDays, minLots: rule.activeMinLots },
      checkedAt: ref?.statsCheckedAt?.toISOString() ?? null,
    },
    packages: [...pkgs.values()],
    consent: { share: !!ref?.statsConsentAt, at: ref?.statsConsentAt?.toISOString() ?? null },
    lockedPerks: perks.locked,
    myPerks: perks.mine,
    products,
  };
}

/** A user with no partner enters a code after signup. */
export async function joinPartner(user: { id: string; email: string }, code: string): Promise<ClientAccessDto> {
  if (!env.PARTNER_PROGRAM_ENABLED) throw new NotFoundError('Partner programme is off');
  const existing = await prisma.referral.findUnique({ where: { userId: user.id } });
  if (existing) throw new ConflictError('You already have a partner. Ask support if it’s wrong.');
  const hit = await resolveActiveCode(code);
  if (!hit) throw new NotFoundError('That code doesn’t match an active partner.');
  if (hit.partner.userId === user.id) throw new ConflictError('You can’t use your own code.');
  const def = await prisma.partnerChannel.findFirst({ where: { partnerId: hit.partner.id, slug: '' } });
  const first = await prisma.brokerAccount.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  try {
    await prisma.referral.create({
      data: { userId: user.id, partnerId: hit.partner.id, channelId: def?.id ?? null, code: hit.code, source: 'LATE_CODE', connectedAt: first?.createdAt ?? null },
    });
  } catch {
    throw new ConflictError('You already have a partner.');
  }
  await logEvent({ kind: 'referral.late_code', partnerId: hit.partner.id, userId: user.id, message: `Joined with code ${hit.code} after signup` });
  await verifyUser(user.id, { userEmail: user.email });
  await recomputeUser(user.id);
  return clientAccess(user.id, user.email);
}

export async function setConsent(user: { id: string; email: string }, share: boolean): Promise<ClientAccessDto> {
  const ref = await prisma.referral.findUnique({ where: { userId: user.id } });
  if (!ref) throw new ConflictError('You don’t have a partner.');
  await prisma.referral.update({ where: { id: ref.id }, data: { statsConsentAt: share ? new Date() : null } });
  await logEvent({ kind: share ? 'consent.on' : 'consent.off', partnerId: ref.partnerId, userId: user.id, message: share ? 'Client shared their P&L with the partner' : 'Client stopped sharing their P&L' });
  return clientAccess(user.id, user.email);
}
