// Paid partner packages: Razorpay checkout, subscriptions, the partner's share of each
// sale (commission ledger) and payouts. A client can only buy once every other
// condition of the package is met. Without Razorpay keys, an admin can still grant access.
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@tradinjournal/db';
import type { AdminFinanceDto, CheckoutDto, PartnerEarningsDto, SubscriptionDto } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { decryptSecret, encryptSecret } from '../../../lib/secrets.js';
import { extendPeriod, splitSale } from './ib.logic.js';
import { getProgramSettings } from './settings.js';
import { partnerSharePct } from './terms.js';
import { logEvent } from './events.js';

const DAY_MS = 86_400_000;
type Actor = { id: string; email: string };

export const paymentsEnabled = () => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

type SubRow = Awaited<ReturnType<typeof prisma.packageSubscription.findFirstOrThrow>> & { package: { name: string } };
export function toSubDto(s: SubRow): SubscriptionDto {
  return {
    id: s.id, packageId: s.packageId, packageName: s.package.name, status: s.status, priceCents: s.priceCents, currency: s.currency, periodDays: s.periodDays,
    provider: s.provider, startedAt: s.startedAt?.toISOString() ?? null, currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null, cancelledAt: s.cancelledAt?.toISOString() ?? null,
  };
}

/** Is this subscription paid up right now? */
export function isPaidUp(s: { status: string; currentPeriodEnd: Date | null } | null | undefined, now = new Date()): boolean {
  return !!s && (s.status === 'ACTIVE' || s.status === 'CANCELLED') && !!s.currentPeriodEnd && s.currentPeriodEnd > now;
}

// ── Razorpay ──────────────────────────────────────────────────────────────────

