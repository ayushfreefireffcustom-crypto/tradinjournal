import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors.js';
import { isAdmin } from '../../lib/admin.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.user;
  if (!user?.id) {
    next(new UnauthorizedError());
    return;
  }
  if (!isAdmin(user.email)) {
    next(new ForbiddenError('Admin access required'));
    return;
  }
  next();
}
