// The account itself (H6, H8, H9): profile, product-tour state, a full data
// export, and deleting the account with an emailed code. Deletion removes the
// user's rows from every table, including the ones keyed by userId without a
// foreign key, and refuses while it would leave other people or open trading
// in a bad state (followers copying them, their own copies, live strategies,
// partner referrals).
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { sendEmail } from '../../lib/email/client.js';
import { accountDeletedEmail, deleteAccountOtpEmail } from '../../lib/email/templates.js';
import { recordActivity, type ActivityContext } from './activity.service.js';

// ── Profile (H8) ──
export interface ProfileDto { name: string; email: string; phone: string | null; timezone: string; createdAt: string; twoFactorEnabled: boolean; hasPassword: boolean; signInMethods: string[] }

export const validTimezone = (tz: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(tz); } catch { return false; }
};

export async function getProfile(userId: string): Promise<ProfileDto> {
  const [u, pref, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.notificationPreference.findUnique({ where: { userId }, select: { timezone: true } }),
    prisma.account.findMany({ where: { userId }, select: { providerId: true, password: true } }),
  ]);
  if (!u) throw new NotFoundError('Account not found');
  return {
    name: u.name, email: u.email, phone: u.phone, timezone: pref?.timezone ?? 'UTC', createdAt: u.createdAt.toISOString(),
    twoFactorEnabled: !!u.twoFactorEnabled, hasPassword: accounts.some((a) => a.providerId === 'credential' && !!a.password),
    signInMethods: [...new Set(accounts.map((a) => (a.providerId === 'credential' ? 'password' : a.providerId)))],
  };
}

export async function updateProfile(userId: string, input: { name?: string; phone?: string | null; timezone?: string }, ctx: ActivityContext): Promise<ProfileDto> {
  if (input.timezone != null && !validTimezone(input.timezone)) throw new ValidationError('That isn’t a timezone we recognise.');
  const changed: string[] = [];
  if (input.name != null || input.phone !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { ...(input.name != null ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}) } });
    if (input.name != null) changed.push('name');
    if (input.phone !== undefined) changed.push('phone');
  }
  if (input.timezone != null) {
    // One timezone for the whole account: alerts, loss limits and reports already read it from here.
    await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, timezone: input.timezone }, update: { timezone: input.timezone } });
    changed.push('timezone');
  }
  if (changed.length) await recordActivity(userId, 'profile_updated', `Changed ${changed.join(', ')}`, ctx);
  return getProfile(userId);
}

// ── Product tour (H9) ──
export interface TourState { seen: string[]; dismissed: boolean }
const asTour = (v: unknown): TourState => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<TourState>;
  return { seen: Array.isArray(o.seen) ? o.seen.filter((x): x is string => typeof x === 'string').slice(0, 50) : [], dismissed: o.dismissed === true };
};
export async function getTour(userId: string): Promise<TourState> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tour: true } });
  return asTour(u?.tour);
}
export async function updateTour(userId: string, input: { seen?: string[]; dismissed?: boolean; reset?: boolean }): Promise<TourState> {
  const cur = input.reset ? { seen: [], dismissed: false } : await getTour(userId);
  const next: TourState = { seen: [...new Set([...cur.seen, ...(input.seen ?? [])])].slice(0, 50), dismissed: input.dismissed ?? cur.dismissed };
  await prisma.user.update({ where: { id: userId }, data: { tour: next as object } });
  return next;
}

