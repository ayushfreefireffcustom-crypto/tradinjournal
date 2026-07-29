// Daily market digest — the EMAIL channel for event reminders. Once a day it
// compiles each opted-in user's upcoming events (next 24h, matched by their
// prefs or explicitly watched) into ONE email with a link back to the site.
//
// Why a digest and not per-event mail: the Resend free tier allows ~100 emails/
// day. One digest per user per day keeps us comfortably inside that for ~100
// email-opted users; real-time nudges go over web push (no such cap).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { EventImpact } from '@tradinjournal/contracts';
import { sendEmail } from '../../lib/email/client.js';
import { dailyDigestEmail } from '../../lib/email/templates.js';

const RANK: Record<EventImpact, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const HORIZON_MINUTES = 24 * 60;
const MAX_EVENTS_PER_EMAIL = 20;

interface Prefs {
  minImpact: EventImpact;
  currencies: string[];
  categories: string[];
}

export async function sendDailyDigests(): Promise<{ users: number; sent: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_MINUTES * 60_000);
  const dayKey = now.toISOString().slice(0, 10);

  const emailPrefs = await prisma.notificationPreference.findMany({ where: { email: true } });
  if (emailPrefs.length === 0) return { users: 0, sent: 0 };

  const events = await prisma.economicEvent.findMany({
    where: { eventTime: { gt: now, lte: horizon } },
    orderBy: { eventTime: 'asc' },
  });
  if (events.length === 0) return { users: emailPrefs.length, sent: 0 };

  const userIds = emailPrefs.map(p => p.userId);
  const [users, watches] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.eventWatch.findMany({
      where: { eventId: { in: events.map(e => e.id) }, userId: { in: userIds } },
      select: { eventId: true, userId: true },
    }),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  const watchedByUser = new Map<string, Set<string>>();
  for (const w of watches) (watchedByUser.get(w.userId) ?? watchedByUser.set(w.userId, new Set()).get(w.userId)!).add(w.eventId);

  let sent = 0;
  for (const p of emailPrefs) {
    const prefs = p as unknown as Prefs;
    const user = userById.get(p.userId);
    if (!user?.email) continue;

    const watchedIds = watchedByUser.get(p.userId) ?? new Set<string>();
    const relevant = events.filter(e => {
      if (watchedIds.has(e.id)) return true;
      const impactOk = RANK[e.impact] >= RANK[prefs.minImpact];
      const curOk = prefs.currencies.length === 0 || prefs.currencies.includes(e.currency);
      const catOk = prefs.categories.length === 0 || (e.category ? prefs.categories.includes(e.category) : true);
      return impactOk && curOk && catOk;
    });
    if (relevant.length === 0) continue;

    // Idempotent: at most one digest per user per calendar day.
    const dedupKey = `digest:${p.userId}:${dayKey}`;
    try {
      await prisma.notificationDelivery.create({ data: { userId: p.userId, dedupKey, channel: 'email' } });
    } catch {
      continue; // already sent today
    }

    const { subject, html } = dailyDigestEmail({
      name: user.name,
      events: relevant.slice(0, MAX_EVENTS_PER_EMAIL).map(e => ({
        timeLabel: `${e.eventTime.toISOString().slice(11, 16)} UTC`,
        currency: e.currency,
        title: e.title,
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
      })),
    });
    await sendEmail({ to: user.email, subject, html, devNote: `[daily-digest] ${relevant.length} events` }).catch(err =>
      logger.warn(`Digest email failed for ${p.userId}: ${(err as Error).message}`),
    );
    sent += 1;
  }
  return { users: emailPrefs.length, sent };
}
