// What an admin lets a partner do: offer tools, and how many packages they may run.
import { prisma } from '@tradinjournal/db';
import type { PartnerPermissionsDto } from '@tradinjournal/contracts';
import { logEvent } from './events.js';

export const DEFAULT_PERMISSIONS: PartnerPermissionsDto = { canOfferProducts: true, maxPackages: 10 };

export function permissionsOf(raw: unknown): PartnerPermissionsDto {
  const v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    canOfferProducts: typeof v.canOfferProducts === 'boolean' ? v.canOfferProducts : DEFAULT_PERMISSIONS.canOfferProducts,
    maxPackages: Number.isInteger(v.maxPackages) ? Number(v.maxPackages) : DEFAULT_PERMISSIONS.maxPackages,
  };
}

export async function termsOf(partnerId: string): Promise<{ permissions: PartnerPermissionsDto }> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { permissions: true } });
  return { permissions: permissionsOf(p?.permissions) };
}

export async function setTerms(partnerId: string, input: { permissions: PartnerPermissionsDto }, actor: { id: string; email: string }) {
  await prisma.partner.update({ where: { id: partnerId }, data: { permissions: input.permissions as object } });
  await logEvent({
    kind: 'partner.terms', partnerId, actor,
    message: `Permissions: tools ${input.permissions.canOfferProducts ? 'on' : 'off'}, up to ${input.permissions.maxPackages} packages`,
  });
  return termsOf(partnerId);
}
