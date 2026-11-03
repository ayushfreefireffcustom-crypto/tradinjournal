// What a partner offers their verified clients.
import { prisma } from '@tradinjournal/db';
import type { PartnerPackageDto, PartnerPackageInput, PartnerPackagesDto } from '@tradinjournal/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { BROKERS, brokerLabel } from './brokers.js';
import { isPerk, perkDtos } from './perks.js';
import { getProgramSettings } from './settings.js';
import { logEvent } from './events.js';
import { recomputePartner } from './access.service.js';

const MAX_PACKAGES = 10;

type Actor = { id: string; email: string } | null;

export async function listPackageDtos(partnerId: string): Promise<PartnerPackageDto[]> {
  const [rows, counts] = await Promise.all([
    prisma.partnerPackage.findMany({ where: { partnerId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] }),
    prisma.clientEntitlement.groupBy({ by: ['packageId', 'status'], where: { partnerId }, _count: { _all: true } }),
  ]);
  const n = (id: string, s: string) => counts.find(c => c.packageId === id && c.status === s)?._count._all ?? 0;
  return rows.map(p => ({
    id: p.id, name: p.name, description: p.description, perks: p.perks, templateIds: p.templateIds, brokers: p.brokers,
    requireActive: p.requireActive, accessDays: p.accessDays, status: p.status,
    holders: n(p.id, 'ACTIVE') + n(p.id, 'GRACE'), inGrace: n(p.id, 'GRACE'), createdAt: p.createdAt.toISOString(),
  }));
}

export async function packagesPage(partner: { id: string; userId: string }): Promise<PartnerPackagesDto> {
  const [packages, templates, brokers, settings] = await Promise.all([
    listPackageDtos(partner.id),
    prisma.strategyTemplate.findMany({ where: { creatorId: partner.userId }, select: { id: true, name: true, status: true, partnerOnly: true }, orderBy: { createdAt: 'desc' } }),
    prisma.partnerBroker.findMany({ where: { partnerId: partner.id }, select: { broker: true } }),
    getProgramSettings(),
  ]);
  return {
    packages, perks: perkDtos(), templates,
    brokers: brokers.map(b => ({ key: b.broker, label: brokerLabel(b.broker) })),
    lockedPerks: settings.lockedPerks,
  };
}

async function clean(partner: { id: string; userId: string }, input: Partial<PartnerPackageInput>) {
  if (input.perks) {
    const bad = input.perks.filter(p => !isPerk(p));
    if (bad.length) throw new ValidationError(`Unknown feature: ${bad.join(', ')}`);
  }
  if (input.brokers) {
    const bad = input.brokers.filter(b => !BROKERS.some(x => x.key === b));
    if (bad.length) throw new ValidationError(`Unknown broker: ${bad.join(', ')}`);
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
    ...(input.brokers ? { brokers: [...new Set(input.brokers)] } : {}),
    ...(input.requireActive !== undefined ? { requireActive: input.requireActive } : {}),
    ...(input.accessDays !== undefined ? { accessDays: input.accessDays ?? null } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

function assertHasContent(p: { perks: string[]; templateIds: string[] }) {
  if (!p.perks.length && !p.templateIds.length) throw new ValidationError('Add at least one feature or strategy to the package.');
}

export async function createPackage(partner: { id: string; userId: string }, input: PartnerPackageInput, actor: Actor = null): Promise<PartnerPackageDto> {
  const live = await prisma.partnerPackage.count({ where: { partnerId: partner.id, status: { not: 'ARCHIVED' } } });
  if (live >= MAX_PACKAGES) throw new ConflictError(`You can have up to ${MAX_PACKAGES} packages. Archive one first.`);
  const data = await clean(partner, input);
  assertHasContent({ perks: data.perks ?? [], templateIds: data.templateIds ?? [] });
  const p = await prisma.partnerPackage.create({ data: { partnerId: partner.id, name: input.name, ...data } });
  await logEvent({ kind: 'package.create', partnerId: partner.id, actor, message: `Package “${p.name}” created (${p.status.toLowerCase()})` });
  if (p.status === 'LIVE') await recomputePartner(partner.id);
  return (await listPackageDtos(partner.id)).find(x => x.id === p.id)!;
}

export async function updatePackage(partner: { id: string; userId: string }, id: string, input: Partial<PartnerPackageInput>, actor: Actor = null): Promise<PartnerPackageDto> {
  const prev = await prisma.partnerPackage.findFirst({ where: { id, partnerId: partner.id } });
  if (!prev) throw new NotFoundError('Package not found');
  const data = await clean(partner, input);
  assertHasContent({ perks: data.perks ?? prev.perks, templateIds: data.templateIds ?? prev.templateIds });
  const p = await prisma.partnerPackage.update({ where: { id }, data });
  await logEvent({ kind: 'package.update', partnerId: partner.id, actor, message: `Package “${p.name}” updated${prev.status !== p.status ? ` (${prev.status.toLowerCase()} → ${p.status.toLowerCase()})` : ''}` });
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
