// Paper-book alerts. Inbox always (promoting is the opt-in). Email only when
// the user has email notifications on. Educational — never an order.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from '../../lib/email/client.js';
import { claimDelivery } from '../../lib/notifications/claim.js';

export interface PaperAlert {
  userId: string;
  positionId: string;
  strategyName: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  timeframe: string;
  event: 'open' | 'close';
  status?: 'target' | 'stop' | 'expired';
  exit?: number | null;
  pnlPct?: number | null;
}

function px(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toFixed(digits);
}

function subject(a: PaperAlert): string {
  if (a.event === 'open') return `Paper ${a.side} ${a.symbol}`;
  const word = a.status === 'target' ? 'target' : a.status === 'stop' ? 'stop' : 'expired';
  return `Paper ${a.symbol} ${word}`;
}

function lines(a: PaperAlert): string[] {
  const head =
    a.event === 'open'
      ? `${a.strategyName} opened a paper ${a.side} on ${a.symbol} (${a.timeframe}).`
      : `${a.strategyName} paper ${a.side} on ${a.symbol} closed (${a.status ?? 'closed'}).`;
  const body = [
    head,
    `Entry ${px(a.entry)} · Stop ${px(a.stop)} · Target ${px(a.target)}`,
  ];
  if (a.event === 'close' && a.exit != null) {
    const pnl = a.pnlPct == null ? '' : ` · ${a.pnlPct >= 0 ? '+' : ''}${a.pnlPct.toFixed(2)}%`;
    body.push(`Exit ${px(a.exit)}${pnl}`);
  }
  body.push('Educational paper fill. Not an order. Not financial advice.');
  return body;
}

export function paperAlertEmail(a: PaperAlert): { subject: string; html: string } {
  const text = lines(a);
  const href = `${env.APP_URL.replace(/\/$/, '')}/trader`;
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
<p>${text[0]}</p>
<p>${text[1]}</p>
${text[2] && a.event === 'close' ? `<p>${text[2]}</p>` : ''}
<p><a href="${href}">Open SignalX</a></p>
<p style="color:#666;font-size:12px">${text[text.length - 1]}</p>
</div>`;
  return { subject: subject(a), html };
}

export async function userEmailEnabled(userId: string): Promise<boolean> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { email: true },
  });
  return prefs?.email === true;
}

export async function notifyPaperEvent(alert: PaperAlert): Promise<void> {
  const dedup = `strategy:${alert.positionId}:${alert.event}`;
  const title = subject(alert);
  const body = lines(alert).slice(0, -1).join(' ');

  if (await claimDelivery(alert.userId, dedup, 'in_app')) {
    await prisma.notification.create({
      data: {
        userId: alert.userId,
        kind: 'strategy_signal',
        title,
        body,
        href: '/trader',
      },
    });
  }

  if (!(await userEmailEnabled(alert.userId))) return;
  if (!(await claimDelivery(alert.userId, dedup, 'email'))) return;

  const user = await prisma.user.findUnique({
    where: { id: alert.userId },
    select: { email: true },
  });
  if (!user?.email) return;

  const mail = paperAlertEmail(alert);
  await sendEmail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    devNote: `[paper] ${alert.event} ${alert.symbol} ${alert.side}`,
  }).catch((err) => logger.warn(`[trader/paper] email failed: ${(err as Error).message}`));
}
