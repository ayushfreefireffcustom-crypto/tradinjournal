// The account's activity log (H7). Security and account events are written
// to activity_event as they happen; orders already live in exchange_order, so
// the feed reads them from there rather than copying them.
import { prisma, type Prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';

export type ActivityKind =
  | 'sign_in' | 'sessions_revoked' | 'password_changed' | 'two_factor_on' | 'two_factor_off' | 'backup_codes_new'
  | 'profile_updated' | 'data_exported' | 'delete_requested'
  | 'exchange_connected' | 'exchange_removed' | 'follow_started' | 'follow_stopped'
  | 'api_key_created' | 'api_key_revoked' | 'deployment_started' | 'deployment_stopped';

export interface ActivityContext { ip?: string | null; userAgent?: string | null }

/** Record one event. Never throws: losing a log line mustn't break what was logged. */
export async function recordActivity(userId: string, kind: ActivityKind, summary: string, ctx: ActivityContext = {}, data?: Prisma.InputJsonValue): Promise<void> {
  try {
    await prisma.activityEvent.create({ data: { userId, kind, summary: summary.slice(0, 300), ip: ctx.ip?.slice(0, 64) ?? null, userAgent: ctx.userAgent?.slice(0, 300) ?? null, ...(data !== undefined ? { data } : {}) } });
  } catch (err) {
    logger.warn('[activity] could not record', { userId, kind, err: (err as Error).message });
  }
}

/** IP and browser from an Express request (the last X-Forwarded-For hop is the one our edge added). */
export function contextOf(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): ActivityContext {
  const xff = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ua = req.headers['user-agent'];
  return { ip: hops.at(-1) ?? req.ip ?? null, userAgent: Array.isArray(ua) ? ua[0] : ua ?? null };
}

export type ActivityGroup = 'all' | 'security' | 'trading' | 'orders';
const SECURITY: ActivityKind[] = ['sign_in', 'sessions_revoked', 'password_changed', 'two_factor_on', 'two_factor_off', 'backup_codes_new', 'profile_updated', 'data_exported', 'delete_requested', 'api_key_created', 'api_key_revoked'];
const TRADING: ActivityKind[] = ['exchange_connected', 'exchange_removed', 'follow_started', 'follow_stopped', 'deployment_started', 'deployment_stopped'];

export interface ActivityItem { id: string; at: string; kind: string; summary: string; ip: string | null; device: string | null; group: 'security' | 'trading' | 'orders' }

/** "Chrome on macOS" from a user agent; null when it can't tell. */
export function deviceOf(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Brave/.test(ua) ? 'Brave' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici|Postman/i.test(ua) ? 'API client' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return browser && os ? `${browser} on ${os}` : browser ?? os;
}

const ORDER_VERB: Record<string, string> = { BUY: 'Buy', SELL: 'Sell' };
const SOURCE: Record<string, string> = { MANUAL: 'you', COPY: 'copy trading', STRATEGY: 'a strategy', WEBHOOK: 'a webhook' };

/** Newest first, `before` an ISO time for the next page. */
export async function listActivity(userId: string, q: { group?: ActivityGroup; before?: string; limit?: number } = {}): Promise<{ items: ActivityItem[]; nextBefore: string | null }> {
  const limit = Math.min(100, Math.max(1, q.limit ?? 50));
  const group = q.group ?? 'all';
  const before = q.before ? new Date(q.before) : undefined;
  const kinds = group === 'security' ? SECURITY : group === 'trading' ? TRADING : null;
  const [events, orders] = await Promise.all([
    group === 'orders' ? [] : prisma.activityEvent.findMany({ where: { userId, ...(kinds ? { kind: { in: kinds } } : {}), ...(before ? { at: { lt: before } } : {}) }, orderBy: { at: 'desc' }, take: limit }),
    group === 'all' || group === 'orders'
      ? prisma.exchangeOrder.findMany({ where: { userId, ...(before ? { requestedAt: { lt: before } } : {}) }, orderBy: { requestedAt: 'desc' }, take: limit, include: { connection: { select: { label: true } } } })
      : [],
  ]);
  const items: ActivityItem[] = [
    ...events.map((e) => ({ id: e.id, at: e.at.toISOString(), kind: e.kind, summary: e.summary, ip: e.ip, device: deviceOf(e.userAgent), group: (SECURITY as string[]).includes(e.kind) ? 'security' as const : 'trading' as const })),
    ...orders.map((o) => ({
      id: o.id, at: o.requestedAt.toISOString(), kind: 'order', ip: null, device: null, group: 'orders' as const,
      summary: `${ORDER_VERB[o.side] ?? o.side} ${Number(o.qty)} ${o.symbol} · ${o.type.toLowerCase().replace(/_/g, ' ')} · ${o.status.toLowerCase()} · by ${SOURCE[o.source] ?? o.source.toLowerCase()} on ${o.connection.label}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
  return { items, nextBefore: items.length === limit ? items.at(-1)!.at : null };
}
