// "View as partner": an admin opens a partner's own dashboard, exactly as the partner
// sees it, without signing in as them. Partner-portal requests carry ?viewAs=<partnerId>.
// Only admins may use it, only for reading (any change is refused), and each start is
// written to the admin audit log by POST /api/admin/partners/:id/view-as.
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@tradinjournal/db';
import { isAdmin } from '../../lib/admin.js';

export async function viewAsPartner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = typeof req.query.viewAs === 'string' ? req.query.viewAs.trim() : '';
  if (!id) { next(); return; }
  const user = res.locals.user as { email?: string } | undefined;
  if (!isAdmin(user?.email)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only TRADElogs admins can view a partner’s dashboard.' } });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(403).json({ error: { code: 'READ_ONLY', message: 'You’re viewing as this partner, so changes are off. Exit the view to make changes as yourself.' } });
    return;
  }
  try {
    const p = await prisma.partner.findUnique({ where: { id }, select: { userId: true } });
    if (!p) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Partner not found' } }); return; }
    res.locals.partnerUserId = p.userId;
    next();
  } catch (err) { next(err); }
}

/** Whose partner record a portal request is about: the viewed partner, or the signed-in user. */
export function partnerUserId(res: Response): string {
  return (res.locals.partnerUserId as string | undefined) ?? (res.locals.user as { id: string }).id;
}
