// Click capture (public referral link) and the one-time attribution of a new account.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import {
  chooseAttribution, firstName, hashIp, normalizeCode, readCookie, REF_COOKIE, signRefCookie, verifyRefCookie,
} from './partner.logic.js';

const TEN_MIN_MS = 10 * 60_000;

export interface ClickInput {
  code: string;
  channelSlug: string | null;
  ip: string;
  device: 'Mobile' | 'Desktop' | 'Tablet';
  country: string | null;
  referrer: string | null;
  existingCookie: string | null;
}

export interface ClickOutcome {
  /** Absolute URL to send the visitor to. */
  redirect: string;
  /** New tl_ref value to set, or null to leave the browser's cookie alone. */
  cookie: string | null;
  recorded: boolean;
}

/** Live code → partner, only for ACTIVE partners. */
export async function resolveActiveCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const row = await prisma.partnerCode.findUnique({
    where: { code },
    include: { partner: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!row || row.partner.status !== 'ACTIVE') return null;
  return { code: row.code, partner: row.partner };
}

export async function checkCode(rawCode: string): Promise<{ valid: boolean; partnerName: string | null }> {
  const hit = await resolveActiveCode(rawCode);
  return hit ? { valid: true, partnerName: firstName(hit.partner.user.name) } : { valid: false, partnerName: null };
}

/**
 * Records a referral-link click. First click wins: a still-valid cookie for any
 * active partner is kept, so a later link can't take over someone else's visitor.
 * Per-IP throttling stops a refresh loop from inflating counts; the redirect
 * always happens.
 */
export async function recordClick(input: ClickInput): Promise<ClickOutcome> {
  const home = env.APP_URL.replace(/\/+$/, '');
  const hit = await resolveActiveCode(input.code);
  if (!hit) return { redirect: `${home}/`, cookie: null, recorded: false };
  const redirect = `${home}/signup?ref=${encodeURIComponent(hit.code)}`;

  const prior = verifyRefCookie(env.AUTH_SECRET, input.existingCookie, env.PARTNER_COOKIE_DAYS);
  let keepPrior = false;
  if (prior) {
    const owner = await prisma.partner.findUnique({ where: { id: prior.partnerId }, select: { status: true } });
    keepPrior = owner?.status === 'ACTIVE';
  }

  const ipHash = hashIp(env.AUTH_SECRET, input.ip);
  const recent = await prisma.referralClick.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - TEN_MIN_MS) } } });
  if (recent >= env.PARTNER_CLICK_LIMIT) return { redirect, cookie: null, recorded: false };

  const channel = input.channelSlug
    ? await prisma.partnerChannel.findFirst({ where: { partnerId: hit.partner.id, slug: input.channelSlug.toLowerCase(), archivedAt: null } })
    : null;
  const fallback = channel ?? await prisma.partnerChannel.findFirst({ where: { partnerId: hit.partner.id, slug: '' } });

  const click = await prisma.referralClick.create({
    data: {
      partnerId: hit.partner.id, channelId: fallback?.id ?? null, code: hit.code, ipHash,
      device: input.device, country: input.country, referrer: input.referrer?.slice(0, 300) ?? null,
    },
  });
  const cookie = keepPrior ? null : signRefCookie(env.AUTH_SECRET, { clickId: click.id, partnerId: hit.partner.id, issuedAt: Date.now() });
  return { redirect, cookie, recorded: true };
}

/**
 * Called once, right after better-auth creates a user. Never throws — a referral
 * problem must not break signup. Returns what happened for logging/tests.
 */
export async function attributeNewUser(
  user: { id: string; referralCode?: string | null },
  cookieHeader: string | null | undefined,
): Promise<{ partnerId: string; source: 'LINK' | 'CODE' } | null> {
  try {
    const typed = normalizeCode(user.referralCode ?? null);
    const cookie = verifyRefCookie(env.AUTH_SECRET, readCookie(cookieHeader, REF_COOKIE), env.PARTNER_COOKIE_DAYS);
    const choice = chooseAttribution(typed, cookie);

    let target: { partnerId: string; code: string; channelId: string | null; clickId: string | null; source: 'LINK' | 'CODE' } | null = null;

    if (choice.kind === 'code') {
      const hit = await resolveActiveCode(choice.code);
      // Same partner as the link they clicked (the form pre-fills ?ref=): keep the
      // click so the channel and conversion are recorded.
      if (hit && cookie?.partnerId === hit.partner.id) {
        // fall through to the cookie branch below
      } else if (hit) {
        const def = await prisma.partnerChannel.findFirst({ where: { partnerId: hit.partner.id, slug: '' } });
        target = { partnerId: hit.partner.id, code: hit.code, channelId: def?.id ?? null, clickId: null, source: 'CODE' };
      }
    }
    // A mistyped or dead code shouldn't lose a genuine link click.
    if (!target && cookie) {
      const click = await prisma.referralClick.findUnique({ where: { id: cookie.clickId }, include: { partner: { select: { status: true } } } });
      if (click && click.partnerId === cookie.partnerId && click.partner.status === 'ACTIVE' && !click.convertedUserId) {
        target = { partnerId: click.partnerId, code: click.code, channelId: click.channelId, clickId: click.id, source: 'LINK' };
      }
    }
    if (!target) return null;

    const partner = await prisma.partner.findUnique({ where: { id: target.partnerId }, select: { userId: true } });
    if (!partner || partner.userId === user.id) return null; // no self-referral

    await prisma.$transaction(async tx => {
      await tx.referral.create({
        data: { userId: user.id, partnerId: target!.partnerId, channelId: target!.channelId, code: target!.code, source: target!.source, clickId: target!.clickId },
      });
      if (target!.clickId) await tx.referralClick.update({ where: { id: target!.clickId }, data: { convertedUserId: user.id } });
    });
    logger.info('[partners] referral attributed', { userId: user.id, partnerId: target.partnerId, source: target.source });
    return { partnerId: target.partnerId, source: target.source };
  } catch (err) {
    logger.warn('[partners] attribution failed', { userId: user.id, err });
    return null;
  }
}
