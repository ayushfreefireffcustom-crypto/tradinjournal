// Notifications service: per-user preferences, the in-app inbox, and push
// subscription storage. Delivery (email/push dispatch) lives in the worker-driven
// dispatch path (see dispatch.service); this module is the user-facing surface.
import { prisma } from '@tradinjournal/db';
import type { Prisma } from '@tradinjournal/db';
import {
  notificationGroupOf,
  notificationGroupPrefsSchema,
  notificationGroups,
  notificationKindFilter,
  type InboxActionInput,
  type InboxDto,
  type InboxQuery,
  type NotificationGroup,
  type NotificationGroupPrefs,
  type NotificationPrefsInput,
  type PushSubscribeInput,
} from '@tradinjournal/contracts';

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
  priceAlerts: boolean;
  groups: NotificationGroupPrefs;
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
  priceAlerts: true,
  groups: {},
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
    priceAlerts: row.priceAlerts,
    groups: parseGroups(row.groups),
  };
}

function parseGroups(raw: unknown): NotificationGroupPrefs {
  const parsed = notificationGroupPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
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
    ...(input.priceAlerts !== undefined ? { priceAlerts: input.priceAlerts } : {}),
  };
  if (input.groups !== undefined) {
    // Merge per group so a PATCH of {news:{push:false}} keeps the other groups.
    const current = parseGroups((await prisma.notificationPreference.findUnique({ where: { userId }, select: { groups: true } }))?.groups);
    const merged: NotificationGroupPrefs = { ...current };
    for (const g of notificationGroups) if (input.groups[g]) merged[g] = { ...current[g], ...input.groups[g] };
    Object.assign(data, { groups: merged });
  }
  await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return getPreferences(userId);
}

// ── In-app inbox ──────────────────────────────────────────────────────────────

export interface NotificationDTO {
  id: string;
  kind: string;
  group: NotificationGroup;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(userId: string): Promise<{ items: NotificationDTO[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null, archivedAt: null } }),
  ]);
  return {
    items: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      group: notificationGroupOf(r.kind),
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

// ── Full inbox (C6.5): group tabs, unread / archived, paging ───────────────────

/** The SQL filter for one group's kinds. System is everything the others don't claim. */
function groupWhere(group: NotificationGroup): Prisma.NotificationWhereInput {
  if (group === 'system') {
    const claimed = notificationGroups.filter((g) => g !== 'system').map(notificationKindFilter);
    return {
      AND: [
        { kind: { notIn: claimed.flatMap((f) => f.in ?? []) } },
        ...claimed.flatMap((f) => f.startsWith ?? []).map((p) => ({ NOT: { kind: { startsWith: p } } })),
      ],
    };
  }
  const f = notificationKindFilter(group);
  return { OR: [...(f.in?.length ? [{ kind: { in: f.in } }] : []), ...(f.startsWith ?? []).map((p) => ({ kind: { startsWith: p } }))] };
}

const zeroCounts = (): Record<NotificationGroup, number> => Object.fromEntries(notificationGroups.map((g) => [g, 0])) as Record<NotificationGroup, number>;

export async function listInbox(userId: string, q: InboxQuery): Promise<InboxDto> {
  const where: Prisma.NotificationWhereInput = {
    userId,
    archivedAt: q.status === 'archived' ? { not: null } : null,
    ...(q.status === 'unread' ? { readAt: null } : {}),
    ...(q.group ? groupWhere(q.group) : {}),
  };
  const [rows, byKind] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    prisma.notification.groupBy({ by: ['kind'], where: { userId, archivedAt: null }, _count: { _all: true } }),
  ]);
  const unreadByKind = await prisma.notification.groupBy({ by: ['kind'], where: { userId, archivedAt: null, readAt: null }, _count: { _all: true } });
  const total = zeroCounts();
  const unread = zeroCounts();
  for (const r of byKind) total[notificationGroupOf(r.kind)] += r._count._all;
  for (const r of unreadByKind) unread[notificationGroupOf(r.kind)] += r._count._all;
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      group: notificationGroupOf(r.kind),
      title: r.title,
      body: r.body,
      href: r.href,
      read: r.readAt !== null,
      archived: r.archivedAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    unread,
    total,
  };
}

/** Read / archive / unarchive the given ids, or everything in a group (or all) when no ids are given. */
export async function inboxAction(userId: string, input: InboxActionInput): Promise<{ updated: number }> {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(input.ids ? { id: { in: input.ids } } : {}),
    ...(input.group ? groupWhere(input.group) : {}),
  };
  const now = new Date();
  const res =
    input.action === 'read'
      ? await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: now } })
      : input.action === 'archive'
        ? await prisma.notification.updateMany({ where: { ...where, archivedAt: null }, data: { archivedAt: now } })
        : await prisma.notification.updateMany({ where: { ...where, archivedAt: { not: null } }, data: { archivedAt: null } });
  return { updated: res.count };
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
