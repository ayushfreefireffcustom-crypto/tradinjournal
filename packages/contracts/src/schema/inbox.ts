// Notification inbox (C6.5) and per-type delivery preferences (C6.6). Every
// notification kind falls into one group; the inbox tabs and the settings grid
// are both built from this list, so the two can never disagree.
import { z } from 'zod';

export const notificationGroups = ['trades', 'risk', 'ai', 'news', 'reports', 'system'] as const;
export type NotificationGroup = (typeof notificationGroups)[number];

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, { label: string; hint: string }> = {
  trades: { label: 'Trade fills', hint: 'Copied orders, fills and orders that could not be copied' },
  risk: { label: 'Risk', hint: 'Loss limits, profit targets, paused leaders, broken exchange keys' },
  ai: { label: 'AI', hint: 'SignalX and paper-strategy signals' },
  news: { label: 'News & alerts', hint: 'Economic events, news and your price alerts' },
  reports: { label: 'Reports', hint: 'Summaries and reports' },
  system: { label: 'System', hint: 'Account, leader applications and everything else' },
};

const TRADES = new Set(['copy.open_trades', 'copy.rejected', 'copy.unfilled', 'copy.partial', 'copy.filled']);
const RISK = new Set([
  'copy.loss_limit',
  'copy.profit_target',
  'copy.position_drift',
  'copy.leader_paused',
  'copy.leader_delisted',
  'copy.follow_stopped_by_admin',
  'exchange.invalid',
]);

/** The group a notification kind belongs to. Unknown kinds are System. */
export function notificationGroupOf(kind: string): NotificationGroup {
  if (TRADES.has(kind)) return 'trades';
  if (RISK.has(kind) || kind.startsWith('exchange.')) return 'risk';
  if (kind === 'strategy_signal' || kind.startsWith('signalx') || kind.startsWith('ai.')) return 'ai';
  if (kind === 'event_reminder' || kind === 'news_alert' || kind === 'actual_released' || kind === 'price_alert') return 'news';
  if (kind.startsWith('report') || kind.startsWith('digest')) return 'reports';
  return 'system';
}

/** Kinds per group, for queries that filter one inbox tab in SQL. */
export function notificationKindFilter(group: NotificationGroup): { in?: string[]; startsWith?: string[] } {
  switch (group) {
    case 'trades': return { in: [...TRADES] };
    case 'risk': return { in: [...RISK], startsWith: ['exchange.'] };
    case 'ai': return { in: ['strategy_signal'], startsWith: ['signalx', 'ai.'] };
    case 'news': return { in: ['event_reminder', 'news_alert', 'actual_released', 'price_alert'] };
    case 'reports': return { startsWith: ['report', 'digest'] };
    case 'system': return {};
  }
}

/** Per-group overrides of the global email/push switches. Missing means on. */
const groupChannelSchema = z.object({ email: z.boolean().optional(), push: z.boolean().optional() }).strict();
export const notificationGroupPrefsSchema = z.object(
  Object.fromEntries(notificationGroups.map((g) => [g, groupChannelSchema.optional()])) as Record<NotificationGroup, z.ZodOptional<typeof groupChannelSchema>>,
).strict();
export type NotificationGroupPrefs = z.infer<typeof notificationGroupPrefsSchema>;

/** Whether a kind should go out on a channel, given the global switch and the group override. */
export function deliveryAllowed(kind: string, channel: 'email' | 'push', global: boolean, groups: unknown): boolean {
  if (!global) return false;
  const parsed = notificationGroupPrefsSchema.safeParse(groups ?? {});
  if (!parsed.success) return true;
  return parsed.data[notificationGroupOf(kind)]?.[channel] !== false;
}

export const inboxStatuses = ['all', 'unread', 'archived'] as const;
export const inboxQuerySchema = z.object({
  group: z.enum(notificationGroups).optional(),
  status: z.enum(inboxStatuses).default('all'),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;

/** Mark read / archive / unarchive. No ids means every matching notification (optionally in one group). */
export const inboxActionSchema = z.object({
  action: z.enum(['read', 'archive', 'unarchive']),
  ids: z.array(z.string().min(1).max(64)).max(200).optional(),
  group: z.enum(notificationGroups).optional(),
});
export type InboxActionInput = z.infer<typeof inboxActionSchema>;

export interface InboxItemDto {
  id: string;
  kind: string;
  group: NotificationGroup;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export interface InboxDto {
  items: InboxItemDto[];
  nextCursor: string | null;
  /** Unread, not archived, per group. */
  unread: Record<NotificationGroup, number>;
  /** Everything not archived, per group; 0 dims the tab. */
  total: Record<NotificationGroup, number>;
}
