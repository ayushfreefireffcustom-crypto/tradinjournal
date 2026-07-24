// Weekly AI review: subscription management + building and sending one digest.
//
// The worker never does this work itself. Report generation reads the MT5 bridge,
// which serialises on a single terminal — a second process fetching deals
// concurrently breaks both. So the worker schedules and the API executes, and
// within a digest the per-account reports are generated SEQUENTIALLY for the
// same reason.
//
// Reports come from getReport(), which is hash-cached: if the trader already
// opened their dashboard this week, the email costs zero tokens.
import { randomBytes } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { findAccountsByUser } from '../accounts/accounts.repository.js';
import { sendEmail } from '../../lib/email/client.js';
import { weeklyReviewEmail, type WeeklyReviewAccountSection } from '../../lib/email/templates.js';
import { getReport } from './ai.report.service.js';

export interface WeeklyReviewSubscriptionView {
  enabled: boolean;
  lastSentAt: string | null;
}

/** 32 random bytes — this token appears in an unauthenticated unsubscribe link. */
function newUnsubscribeToken(): string {
  return randomBytes(32).toString('hex');
}

export function unsubscribeUrl(token: string): string {
  return `${env.APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ─── Subscription ────────────────────────────────────────────────────────────

/** Read a user's preference. An absent row means "not subscribed" (opt-in). */
export async function getSubscription(userId: string): Promise<WeeklyReviewSubscriptionView> {
  const row = await prisma.weeklyReviewSubscription.findUnique({ where: { userId } });
  return {
    enabled: row?.enabled ?? false,
    lastSentAt: row?.lastSentAt?.toISOString() ?? null,
  };
}

/**
 * Turn the weekly review on or off. The row (and its unsubscribe token) is
 * created on first use; the token is generated once and never rotated on
 * toggle, so links in already-delivered emails keep working.
 */
export async function setSubscription(userId: string, enabled: boolean): Promise<WeeklyReviewSubscriptionView> {
  const row = await prisma.weeklyReviewSubscription.upsert({
    where: { userId },
    create: { userId, enabled, unsubscribeToken: newUnsubscribeToken() },
    update: { enabled },
  });
  return { enabled: row.enabled, lastSentAt: row.lastSentAt?.toISOString() ?? null };
}

/**
 * Unsubscribe by token — no session required, since this is reached from an
 * email. Returns false for an unknown token so the caller can 404 rather than
 * silently claiming success.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const { count } = await prisma.weeklyReviewSubscription.updateMany({
    where: { unsubscribeToken: token },
    data: { enabled: false },
  });
  return count > 0;
}

// ─── Recipients ──────────────────────────────────────────────────────────────

export interface WeeklyReviewRecipient {
  userId: string;
}

/**
 * One page of users due a digest: subscribed, and not already sent since
 * `sentAfter` (the start of the current run's week). Cursor-paginated so a
 * large user base never loads into memory at once.
 */
export async function listDueRecipients(params: {
  sentAfter: Date;
  limit: number;
  cursor?: string;
}): Promise<{ recipients: WeeklyReviewRecipient[]; nextCursor?: string }> {
  const { sentAfter, limit, cursor } = params;
  const rows = await prisma.weeklyReviewSubscription.findMany({
    where: {
      enabled: true,
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: sentAfter } }],
    },
    orderBy: { id: 'asc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: { id: true, userId: true },
  });

  const last = rows[rows.length - 1];
  return {
    recipients: rows.map(r => ({ userId: r.userId })),
    nextCursor: rows.length === limit && last ? last.id : undefined,
  };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export type WeeklyReviewOutcome =
  | { sent: true; accounts: number }
  | { sent: false; reason: 'not-subscribed' | 'already-sent' | 'no-accounts' | 'no-content' };

function weekLabel(now: Date): string {
  const end = new Date(now);
  const start = new Date(now.getTime() - 6 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Build and send one user's digest. Idempotent for a given week: if the row was
 * already marked sent after `sentAfter`, this is a no-op, so a duplicate job or
 * a retry after a partial failure can't double-send.
 */
export async function sendWeeklyReview(params: { userId: string; sentAfter: Date }): Promise<WeeklyReviewOutcome> {
  const { userId, sentAfter } = params;

  const sub = await prisma.weeklyReviewSubscription.findUnique({ where: { userId } });
  if (!sub || !sub.enabled) return { sent: false, reason: 'not-subscribed' };
  if (sub.lastSentAt && sub.lastSentAt >= sentAfter) return { sent: false, reason: 'already-sent' };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user?.email) return { sent: false, reason: 'no-accounts' };

  const accounts = await findAccountsByUser(userId);
  if (accounts.length === 0) {
    // Nothing to review, but mark the week done so we don't retry every dispatch.
    await markSent(userId);
    return { sent: false, reason: 'no-accounts' };
  }

  // SEQUENTIAL on purpose — see the file header. Never Promise.all this.
  const sections: WeeklyReviewAccountSection[] = [];
  for (const account of accounts) {
    try {
      const report = await getReport(userId, account.id);
      if (!report.generated) continue; // rule-based filler isn't worth emailing
      sections.push({ label: `${account.broker.toUpperCase()} · #${account.mt5Login}`, content: report.content });
    } catch (err) {
      // One dead broker connection must not sink the whole digest.
      logger.warn(`Weekly review: skipping account ${account.id} — ${(err as Error).message}`);
    }
  }

  if (sections.length === 0) {
    await markSent(userId);
    return { sent: false, reason: 'no-content' };
  }

  const now = new Date();
  const url = unsubscribeUrl(sub.unsubscribeToken);
  const { subject, html } = weeklyReviewEmail({
    name: user.name,
    weekLabel: weekLabel(now),
    sections,
    unsubscribeUrl: url,
  });

  await sendEmail({
    to: user.email,
    subject,
    html,
    devNote: `[weekly-review] ${sections.length} account(s)`,
    headers: {
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  await markSent(userId);
  return { sent: true, accounts: sections.length };
}

async function markSent(userId: string): Promise<void> {
  await prisma.weeklyReviewSubscription.update({ where: { userId }, data: { lastSentAt: new Date() } });
}
