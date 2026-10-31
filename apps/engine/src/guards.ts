// Kill switch, notifications and credential failure handling.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';

export const KILL_SWITCH_KEY = 'copy.killSwitch';

let cached: { value: boolean; at: number } | null = null;

/** Global copy-trading stop, flipped by admins (SystemSetting). Cached 2 s. */
export async function isKillSwitchOn(nowMs = Date.now()): Promise<boolean> {
  if (cached && nowMs - cached.at < 2000) return cached.value;
  const row = await prisma.systemSetting.findUnique({ where: { key: KILL_SWITCH_KEY } }).catch(() => null);
  const value = Boolean((row?.value as { enabled?: boolean } | null)?.enabled);
  cached = { value, at: nowMs };
  return value;
}

export function resetKillSwitchCache(): void {
  cached = null;
}

export async function notify(userId: string, kind: string, title: string, body: string, href = '/copy'): Promise<void> {
  await prisma.notification.create({ data: { userId, kind, title, body, href } }).catch((err) => logger.warn('[engine] notification failed', { kind, err: String(err) }));
}

/**
 * The exchange rejected a connection's key: mark it INVALID, pause every
 * follow copying onto it (and every follow of a leader using it), and tell the
 * owner once. Idempotent: a second call finds nothing ACTIVE and stays quiet.
 */
export async function markConnectionInvalid(connectionId: string, message: string): Promise<void> {
  const conn = await prisma.exchangeConnection.findUnique({ where: { id: connectionId }, include: { leader: true } });
  if (!conn || conn.status !== 'ACTIVE') return;
  const now = new Date();
  await prisma.$transaction([
    prisma.exchangeConnection.update({ where: { id: connectionId }, data: { status: 'INVALID', lastError: message, lastCheckedAt: now } }),
    prisma.copyFollow.updateMany({ where: { connectionId, status: 'ACTIVE' }, data: { status: 'PAUSED', pausedAt: now, pauseReason: 'Your exchange account needs reconnecting.' } }),
    ...(conn.leader
      ? [prisma.copyFollow.updateMany({ where: { leaderId: conn.leader.id, status: 'ACTIVE' }, data: { status: 'PAUSED', pausedAt: now, pauseReason: "The leader's exchange account needs reconnecting." } })]
      : []),
  ]);
  await notify(conn.userId, 'exchange.invalid', `${conn.label}: reconnect needed`, `The exchange rejected this account's API key (${message}). Copy trading on it is paused until you reconnect.`, '/brokers');
}
