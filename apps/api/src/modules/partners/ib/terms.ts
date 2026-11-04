// A partner's commercial terms: what they may offer and the share of sales they keep.
import { prisma } from '@tradinjournal/db';
import type { PartnerPermissionsDto } from '@tradinjournal/contracts';
import { getProgramSettings } from './settings.js';
import { logEvent } from './events.js';

export const DEFAULT_PERMISSIONS: PartnerPermissionsDto = { canOfferProducts: true, canSellPackages: true, maxPackages: 10 };

export function permissionsOf(raw: unknown): PartnerPermissionsDto {
  const v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    canOfferProducts: typeof v.canOfferProducts === 'boolean' ? v.canOfferProducts : DEFAULT_PERMISSIONS.canOfferProducts,
    canSellPackages: typeof v.canSellPackages === 'boolean' ? v.canSellPackages : DEFAULT_PERMISSIONS.canSellPackages,
    maxPackages: Number.isInteger(v.maxPackages) ? Number(v.maxPackages) : DEFAULT_PERMISSIONS.maxPackages,
  };
}

/** Percent of a sale the partner keeps. */
export async function partnerSharePct(partnerId: string): Promise<number> {
  const [p, s] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { revenueSharePct: true } }),
    getProgramSettings(),
  ]);
  return p?.revenueSharePct ?? 100 - s.platformSharePct;
}

export async function termsOf(partnerId: string): Promise<{ permissions: PartnerPermissionsDto; sharePct: number }> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { permissions: true } });
  return { permissions: permissionsOf(p?.permissions), sharePct: await partnerSharePct(partnerId) };
}

export async function setTerms(partnerId: string, input: { revenueSharePct: number | null; permissions: PartnerPermissionsDto }, actor: { id: string; email: string }) {
  await prisma.partner.update({ where: { id: partnerId }, data: { revenueSharePct: input.revenueSharePct, permissions: input.permissions as object } });
  await logEvent({
    kind: 'partner.terms', partnerId, actor,
    message: `Terms: ${input.revenueSharePct == null ? 'default share' : `keeps ${input.revenueSharePct}% of sales`}; tools ${input.permissions.canOfferProducts ? 'on' : 'off'}, paid packages ${input.permissions.canSellPackages ? 'on' : 'off'}, up to ${input.permissions.maxPackages} packages`,
  });
  return termsOf(partnerId);
}