async function razorpay<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${env.RAZORPAY_API_URL.replace(/\/+$/, '')}${path}`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({})) as { error?: { description?: string } } & T;
  if (!res.ok) throw new AppError(502, 'PAYMENT_PROVIDER', `Payment provider error: ${json.error?.description ?? res.status}`);
  return json;
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checkout signature: HMAC-SHA256(order_id|payment_id, key secret). */
export function checkoutSignatureOk(orderId: string, paymentId: string, signature: string, secret = env.RAZORPAY_KEY_SECRET ?? ''): boolean {
  if (!secret) return false;
  return safeEq(createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export function webhookSignatureOk(raw: Buffer | string, signature: string, secret = env.RAZORPAY_WEBHOOK_SECRET ?? ''): boolean {
  if (!secret || !signature) return false;
  return safeEq(createHmac('sha256', secret).update(raw).digest('hex'), signature);
}

/**
 * Starts a purchase. `eligible` is decided by the caller (access.service), which knows
 * every non-payment condition; a client can't pay for something they can't use.
 */
export async function startCheckout(user: { id: string; email: string; name: string }, packageId: string, eligible: boolean): Promise<CheckoutDto> {
  const pkg = await prisma.partnerPackage.findUnique({ where: { id: packageId }, include: { partner: { include: { user: { select: { name: true } } } } } });
  if (!pkg || pkg.status !== 'LIVE' || pkg.adminHold) throw new NotFoundError('That package isn’t on offer.');
  if (pkg.priceCents <= 0) throw new ConflictError('This package is free: it unlocks by itself once you qualify.');
  if (!eligible) throw new ConflictError('Meet the other conditions first; then you can subscribe.');
  if (!paymentsEnabled()) throw new AppError(503, 'PAYMENTS_OFF', 'Online payment isn’t switched on yet. Contact your partner or TRADElogs support to get access.');
  const ref = await prisma.referral.findUnique({ where: { userId: user.id } });
  if (ref?.partnerId !== pkg.partnerId) throw new ConflictError('This package is for another partner’s clients.');
  const sub = await prisma.packageSubscription.upsert({
    where: { userId_packageId: { userId: user.id, packageId } },
    create: { userId: user.id, packageId, partnerId: pkg.partnerId, priceCents: pkg.priceCents, currency: pkg.currency, periodDays: pkg.periodDays, provider: 'razorpay' },
    // Renewal: the price at the time of payment applies.
    update: { priceCents: pkg.priceCents, currency: pkg.currency, periodDays: pkg.periodDays, provider: 'razorpay', cancelledAt: null },
  });
  const order = await razorpay<{ id: string; amount: number; currency: string }>('/orders', {
    amount: pkg.priceCents, currency: pkg.currency, receipt: sub.id.slice(0, 40), notes: { subscriptionId: sub.id, packageId, userId: user.id },
  });
  await prisma.payment.create({
    data: { subscriptionId: sub.id, userId: user.id, partnerId: pkg.partnerId, amountCents: pkg.priceCents, currency: pkg.currency, provider: 'razorpay', providerOrderId: order.id },
  });
  return {
    provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID!, orderId: order.id, amount: order.amount, currency: order.currency,
    name: `${pkg.partner.user.name} · TRADElogs`, description: pkg.name, prefill: { name: user.name, email: user.email },
  };
}

/**
 * Records a captured payment once (checkout callback and webhook both call this):
 * extends the subscription, splits the sale and books the partner's share.
 */
export async function markPaid(orderId: string, paymentId: string, now = new Date()): Promise<{ userId: string; already: boolean }> {
  const pay = await prisma.payment.findUnique({ where: { providerOrderId: orderId }, include: { subscription: true } });
  if (!pay) throw new NotFoundError('Payment not found');
  if (pay.status === 'PAID') return { userId: pay.userId, already: true };
  const [share, settings] = await Promise.all([partnerSharePct(pay.partnerId), getProgramSettings()]);
  const { partnerCents, platformCents } = splitSale(pay.amountCents, share);
  const end = extendPeriod(pay.subscription.status === 'ACTIVE' || pay.subscription.status === 'CANCELLED' ? pay.subscription.currentPeriodEnd : null, pay.subscription.periodDays, now);
  await prisma.$transaction([
    prisma.payment.update({ where: { id: pay.id }, data: { status: 'PAID', providerPaymentId: paymentId, paidAt: now, partnerShareCents: partnerCents, platformShareCents: platformCents } }),
    prisma.packageSubscription.update({ where: { id: pay.subscriptionId }, data: { status: 'ACTIVE', startedAt: pay.subscription.startedAt ?? now, currentPeriodEnd: end, cancelledAt: null } }),
    prisma.partnerCommission.create({
      data: { partnerId: pay.partnerId, kind: 'SALE', amountCents: partnerCents, currency: pay.currency, paymentId: pay.id, payableAt: new Date(now.getTime() + settings.refundDays * DAY_MS) },
    }),
  ]);
  await logEvent({ kind: 'sale.paid', partnerId: pay.partnerId, userId: pay.userId, message: `Package sale ${(pay.amountCents / 100).toFixed(2)} ${pay.currency}: partner ${(partnerCents / 100).toFixed(2)}, TRADElogs ${(platformCents / 100).toFixed(2)}` });
  return { userId: pay.userId, already: false };
}

export async function verifyCheckout(userId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const pay = await prisma.payment.findUnique({ where: { providerOrderId: input.orderId } });
  if (!pay || pay.userId !== userId) throw new NotFoundError('Payment not found');
  if (!checkoutSignatureOk(input.orderId, input.paymentId, input.signature)) throw new ValidationError('The payment confirmation didn’t check out. If you were charged, it will still be applied within a few minutes.');
  return markPaid(input.orderId, input.paymentId);
}

/** Razorpay webhook (order.paid / payment.captured / payment.failed). */
export async function handleWebhook(raw: Buffer, signature: string): Promise<{ ok: boolean; userId?: string }> {
  if (!webhookSignatureOk(raw, signature)) return { ok: false };
  let body: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try { body = JSON.parse(raw.toString('utf8')); } catch { return { ok: false }; }
  const ent = body.payload?.payment?.entity;
  if (!ent?.order_id || !ent.id) return { ok: true };
  if (body.event === 'payment.failed') {
    await prisma.payment.updateMany({ where: { providerOrderId: ent.order_id, status: 'CREATED' }, data: { status: 'FAILED', providerPaymentId: ent.id } });
    return { ok: true };
  }
  if (body.event === 'payment.captured' || body.event === 'order.paid') {
    try { return { ok: true, userId: (await markPaid(ent.order_id, ent.id)).userId }; }
    catch (err) { logger.warn('[payments] webhook for unknown order', { order: ent.order_id, err }); return { ok: true }; }
  }
  return { ok: true };
}

/** Cancel: access runs to the end of the paid period, then stops. No automatic refunds. */
export async function cancelSubscription(userId: string, id: string) {
  const s = await prisma.packageSubscription.findFirst({ where: { id, userId } });
  if (!s) throw new NotFoundError('Subscription not found');
  if (s.status !== 'ACTIVE') throw new ConflictError('Only an active subscription can be cancelled.');
  await prisma.packageSubscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  await logEvent({ kind: 'subscription.cancel', partnerId: s.partnerId, userId, message: `Subscription cancelled; access runs until ${s.currentPeriodEnd?.toISOString().slice(0, 10)}` });
}

/** Admin: give a client a package for N days without payment (comp, offline payment…). */
export async function grantSubscription(input: { email: string; packageId: string; days: number; note?: string }, actor: Actor) {
  const [user, pkg] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.partnerPackage.findUnique({ where: { id: input.packageId } }),
  ]);
  if (!user) throw new NotFoundError('No TRADElogs account uses that email.');
  if (!pkg) throw new NotFoundError('Package not found');
  const prev = await prisma.packageSubscription.findUnique({ where: { userId_packageId: { userId: user.id, packageId: pkg.id } } });
  const now = new Date();
  const end = new Date((prev?.currentPeriodEnd && prev.currentPeriodEnd > now ? prev.currentPeriodEnd : now).getTime() + input.days * DAY_MS);
  await prisma.packageSubscription.upsert({
    where: { userId_packageId: { userId: user.id, packageId: pkg.id } },
    create: { userId: user.id, packageId: pkg.id, partnerId: pkg.partnerId, priceCents: 0, currency: pkg.currency, periodDays: input.days, provider: 'manual', status: 'ACTIVE', startedAt: now, currentPeriodEnd: end },
    update: { status: 'ACTIVE', currentPeriodEnd: end, cancelledAt: null, provider: prev?.provider ?? 'manual' },
  });
  await logEvent({ kind: 'subscription.grant', partnerId: pkg.partnerId, userId: user.id, actor, message: `${pkg.name} granted for ${input.days} days${input.note ? `: ${input.note}` : ''}` });
  return { userId: user.id };
}

/** Admin: refund a payment. The partner's share is voided, or clawed back if already paid out. */
export async function refundPayment(id: string, actor: Actor) {
  const pay = await prisma.payment.findUnique({ where: { id }, include: { commission: true } });
  if (!pay || pay.status !== 'PAID') throw new ConflictError('Only a paid payment can be refunded.');
  const c = pay.commission;
  await prisma.$transaction([
    prisma.payment.update({ where: { id }, data: { status: 'REFUNDED' } }),
    prisma.packageSubscription.update({ where: { id: pay.subscriptionId }, data: { status: 'EXPIRED', currentPeriodEnd: new Date() } }),
    ...(c && c.status !== 'PAID' ? [prisma.partnerCommission.update({ where: { id: c.id }, data: { status: 'VOID', note: 'Sale refunded' } })] : []),
    ...(c && c.status === 'PAID' ? [prisma.partnerCommission.create({ data: { partnerId: pay.partnerId, kind: 'ADJUSTMENT', amountCents: -c.amountCents, currency: c.currency, status: 'PAYABLE', note: 'Refund clawback', payableAt: new Date() } })] : []),
  ]);
  // A refund ends access now, without the usual grace period.
  const sub = await prisma.packageSubscription.findUnique({ where: { id: pay.subscriptionId }, select: { packageId: true } });
  if (sub) await prisma.clientEntitlement.updateMany({ where: { userId: pay.userId, packageId: sub.packageId }, data: { status: 'SUSPENDED', suspendedAt: new Date(), graceUntil: null, reason: 'Payment refunded.' } });
  await logEvent({ kind: 'sale.refund', partnerId: pay.partnerId, userId: pay.userId, actor, message: `Payment of ${(pay.amountCents / 100).toFixed(2)} ${pay.currency} refunded` });
  return { userId: pay.userId };
}

// ── Scheduled housekeeping ────────────────────────────────────────────────────

/** Expires lapsed subscriptions, releases shares past the refund window, drafts payouts. */
export async function moneyCycle(now = new Date()): Promise<{ expired: string[]; payable: number; drafts: number }> {
  const lapsed = await prisma.packageSubscription.findMany({ where: { status: { in: ['ACTIVE', 'CANCELLED'] }, currentPeriodEnd: { lte: now } }, select: { id: true, userId: true } });
  if (lapsed.length) await prisma.packageSubscription.updateMany({ where: { id: { in: lapsed.map(l => l.id) } }, data: { status: 'EXPIRED' } });
  const { count: payable } = await prisma.partnerCommission.updateMany({ where: { status: 'PENDING', payableAt: { lte: now } }, data: { status: 'PAYABLE' } });
  const { payoutMinimumCents } = await getProgramSettings();
  const groups = await prisma.partnerCommission.groupBy({ by: ['partnerId', 'currency'], where: { status: 'PAYABLE', payoutId: null }, _sum: { amountCents: true } });
  let drafts = 0;
  for (const g of groups) {
    const sum = g._sum.amountCents ?? 0;
    if (sum < Math.max(1, payoutMinimumCents)) continue;
    if (await prisma.payout.count({ where: { partnerId: g.partnerId, status: 'DRAFT', currency: g.currency } })) continue;
    const payout = await prisma.payout.create({ data: { partnerId: g.partnerId, amountCents: sum, currency: g.currency } });
    await prisma.partnerCommission.updateMany({ where: { partnerId: g.partnerId, currency: g.currency, status: 'PAYABLE', payoutId: null }, data: { payoutId: payout.id } });
    await logEvent({ kind: 'payout.draft', partnerId: g.partnerId, message: `Payout of ${(sum / 100).toFixed(2)} ${g.currency} drafted` });
    drafts++;
  }
  return { expired: [...new Set(lapsed.map(l => l.userId))], payable, drafts };
}

export async function markPayoutPaid(id: string, reference: string, actor: Actor) {
  const p = await prisma.payout.findUnique({ where: { id } });
  if (!p || p.status !== 'DRAFT') throw new ConflictError('Only a draft payout can be marked paid.');
  await prisma.$transaction([
    prisma.payout.update({ where: { id }, data: { status: 'PAID', reference, paidAt: new Date(), paidBy: actor.email } }),
    prisma.partnerCommission.updateMany({ where: { payoutId: id }, data: { status: 'PAID' } }),
  ]);
  await logEvent({ kind: 'payout.paid', partnerId: p.partnerId, actor, message: `Payout of ${(p.amountCents / 100).toFixed(2)} ${p.currency} paid (${reference})` });
}

export async function cancelPayout(id: string, actor: Actor) {
  const p = await prisma.payout.findUnique({ where: { id } });
  if (!p || p.status !== 'DRAFT') throw new ConflictError('Only a draft payout can be cancelled.');
  await prisma.$transaction([
    prisma.partnerCommission.updateMany({ where: { payoutId: id }, data: { payoutId: null } }),
    prisma.payout.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ]);
  await logEvent({ kind: 'payout.cancel', partnerId: p.partnerId, actor, message: 'Draft payout cancelled; its lines are payable again' });
}

export async function addAdjustment(partnerId: string, amountCents: number, note: string, actor: Actor) {
  const { currency } = await getProgramSettings();
  await prisma.partnerCommission.create({ data: { partnerId, kind: 'ADJUSTMENT', amountCents, currency, status: 'PAYABLE', note, payableAt: new Date() } });
  await logEvent({ kind: 'commission.adjust', partnerId, actor, message: `Adjustment ${(amountCents / 100).toFixed(2)} ${currency}: ${note}` });
}

export async function setPayoutDetails(partnerId: string, details: string) {
  await prisma.partner.update({ where: { id: partnerId }, data: { payoutDetails: encryptSecret(details) } });
  await logEvent({ kind: 'payout.details', partnerId, message: 'Payout details updated' });
}

function readDetails(stored: string | null): string | null {
  if (!stored) return null;
  try { return decryptSecret(stored); } catch { return null; }
}

// ── Read models ───────────────────────────────────────────────────────────────

export async function partnerEarnings(partnerId: string): Promise<PartnerEarningsDto> {
  const [settings, share, ib, ledger, payouts, partner, sales] = await Promise.all([
    getProgramSettings(), partnerSharePct(partnerId),
    prisma.ibEarning.findMany({ where: { partnerId }, orderBy: { earnedAt: 'desc' }, take: 1000 }),
    prisma.partnerCommission.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, take: 100, include: { payment: { include: { subscription: { include: { package: { select: { name: true } } } } } } } }),
    prisma.payout.findMany({ where: { partnerId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.partner.findUnique({ where: { id: partnerId }, select: { payoutDetails: true } }),
    prisma.payment.aggregate({ where: { partnerId, status: 'PAID' }, _count: { _all: true }, _sum: { amountCents: true, partnerShareCents: true } }),
  ]);
  const byMonth = new Map<string, number>();
  for (const e of ib) byMonth.set(e.earnedAt.toISOString().slice(0, 7), (byMonth.get(e.earnedAt.toISOString().slice(0, 7)) ?? 0) + e.amount);
  const bal = await prisma.partnerCommission.groupBy({ by: ['status'], where: { partnerId }, _sum: { amountCents: true } });
  const b = (s: string) => bal.find(x => x.status === s)?._sum.amountCents ?? 0;
  const ibCurrency = ib[0]?.currency ?? settings.currency;
  return {
    currency: settings.currency, revenueSharePct: share,
    ib: {
      total: Math.round(ib.reduce((n, e) => n + e.amount, 0) * 100) / 100, currency: ibCurrency,
      byMonth: [...byMonth].sort((a, z) => a[0].localeCompare(z[0])).slice(-12).map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 })),
      recent: ib.slice(0, 20).map(e => ({ id: e.id, at: e.earnedAt.toISOString(), accountId: e.accountId, amount: e.amount, currency: e.currency, source: e.source })),
    },
    sales: { count: sales._count._all, grossCents: sales._sum.amountCents ?? 0, shareCents: sales._sum.partnerShareCents ?? 0 },
    balance: { pendingCents: b('PENDING'), payableCents: b('PAYABLE'), paidCents: b('PAID') },
    ledger: ledger.map(l => ({
      id: l.id, at: l.createdAt.toISOString(), amountCents: l.amountCents, currency: l.currency, status: l.status,
      label: l.kind === 'SALE' ? `Sale · ${l.payment?.subscription.package.name ?? 'package'}` : `Adjustment · ${l.note ?? ''}`,
    })),
    payouts: payouts.map(p => ({ id: p.id, at: p.createdAt.toISOString(), amountCents: p.amountCents, currency: p.currency, status: p.status, reference: p.reference, paidAt: p.paidAt?.toISOString() ?? null })),
    hasPayoutDetails: !!partner?.payoutDetails,
    payoutMinimumCents: settings.payoutMinimumCents,
  };
}

export async function adminFinance(): Promise<AdminFinanceDto> {
  const [settings, payments, payouts, paid, balances, ib] = await Promise.all([
    getProgramSettings(),
    prisma.payment.findMany({
      where: { status: { not: 'CREATED' } }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { subscription: { include: { package: { select: { name: true } }, user: { select: { email: true } }, partner: { include: { user: { select: { name: true } } } } } } },
    }),
    prisma.payout.findMany({ where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 200, include: { partner: { include: { user: { select: { name: true } } } } } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true, platformShareCents: true, partnerShareCents: true } }),
    prisma.partnerCommission.groupBy({ by: ['partnerId', 'status'], where: { status: { in: ['PENDING', 'PAYABLE'] } }, _sum: { amountCents: true } }),
    prisma.ibEarning.aggregate({ _sum: { amount: true } }),
  ]);
  const names = new Map((await prisma.partner.findMany({ where: { id: { in: [...new Set(balances.map(b => b.partnerId))] } }, include: { user: { select: { name: true } } } })).map(p => [p.id, p.user.name]));
  const byPartner = new Map<string, { payableCents: number; pendingCents: number }>();
  for (const b of balances) {
    const cur = byPartner.get(b.partnerId) ?? { payableCents: 0, pendingCents: 0 };
    if (b.status === 'PAYABLE') cur.payableCents += b._sum.amountCents ?? 0; else cur.pendingCents += b._sum.amountCents ?? 0;
    byPartner.set(b.partnerId, cur);
  }
  const paidOut = await prisma.payout.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true } });
  return {
    currency: settings.currency,
    totals: {
      grossCents: paid._sum.amountCents ?? 0, platformCents: paid._sum.platformShareCents ?? 0, partnerCents: paid._sum.partnerShareCents ?? 0,
      payableCents: [...byPartner.values()].reduce((n, b) => n + b.payableCents, 0), paidOutCents: paidOut._sum.amountCents ?? 0,
      ibReported: Math.round((ib._sum.amount ?? 0) * 100) / 100,
    },
    payments: payments.map(p => ({
      id: p.id, at: (p.paidAt ?? p.createdAt).toISOString(), partner: p.subscription.partner.user.name, client: p.subscription.user.email,
      packageName: p.subscription.package.name, amountCents: p.amountCents, currency: p.currency, status: p.status, provider: p.provider,
    })),
    payouts: payouts.map(p => ({
      id: p.id, partnerId: p.partnerId, partner: p.partner.user.name, amountCents: p.amountCents, currency: p.currency, status: p.status,
      createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null, reference: p.reference,
      payoutDetails: p.status === 'DRAFT' ? readDetails(p.partner.payoutDetails) : null,
    })),
    balances: [...byPartner].map(([partnerId, b]) => ({ partnerId, partner: names.get(partnerId) ?? partnerId, ...b })),
    paymentsEnabled: paymentsEnabled(),
  };
}
