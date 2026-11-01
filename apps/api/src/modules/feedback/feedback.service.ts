// Help page feedback and bug reports (H10). Stored, and emailed to the admins
// so a person sees each one; admins mark them read or done.
import { env } from '@tradinjournal/config';
import { prisma } from '@tradinjournal/db';
import type { FeedbackInput } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { NotFoundError } from '../../http/errors.js';
import { sendEmail } from '../../lib/email/client.js';
import { feedbackAlertEmail } from '../../lib/email/templates.js';

const KIND: Record<FeedbackInput['kind'], string> = { bug: 'bug report', feedback: 'feedback', question: 'question' };

export async function submitFeedback(user: { id: string; email: string }, input: FeedbackInput, userAgent: string | null) {
  const row = await prisma.feedback.create({ data: { userId: user.id, kind: input.kind, message: input.message, page: input.page ?? null, userAgent: userAgent?.slice(0, 300) ?? null } });
  const { subject, html } = feedbackAlertEmail({ kind: KIND[input.kind], from: user.email, message: input.message, page: input.page ?? null });
  await Promise.all(env.ADMIN_EMAILS_LIST.map((to) => sendEmail({ to, subject, html }).catch((err) => logger.warn('[feedback] admin email failed', { err: (err as Error).message }))));
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

export async function myFeedback(userId: string) {
  const rows = await prisma.feedback.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return rows.map((r) => ({ id: r.id, kind: r.kind, message: r.message, status: r.status, createdAt: r.createdAt.toISOString() }));
}

export async function adminFeedback(q: { status?: string; cursor?: string }) {
  const rows = await prisma.feedback.findMany({
    where: { ...(q.status && ['new', 'read', 'done'].includes(q.status) ? { status: q.status } : {}) },
    orderBy: { createdAt: 'desc' }, take: 51, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { user: { select: { email: true, name: true } } },
  });
  const counts = await prisma.feedback.groupBy({ by: ['status'], _count: true });
  return {
    items: rows.slice(0, 50).map((r) => ({ id: r.id, kind: r.kind, message: r.message, page: r.page, userAgent: r.userAgent, status: r.status, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null, user: r.user })),
    nextCursor: rows.length > 50 ? rows[49]!.id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>,
  };
}

export async function setFeedbackStatus(id: string, status: 'new' | 'read' | 'done') {
  const r = await prisma.feedback.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Feedback not found');
  await prisma.feedback.update({ where: { id }, data: { status, readAt: status === 'new' ? null : r.readAt ?? new Date() } });
  return { id, status };
}
