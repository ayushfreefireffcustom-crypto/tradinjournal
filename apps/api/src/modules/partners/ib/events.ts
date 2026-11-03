// Audit trail for the IB layer. Never throws: a logging hiccup must not fail the action.
import { prisma, type Prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';

export interface EventInput {
  kind: string;
  message: string;
  partnerId?: string | null;
  userId?: string | null;
  actor?: { id: string; email: string } | null;
  detail?: Record<string, unknown>;
}

export async function logEvent(e: EventInput): Promise<void> {
  try {
    await prisma.partnerEvent.create({
      data: {
        kind: e.kind, message: e.message.slice(0, 500), partnerId: e.partnerId ?? null, userId: e.userId ?? null,
        actorId: e.actor?.id ?? null, actorEmail: e.actor?.email ?? null,
        detail: (e.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.warn('[partners] event log failed', { kind: e.kind, err });
  }
}
