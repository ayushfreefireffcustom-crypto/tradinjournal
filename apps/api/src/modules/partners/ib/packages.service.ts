// What a partner offers their verified clients.
import { prisma } from '@tradinjournal/db';
import type { AdminPackageRowDto, PartnerPackageDto, PartnerPackageInput, PartnerPackagesDto } from '@tradinjournal/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { termsOf } from './terms.js';
import { endsAtFromDay, lastDayOf, packageEnded } from './ib.logic.js';
import { BROKERS, brokerLabel } from './brokers.js';
import { isPerk, perkDtos } from './perks.js';
import { getProgramSettings } from './settings.js';
import { logEvent } from './events.js';
import { recomputePartner } from './access.service.js';


type Actor = { id: string; email: string } | null;

type PkgRow = Awaited<ReturnType<typeof prisma.partnerPackage.findFirstOrThrow>>;

async function toDtos(rows: PkgRow[], partnerId?: string): Promise<PartnerPackageDto[]> {
  const ids = rows.map(r => r.id);
  const counts = await prisma.clientEntitlement.groupBy({ by: ['packageId', 'status'], where: { ...(partnerId ? { partnerId } : { packageId: { in: ids } }) }, _count: { _all: true } });
  const n = (id: string, s: string) => counts.find(c => c.packageId === id && c.status === s)?._count._all ?? 0;
  const now = new Date();
  return rows.map(p => {
    const ended = packageEnded(p.endsAt, now);
    return {
      id: p.id, name: p.name, description: p.description, perks: p.perks, templateIds: p.templateIds, productIds: p.productIds, brokers: p.brokers,
      requireActive: p.requireActive, accessDays: p.accessDays, endsOn: p.endsAt ? lastDayOf(p.endsAt) : null, ended, status: p.status,
      adminHold: p.adminHold, adminNote: p.adminNote,
      // Once it has ended nobody holds it, even before the next cycle records that.
      holders: ended ? 0 : n(p.id, 'ACTIVE') + n(p.id, 'GRACE'), inGrace: ended ? 0 : n(p.id, 'GRACE'), createdAt: p.createdAt.toISOString(),
    };
  });
}

