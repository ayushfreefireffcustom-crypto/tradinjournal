import { prisma } from '@tradinjournal/db';

const SESSION_GAP_MS = 30 * 60 * 1000;
const HEARTBEAT_SEC = 30;

export interface HeartbeatInput {
  path?: string;
  feature?: string;
  userAgent?: string;
  ended?: boolean;
  /**
   * What this ping is. `view` = navigated to a page, `beat` = still here (30s
   * timer), `end` = tab hidden/closed. Only views and ends are stored as events —
   * beats just extend the session. Absent (older clients) = previous behaviour.
   */
  kind?: 'view' | 'beat' | 'end';
}

function featureFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/charts')) return 'charts';
  if (path.startsWith('/macro')) return 'macro';
  if (path.startsWith('/coach')) return 'coach';
  if (path.startsWith('/notebook') || path.startsWith('/journal')) return 'journal';
  if (path.startsWith('/trades') || path.startsWith('/analytics')) return 'trades';
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/brokers')) return 'brokers';
  if (path.startsWith('/trader')) return 'trader';
  if (path.startsWith('/markets') || path.startsWith('/calendar')) return 'markets';
  return 'other';
}

export async function recordHeartbeat(userId: string, input: HeartbeatInput) {
  const now = new Date();
  const feature = input.feature || featureFromPath(input.path);

  const open = await prisma.usageSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  });

  let sessionId: string;

  if (open && now.getTime() - open.lastSeenAt.getTime() <= SESSION_GAP_MS) {
    const elapsed = Math.max(
      HEARTBEAT_SEC,
      Math.min(120, Math.round((now.getTime() - open.lastSeenAt.getTime()) / 1000)),
    );
    const updated = await prisma.usageSession.update({
      where: { id: open.id },
      data: {
        lastSeenAt: now,
        durationSec: open.durationSec + (input.ended ? 0 : elapsed),
        pagePath: input.path ?? open.pagePath,
        endedAt: input.ended ? now : null,
      },
    });
    sessionId = updated.id;
  } else {
    if (open) {
      await prisma.usageSession.update({
        where: { id: open.id },
        data: { endedAt: open.lastSeenAt },
      });
    }
    const created = await prisma.usageSession.create({
      data: {
        userId,
        startedAt: now,
        lastSeenAt: now,
        durationSec: input.ended ? 0 : HEARTBEAT_SEC,
        pagePath: input.path,
        userAgent: input.userAgent,
        endedAt: input.ended ? now : null,
      },
    });
    sessionId = created.id;
  }

  const type = input.ended || input.kind === 'end' ? 'session_end'
    : input.kind === 'beat' ? null
    : input.kind === 'view' || input.path ? 'page_view' : 'heartbeat';
  if (!type) return { sessionId, ok: true as const };

  await prisma.usageEvent.create({
    data: {
      userId,
      sessionId,
      type,
      path: input.path,
      feature,
    },
  });

  return { sessionId, ok: true as const };
}
