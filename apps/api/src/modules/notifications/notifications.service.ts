// Notifications service: per-user preferences, the in-app inbox, and push
// subscription storage. Delivery (email/push dispatch) lives in the worker-driven
// dispatch path (see dispatch.service); this module is the user-facing surface.
import { prisma } from '@tradinjournal/db';
import type { NotificationPrefsInput, PushSubscribeInput } from '@tradinjournal/contracts';

export interface NotificationPrefsDTO {
  timezone: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  minImpact: 'LOW' | 'MEDIUM' | 'HIGH';
  currencies: string[];
  categories: string[];
  leadMinutes: number;
  newsAlerts: boolean;
}

/** Schema defaults, returned when a user has never touched their preferences. */
const DEFAULTS: NotificationPrefsDTO = {
  timezone: 'UTC',
  inApp: true,
  email: false,
  push: false,
  minImpact: 'HIGH',
  currencies: [],
  categories: [],
  leadMinutes: 15,
  newsAlerts: false,
};

export async function getPreferences(userId: string): Promise<NotificationPrefsDTO> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return DEFAULTS;
  return {
    timezone: row.timezone,
    inApp: row.inApp,
    email: row.email,
    push: row.push,
    minImpact: row.minImpact,
    currencies: row.currencies,
    categories: row.categories,
    leadMinutes: row.leadMinutes,
    newsAlerts: row.newsAlerts,
  };
}

export async function setPreferences(userId: string, input: NotificationPrefsInput): Promise<NotificationPrefsDTO> {
  const data = {
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.inApp !== undefined ? { inApp: input.inApp } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.push !== undefined ? { push: input.push } : {}),
    ...(input.minImpact !== undefined ? { minImpact: input.minImpact } : {}),
    ...(input.currencies !== undefined ? { currencies: input.currencies.map(c => c.toUpperCase()) } : {}),
    ...(input.categories !== undefined ? { categories: input.categories } : {}),
    ...(input.leadMinutes !== undefined ? { leadMinutes: input.leadMinutes } : {}),
    ...(input.newsAlerts !== undefined ? { newsAlerts: input.newsAlerts } : {}),
  };
  await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return getPreferences(userId);
}

// ── In-app inbox ──────────────────────────────────────────────────────────────

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(userId: string): Promise<{ items: NotificationDTO[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    items: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      href: r.href,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread,
  };
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

// ── Web Push subscriptions ──────────────────────────────────────────────────

export async function savePushSubscription(userId: string, input: PushSubscribeInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent },
    update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent },
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