// ── Data export (H6) ──
const omit = <T extends Record<string, unknown>>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Everything stored for the account, minus secrets (exchange keys, broker passwords, key hashes, 2FA). */
export async function exportData(userId: string, ctx: ActivityContext) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('Account not found');
  const brokers = await prisma.brokerAccount.findMany({ where: { userId } });
  const brokerIds = brokers.map((b) => b.id);
  const conns = await prisma.exchangeConnection.findMany({ where: { userId } });
  const [trades, executions, balance, journal, aiConvs, prefs, newsPrefs, watch, alerts, indAlerts, screens, strategies, deployments, follows, leaders, orders, webhooks, apiKeys, sessions, authAccounts, activity, feedback, notifications] = await Promise.all([
    prisma.trade.findMany({ where: { brokerAccountId: { in: brokerIds } } }),
    prisma.execution.findMany({ where: { brokerAccountId: { in: brokerIds } } }),
    prisma.balanceEvent.findMany({ where: { brokerAccountId: { in: brokerIds } } }),
    prisma.journalEntry.findMany({ where: { userId } }),
    prisma.aiConversation.findMany({ where: { userId }, include: { messages: true } }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.newsPreference.findUnique({ where: { userId } }),
    prisma.watchlist.findMany({ where: { userId } }),
    prisma.priceAlert.findMany({ where: { userId } }),
    prisma.indicatorAlert.findMany({ where: { userId } }),
    prisma.savedScreen.findMany({ where: { userId } }),
    prisma.strategy.findMany({ where: { userId }, include: { versions: true } }),
    prisma.strategyDeployment.findMany({ where: { userId }, include: { trades: true } }),
    prisma.copyFollow.findMany({ where: { userId } }),
    prisma.copyLeader.findMany({ where: { userId } }),
    prisma.exchangeOrder.findMany({ where: { userId } }),
    prisma.tradingWebhook.findMany({ where: { userId } }),
    prisma.apiKey.findMany({ where: { userId } }),
    prisma.session.findMany({ where: { userId } }),
    prisma.account.findMany({ where: { userId } }),
    prisma.activityEvent.findMany({ where: { userId }, orderBy: { at: 'desc' } }),
    prisma.feedback.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ]);
  await recordActivity(userId, 'data_exported', 'Downloaded a copy of your data', ctx);
  return {
    exportedAt: new Date().toISOString(),
    note: 'Everything TRADElogs stores for your account. Exchange keys, broker passwords, API key hashes and two-factor secrets are left out on purpose.',
    profile: omit(u, ['twoFactorEnabled']),
    brokerAccounts: brokers.map((b) => omit(b, ['password', 'syncLockedUntil'])),
    trades, executions, balanceEvents: balance, journal, aiConversations: aiConvs,
    notificationPreferences: prefs, newsPreferences: newsPrefs, watchlist: watch, priceAlerts: alerts, indicatorAlerts: indAlerts, savedScreens: screens,
    strategies, deployments,
    exchangeConnections: conns.map((c) => omit(c, ['apiKeyEnc', 'apiSecretEnc', 'passphraseEnc', 'keyFingerprint'])),
    copyFollows: follows, copyLeaders: leaders, exchangeOrders: orders,
    tradingWebhook: webhooks.map((w) => omit(w, ['secretHash', 'tokenHash', 'token', 'secret'])),
    apiKeys: apiKeys.map((k) => omit(k, ['secretHash'])),
    sessions: sessions.map((s) => omit(s, ['token'])),
    signInMethods: authAccounts.map((a) => ({ provider: a.providerId === 'credential' ? 'password' : a.providerId, createdAt: a.createdAt })),
    activity, feedback, notifications,
  };
}

// ── Deleting the account (H6) ──
const OTP_TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const hash = (otp: string) => createHash('sha256').update(otp).digest('hex');
const idFor = (userId: string) => `delete-account:${userId}`;

/** What stops deletion right now, in plain words; empty when it can go ahead. */
export async function deletionBlockers(userId: string): Promise<string[]> {
  const [leading, copying, live, partner] = await Promise.all([
    prisma.copyFollow.count({ where: { status: { in: ['ACTIVE', 'PAUSED'] }, leader: { userId }, userId: { not: userId } } }),
    prisma.copyFollow.count({ where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    prisma.strategyDeployment.count({ where: { userId, mode: 'live', status: { in: ['running', 'paused', 'stopping', 'errored'] } } }),
    prisma.partner.findUnique({ where: { userId }, select: { _count: { select: { referrals: true } } } }),
  ]);
  const out: string[] = [];
  if (leading) out.push(`${leading} ${leading === 1 ? 'person is' : 'people are'} copying your trades. Stop leading first so their copies end cleanly.`);
  if (copying) out.push(`You're copying ${copying} leader${copying === 1 ? '' : 's'}. Stop those copies first and decide what to do with open positions.`);
  if (live) out.push(`${live} live strateg${live === 1 ? 'y is' : 'ies are'} running. Stop or settle ${live === 1 ? 'it' : 'them'} first.`);
  if (partner && partner._count.referrals > 0) out.push('You have partner referrals. Email support so your referrals are handed over before the account goes.');
  return out;
}

export async function requestDeletion(userId: string, ctx: ActivityContext, now = Date.now()): Promise<{ sentTo: string; expiresAt: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u) throw new NotFoundError('Account not found');
  const blockers = await deletionBlockers(userId);
  if (blockers.length) throw new ConflictError(blockers.join(' '));
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now + OTP_TTL_MS);
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier: idFor(userId) } }),
    prisma.verification.create({ data: { identifier: idFor(userId), value: JSON.stringify({ h: hash(otp), tries: 0 }), expiresAt } }),
  ]);
  const { subject, html } = deleteAccountOtpEmail(otp);
  await sendEmail({ to: u.email, subject, html, devNote: `Delete-account OTP for ${u.email}: ${otp}` });
  await recordActivity(userId, 'delete_requested', 'Asked for a code to delete the account', ctx);
  return { sentTo: u.email.replace(/^(.).*(@.*)$/, '$1•••$2'), expiresAt: expiresAt.toISOString() };
}

