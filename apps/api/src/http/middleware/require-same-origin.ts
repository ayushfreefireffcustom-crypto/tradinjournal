// CSRF guard for the session-cookie API. Auth cookies are SameSite=None, so a
// page on any other site can make a signed-in browser send a plain <form> POST
// (or a no-cors fetch) here with the cookie attached. CORS only stops that page
// from READING the reply — the write itself still runs. JSON-body routes are
// safe by accident (a form can't send application/json, so validation fails),
// but body-less actions (mark read, sync now, admin recheck, archive…) are not.
//
// Browsers always send Origin on cross-origin writes, so: a write whose Origin
// is present and not the web app is refused. No Origin means a non-browser
// caller (worker, curl, server-side fetch), which carries no ambient cookie risk.
// better-auth's own /api/auth/* routes do their own origin check upstream.
import type { Request, Response, NextFunction } from 'express';
import { env } from '@tradinjournal/config';
import { ForbiddenError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const allowed = new Set(
  [...env.CORS_ORIGIN.split(','), env.APP_URL].map(o => o.trim().replace(/\/+$/, '')).filter(Boolean),
);

export function requireSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  if (origin && !allowed.has(origin)) {
    next(new ForbiddenError('Cross-site request blocked'));
    return;
  }
  next();
}
