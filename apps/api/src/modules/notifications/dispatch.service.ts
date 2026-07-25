// Notification dispatch — runs once a minute (worker → /internal). Finds economic
// events entering each user's reminder window and delivers across their enabled
// channels (in-app / email / push), exactly once per (event, user, channel) via
// the NotificationDelivery ledger. Idempotent: a duplicate cron fire or retry
// re-inserts nothing and re-sends nothing.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from '../../lib/email/client.js';
import { eventReminderEmail } from '../../lib/email/templates.js';
import { sendPush } from '../../lib/push.js';

type Impact = 'LOW' | 'MEDIUM' | 'HIGH';
const RANK: Record<Impact, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Widest lead we scan for — pref lead is capped at 1440 (24h). */
const SCAN_MINUTES = 1440;

interface Prefs {
  inApp: boolean; email: boolean; push: boolean;
  minImpact: Impact; currencies: string[]; categories: string[];
  leadMinutes: number; timezone: string;
}
const DEFAULT_PREFS: Prefs = {
  inApp: true, email: false, push: false, minImpact: 'HIGH', currencies: [], categories: [], leadMinutes: 15, timezone: 'UTC',
};

function whenLabel(eventTime: Date, now: Date): string {
  const mins = Math.max(0, Math.round((eventTime.getTime() - now.getTime()) / 60_000));
  const hhmm = eventTime.toISOString().slice(11, 16);
  return mins <= 1 ? `now (${hhmm} UTC)` : `in ${mins} minutes (${hhmm} UTC)`;
}

export async function dispatchReminders(): Promise<{ events: number; delivered: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + SCAN_MINUTES * 60_000);

  const events = await prisma.economicEvent.findMany({
    where: { eventTime: { gt: now, lte: horizon } },
    orderBy: { eventTime: 'asc' },
  });
  if (events.length === 0) return { events: 0, delivered: 0 };

  const eventIds = events.map(e => e.id);

  // Two sources of interest: explicit watches, and preference-matched users.
  const [watches, prefRows] = await Promise.all([
    prisma.eventWatch.findMany({ where: { eventId: { in: eventIds } }, select: { eventId: true, userId: true } }),
    prisma.notificationPreference.findMany({
      where: { OR: [{ inApp: true }, { email: true }, { push: true }] },
    }),
  ]);

  const prefsByUser = new Map<string, Prefs>(prefRows.map(p => [p.userId, p as unknown as Prefs]));
  const watchersByEvent = new Map<string, Set<string>>();
  for (const w of watches) (watchersByEvent.get(w.eventId) ?? watchersByEvent.set(w.eventId, new Set()).get(w.eventId)!).add(w.userId);

  // Build the (user, event) work set.
  const work: Array<{ userId: string; event: (typeof events)[number]; prefs: Prefs }> = [];
  for (const event of events) {
    const targets = new Set<string>();
    watchersByEvent.get(event.id)?.forEach(u => targets.add(u));
    for (const [userId, p] of prefsByUser) {
      const impactOk = RANK[event.impact] >= RANK[p.minImpact];
      const curOk = p.currencies.length === 0 || p.currencies.includes(event.currency);
      const catOk = p.categories.length === 0 || (event.category ? p.categories.includes(event.category) : true);
      if (impactOk && curOk && catOk) targets.add(userId);
    }
    for (const userId of targets) {
      const prefs = prefsByUser.get(userId) ?? DEFAULT_PREFS;
      // Due when we're inside the lead window and the event hasn't started.
      const dueAt = new Date(event.eventTime.getTime() - prefs.leadMinutes * 60_000);
      if (now >= dueAt && now < event.eventTime) work.push({ userId, event, prefs });
    }
  }
  if (work.length === 0) return { events: events.length, delivered: 0 };

  // Emails + push subs needed for the work set — batch load.
  const emailUserIds = [...new Set(work.filter(w => w.prefs.email).map(w => w.userId))];
  const pushUserIds = [...new Set(work.filter(w => w.prefs.push).map(w => w.userId))];
  const [emailUsers, pushSubs] = await Promise.all([
    emailUserIds.length ? prisma.user.findMany({ where: { id: { in: emailUserIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    pushUserIds.length ? prisma.pushSubscription.findMany({ where: { userId: { in: pushUserIds } } }) : Promise.resolve([]),
  ]);
  const userById = new Map(emailUsers.map(u => [u.id, u]));
  const subsByUser = new Map<string, typeof pushSubs>();
  for (const s of pushSubs) (subsByUser.get(s.userId) ?? subsByUser.set(s.userId, []).get(s.userId)!).push(s);

  let delivered = 0;

  /** Claim (dedupKey, channel) in the ledger; false if already delivered. */
  const claim = async (userId: string, dedupKey: string, channel: string): Promise<boolean> => {
    try {
      await prisma.notificationDelivery.create({ data: { userId, dedupKey, channel } });
      return true;
    } catch {
      return false; // unique violation → already delivered
    }
  };

  for (const { userId, event, prefs } of work) {
    const dedupKey = `reminder:${event.id}:${userId}`;
    const label = whenLabel(event.eventTime, now);

    if (prefs.inApp && (await claim(userId, dedupKey, 'in_app'))) {
      await prisma.notification.create({
        data: {
          userId,
          kind: 'event_reminder',
          title: `${event.currency} · ${event.title}`,
          body: `${event.impact} impact ${label}`,
          href: '/economic-calendar',
          eventId: event.id,
        },
      });
      delivered += 1;
    }

    if (prefs.email) {
      const u = userById.get(userId);
      if (u?.email && (await claim(userId, dedupKey, 'email'))) {
        const { subject, html } = eventReminderEmail({
          name: u.name, eventTitle: event.title, currency: event.currency,
          impact: event.impact, whenLabel: label, forecast: event.forecast, previous: event.previous,
        });
        await sendEmail({ to: u.email, subject, html, devNote: `[event-reminder] ${event.title}` }).catch(err =>
          logger.warn(`Reminder email failed for ${userId}: ${(err as Error).message}`),
        );
        delivered += 1;
      }
    }

    if (prefs.push) {
      const subs = subsByUser.get(userId) ?? [];
      if (subs.length && (await claim(userId, dedupKey, 'push'))) {
        for (const sub of subs) {
          const res = await sendPush(sub, { title: `${event.currency} · ${event.title}`, body: `${event.impact} impact ${label}`, url: '/economic-calendar' });
          if (res === 'gone') await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
        delivered += 1;
      }
    }
  }

  return { events: events.length, delivered };
}