/**
 * Check the code and delete. The code is single-use; five wrong tries burn it.
 * Every table keyed by this user goes, in one transaction.
 */
export async function confirmDeletion(userId: string, otp: string, now = Date.now()): Promise<{ deleted: true }> {
  const v = await prisma.verification.findFirst({ where: { identifier: idFor(userId) }, orderBy: { createdAt: 'desc' } });
  if (!v || v.expiresAt.getTime() < now) throw new ValidationError('That code has expired. Ask for a new one.');
  const st = JSON.parse(v.value) as { h: string; tries: number };
  const ok = /^\d{6}$/.test(otp) && timingSafeEqual(Buffer.from(st.h, 'hex'), Buffer.from(hash(otp), 'hex'));
  if (!ok) {
    const tries = st.tries + 1;
    if (tries >= MAX_TRIES) await prisma.verification.delete({ where: { id: v.id } });
    else await prisma.verification.update({ where: { id: v.id }, data: { value: JSON.stringify({ ...st, tries }) } });
    throw new ValidationError(tries >= MAX_TRIES ? 'Too many wrong codes. Ask for a new one.' : 'That code isn’t right.');
  }
  // Re-check: something may have started since the code was sent.
  const blockers = await deletionBlockers(userId);
  if (blockers.length) throw new ConflictError(blockers.join(' '));
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!u) throw new NotFoundError('Account not found');
  const where = { userId };
  await prisma.$transaction([
    // Tables keyed by userId without a foreign key: removed explicitly.
    prisma.journalEntry.deleteMany({ where }),
    prisma.aiConversation.deleteMany({ where }),
    prisma.weeklyReviewSubscription.deleteMany({ where }),
    prisma.aiReport.deleteMany({ where }),
    prisma.notificationPreference.deleteMany({ where }),
    prisma.newsPreference.deleteMany({ where }),
    prisma.eventWatch.deleteMany({ where }),
    prisma.pushSubscription.deleteMany({ where }),
    prisma.notificationDelivery.deleteMany({ where }),
    prisma.notification.deleteMany({ where }),
    prisma.watchlist.deleteMany({ where }),
    prisma.priceAlert.deleteMany({ where }),
    prisma.macroMember.deleteMany({ where }),
    prisma.traderAnalysis.deleteMany({ where }),
    prisma.traderStrategy.deleteMany({ where }),
    prisma.traderPaperPosition.deleteMany({ where }),
    prisma.userAccess.deleteMany({ where }),
    prisma.usageEvent.deleteMany({ where }),
    prisma.usageSession.deleteMany({ where }),
    prisma.strategyBacktest.deleteMany({ where }),
    prisma.verification.deleteMany({ where: { identifier: { in: [idFor(userId), u.email] } } }),
    // The user row; everything with a foreign key to it cascades.
    prisma.user.delete({ where: { id: userId } }),
  ]);
  logger.info('[account] deleted', { userId });
  try { const m = accountDeletedEmail(u.name); await sendEmail({ to: u.email, subject: m.subject, html: m.html }); } catch { /* the account is gone either way */ }
  return { deleted: true };
}
