// Trading notifications beyond the in-app bell (C6.1, C6.3, C6.4). The engine
// and the copy API write every trading event as a Notification row; this job
// fans the new ones out to push and email for users who turned those on in
// their notification settings. The delivery ledger makes every send once-only,
// so a retry or a second API instance never repeats one.
import { env } from '@tradinjournal/config';
import { deliveryAllowed } from '@tradinjournal/contracts';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from '../../lib/email/client.js';
import { claimDelivery } from '../../lib/notifications/claim.js';
import { sendPush, type PushPayload, type PushResult, type PushTarget } from '../../lib/push.js';

/** Copy-trading and exchange events. Anything with these prefixes is trading. */
const PREFIXES = ['copy.', 'exchange.'];
/** Events worth an email: money at risk, or something the user has to act on. */
export const EMAIL_KINDS = new Set([
  'copy.loss_limit',
  'copy.profit_target',
  'copy.rejected',
  'copy.unfilled',
  'copy.partial',
  'copy.position_drift',
  'copy.leader_paused',
  'copy.leader_delisted',
  'copy.follow_stopped_by_admin',
  'copy.leader_approved',
  'copy.leader_rejected',
  'copy.open_trades',
  'exchange.invalid',
]);
/** Only recent events go out; an old backlog after downtime stays in the inbox. */
const MAX_AGE_MS = 2 * 3600_000;

export interface NotifyDeps {
  sendEmail: typeof sendEmail;
  sendPush: (target: PushTarget, payload: PushPayload) => Promise<PushResult>;
}
const defaultDeps: NotifyDeps = { sendEmail, sendPush };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function tradingEmail(n: { title: string; body: string | null; href: string | null }): { subject: string; html: string } {
  const url = `${env.APP_URL.replace(/\/$/, '')}${n.href ?? '/copy/following'}`;
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
<p style="font-size:16px;margin:0 0 8px">${esc(n.title)}</p>
${n.body ? `<p style="margin:0 0 16px">${esc(n.body)}</p>` : ''}
<p><a href="${esc(url)}">Open in TRADElogs</a></p>
<p style="color:#666;font-size:12px">You get these because email notifications are on in your TRADElogs settings.</p>
</div>`;
  return { subject: n.title, html };
}

export async function dispatchCopyNotifications(now = new Date(), deps: NotifyDeps = defaultDeps): Promise<{ push: number; email: number }> {
  // Users who want more than the bell first, then their recent trading events:
  // that query rides the (userId, createdAt) index instead of scanning the table.
  const prefs = await prisma.notificationPreference.findMany({ where: { OR: [{ email: true }, { push: true }] }, select: { userId: true, email: true, push: true, groups: true } });
  if (!prefs.length) return { push: 0, email: 0 };
  const byUser = new Map(prefs.map((p) => [p.userId, p]));
  const recent = await prisma.notification.findMany({
    where: { userId: { in: [...byUser.keys()] }, createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS) }, OR: PREFIXES.map((p) => ({ kind: { startsWith: p } })) },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  if (!recent.length) return { push: 0, email: 0 };
  const [subs, users] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId: { in: prefs.filter((p) => p.push).map((p) => p.userId) } } }),
    prisma.user.findMany({ where: { id: { in: prefs.filter((p) => p.email).map((p) => p.userId) } }, select: { id: true, email: true } }),
  ]);
  let push = 0;
  let email = 0;
  for (const n of recent) {
    const p = byUser.get(n.userId);
    if (!p) continue;
    const key = `notif:${n.id}`;
    const mySubs = subs.filter((s) => s.userId === n.userId);
    if (deliveryAllowed(n.kind, 'push', p.push, p.groups) && mySubs.length && (await claimDelivery(n.userId, key, 'push'))) {
      for (const s of mySubs) {
        const res = await deps.sendPush(s, { title: n.title, body: n.body ?? '', url: n.href ?? '/copy/following' }).catch(() => 'failed' as const);
        if (res === 'sent') push++;
        if (res === 'gone') await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
      }
    }
    const to = users.find((u) => u.id === n.userId)?.email;
    if (deliveryAllowed(n.kind, 'email', p.email, p.groups) && to && EMAIL_KINDS.has(n.kind) && (await claimDelivery(n.userId, key, 'email'))) {
      const mail = tradingEmail(n);
      await deps.sendEmail({ to, subject: mail.subject, html: mail.html, devNote: `[copy] ${n.kind}` }).then(() => email++).catch((err) => logger.warn('[copy-notify] email failed', { kind: n.kind, err: String(err) }));
    }
  }
  return { push, email };
}