export async function listPackageDtos(partnerId: string): Promise<PartnerPackageDto[]> {
  const rows = await prisma.partnerPackage.findMany({ where: { partnerId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
  return toDtos(rows, partnerId);
}

export async function packagesPage(partner: { id: string; userId: string }): Promise<PartnerPackagesDto> {
  const [packages, templates, brokers, settings, products, terms] = await Promise.all([
    listPackageDtos(partner.id),
    prisma.strategyTemplate.findMany({ where: { creatorId: partner.userId }, select: { id: true, name: true, status: true, partnerOnly: true }, orderBy: { createdAt: 'desc' } }),
    prisma.partnerBroker.findMany({ where: { partnerId: partner.id }, select: { broker: true } }),
    getProgramSettings(),
    prisma.partnerProduct.findMany({ where: { partnerId: partner.id, status: { not: 'ARCHIVED' } }, select: { id: true, name: true, type: true, status: true }, orderBy: { name: 'asc' } }),
    termsOf(partner.id),
  ]);
  return {
    packages, perks: perkDtos(), templates,
    brokers: brokers.map(b => ({ key: b.broker, label: brokerLabel(b.broker) })),
    lockedPerks: settings.lockedPerks, products, permissions: terms.permissions,
  };
}

async function clean(partner: { id: string; userId: string }, input: Partial<PartnerPackageInput>, prevEndsAt: Date | null = null) {
  let endsAt: Date | null | undefined;
  // Re-sending the last day a package already has changes nothing, so an ended
  // package can still be edited. A new last day can't be in the past (today is fine:
  // it runs to midnight UTC).
  if (input.endsOn !== undefined && input.endsOn !== (prevEndsAt ? lastDayOf(prevEndsAt) : null)) {
    endsAt = input.endsOn ? endsAtFromDay(input.endsOn) : null;
    if (endsAt && packageEnded(endsAt, new Date())) throw new ValidationError('The last day can’t be in the past.');
  }
  if (input.perks) {
    const bad = input.perks.filter(p => !isPerk(p));
    if (bad.length) throw new ValidationError(`Unknown feature: ${bad.join(', ')}`);
  }
  if (input.brokers) {
    const bad = input.brokers.filter(b => !BROKERS.some(x => x.key === b));
    if (bad.length) throw new ValidationError(`Unknown broker: ${bad.join(', ')}`);
  }
  if (input.productIds?.length) {
    const mine = await prisma.partnerProduct.count({ where: { id: { in: input.productIds }, partnerId: partner.id, status: { not: 'ARCHIVED' } } });
    if (mine !== new Set(input.productIds).size) throw new ValidationError('Packages can only include your own tools.');
  }
  if (input.templateIds?.length) {
    const mine = await prisma.strategyTemplate.count({ where: { id: { in: input.templateIds }, creatorId: partner.userId } });
    if (mine !== new Set(input.templateIds).size) throw new ValidationError('Packages can only include your own marketplace strategies.');
  }
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description || null } : {}),
    ...(input.perks ? { perks: [...new Set(input.perks)] } : {}),
    ...(input.templateIds ? { templateIds: [...new Set(input.templateIds)] } : {}),
    ...(input.productIds ? { productIds: [...new Set(input.productIds)] } : {}),
    ...(input.brokers ? { brokers: [...new Set(input.brokers)] } : {}),
    ...(input.requireActive !== undefined ? { requireActive: input.requireActive } : {}),
    ...(input.accessDays !== undefined ? { accessDays: input.accessDays ?? null } : {}),
    ...(endsAt !== undefined ? { endsAt } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

function assertHasContent(p: { perks: string[]; templateIds: string[]; productIds: string[] }) {
  if (!p.perks.length && !p.templateIds.length && !p.productIds.length) throw new ValidationError('Add at least one feature, tool or strategy to the package.');
}

export async function createPackage(partner: { id: string; userId: string }, input: PartnerPackageInput, actor: Actor = null): Promise<PartnerPackageDto> {
  const [live, { permissions }] = await Promise.all([
    prisma.partnerPackage.count({ where: { partnerId: partner.id, status: { not: 'ARCHIVED' } } }), termsOf(partner.id),
  ]);
  if (live >= permissions.maxPackages) throw new ConflictError(`You can have up to ${permissions.maxPackages} packages. Archive one first.`);
  const data = await clean(partner, input);
  assertHasContent({ perks: data.perks ?? [], templateIds: data.templateIds ?? [], productIds: data.productIds ?? [] });
  const p = await prisma.partnerPackage.create({ data: { partnerId: partner.id, name: input.name, ...data } });
  await logEvent({ kind: 'package.create', partnerId: partner.id, actor, message: `Package “${p.name}” created (${p.status.toLowerCase()})${p.endsAt ? `, last day ${lastDayOf(p.endsAt)}` : ''}` });
  if (p.status === 'LIVE') await recomputePartner(partner.id);
  return (await listPackageDtos(partner.id)).find(x => x.id === p.id)!;
}

export async function updatePackage(partner: { id: string; userId: string }, id: string, input: Partial<PartnerPackageInput>, actor: Actor = null): Promise<PartnerPackageDto> {
  const prev = await prisma.partnerPackage.findFirst({ where: { id, partnerId: partner.id } });
  if (!prev) throw new NotFoundError('Package not found');
  const data = await clean(partner, input, prev.endsAt);
  assertHasContent({ perks: data.perks ?? prev.perks, templateIds: data.templateIds ?? prev.templateIds, productIds: data.productIds ?? prev.productIds });
  const p = await prisma.partnerPackage.update({ where: { id }, data });
  const endChange = (prev.endsAt?.getTime() ?? null) !== (p.endsAt?.getTime() ?? null) ? `; last day ${p.endsAt ? lastDayOf(p.endsAt) : 'removed'}` : '';
  await logEvent({ kind: 'package.update', partnerId: partner.id, actor, message: `Package “${p.name}” updated${prev.status !== p.status ? ` (${prev.status.toLowerCase()} → ${p.status.toLowerCase()})` : ''}${endChange}` });
  await recomputePartner(partner.id);
  return (await listPackageDtos(partner.id)).find(x => x.id === p.id)!;
}

/** Marks one of the partner's own templates as visible to their package holders only. */
export async function setTemplateAudience(partner: { userId: string; id: string }, templateId: string, partnerOnly: boolean, actor: Actor = null) {
  const t = await prisma.strategyTemplate.findFirst({ where: { id: templateId, creatorId: partner.userId } });
  if (!t) throw new NotFoundError('Strategy not found');
  await prisma.strategyTemplate.update({ where: { id: t.id }, data: { partnerOnly } });
  await logEvent({ kind: 'template.audience', partnerId: partner.id, actor, message: `“${t.name}” is now ${partnerOnly ? 'for package holders only' : 'public'}` });
  return { id: t.id, name: t.name, status: t.status, partnerOnly };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminPackages(): Promise<AdminPackageRowDto[]> {
  const rows = await prisma.partnerPackage.findMany({ where: { status: { not: 'ARCHIVED' } }, include: { partner: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  const dtos = await toDtos(rows);
  return dtos.map((d, i) => ({ ...d, partnerId: rows[i]!.partnerId, partner: rows[i]!.partner.user.name }));
}

/** Pauses a package (or puts it back). Holders move to the grace period. */
export async function setAdminHold(id: string, adminHold: boolean, note: string | undefined, actor: { id: string; email: string }) {
  const p = await prisma.partnerPackage.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Package not found');
  await prisma.partnerPackage.update({ where: { id }, data: { adminHold, adminNote: adminHold ? note ?? null : null } });
  await logEvent({ kind: adminHold ? 'package.hold' : 'package.release', partnerId: p.partnerId, actor, message: `“${p.name}” ${adminHold ? 'paused by TRADElogs' : 'back on offer'}${note ? `: ${note}` : ''}` });
  await recomputePartner(p.partnerId);
}
