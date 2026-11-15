// Signed-in devices for Settings → Security.
// better-auth's /list-sessions refuses a session older than its freshAge (1 day),
// so a normal signed-in user saw "Session is not fresh". Listing your own devices
// is harmless, so it is served here without that check. Tokens are never sent:
// a single device is signed out by id, and only after the caller's own session
// is confirmed in the database (the same check better-auth makes for revoking).
import { prisma } from '@tradinjournal/db';
import { UnauthorizedError, NotFoundError } from '../../http/errors.js';
import { recordActivity, type ActivityContext } from './activity.service.js';

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  current: boolean;
}

export async function listMySessions(userId: string, currentId: string): Promise<DeviceSession[]> {
  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, updatedAt: true, expiresAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    current: r.id === currentId,
  }));
}

export async function revokeMySession(userId: string, currentId: string, id: string, ctx: ActivityContext): Promise<void> {
  // The session cookie can be cached for 5 minutes; a device that was already
  // signed out must not be able to sign others out.
  const live = await prisma.session.findFirst({ where: { id: currentId, userId, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (!live) throw new UnauthorizedError();
  if (id === currentId) throw new NotFoundError('Use Sign out to end this session');
  const { count } = await prisma.session.deleteMany({ where: { id, userId } });
  if (!count) throw new NotFoundError('That device is already signed out');
  await recordActivity(userId, 'sessions_revoked', 'Signed out one device', ctx);
}
