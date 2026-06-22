import type { Request, Response, NextFunction } from 'express';
import { auth } from '../../lib/auth.js';
import { UnauthorizedError } from '../errors.js';

declare global {
  namespace Express {
    interface Locals {
      user: typeof auth.$Infer.Session.user;
      session: typeof auth.$Infer.Session.session;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session?.user) {
      next(new UnauthorizedError());
      return;
    }

    res.locals.user = session.user;
    res.locals.session = session.session;
    next();
  } catch {
    next(new UnauthorizedError());
  }
}
