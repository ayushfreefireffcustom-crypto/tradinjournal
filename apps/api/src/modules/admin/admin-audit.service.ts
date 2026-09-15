import { prisma } from '@tradinjournal/db';
import type { Prisma } from '@tradinjournal/db';

export async function logAdminAction(input: {
  action: string;
  actorId: string;
  actorEmail: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      targetType: input.targetType,
      targetId: input.targetId,
      details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
