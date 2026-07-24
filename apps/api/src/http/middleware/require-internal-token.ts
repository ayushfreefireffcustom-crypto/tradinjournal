// Guard for machine-to-machine routes (currently the worker asking the API to
// build and send a weekly digest). These carry no user session — the caller
// proves itself with a shared secret instead.
//
// Two deliberate choices:
//  • No token configured means the route is CLOSED, not open. A missing secret
//    can never accidentally expose an endpoint that acts on every user's data.
//  • Comparison is constant-time, so a caller can't recover the secret by
//    measuring how long a rejection takes.
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@tradinjournal/config';
import { UnauthorizedError } from '../errors.js';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireInternalToken(req: Request, _res: Response, next: NextFunction): void {
  const expected = env.INTERNAL_API_TOKEN;
  if (!expected) {
    next(new UnauthorizedError('Internal API is not configured'));
    return;
  }

  const header = req.get('x-internal-token');
  if (!header || !safeEqual(header, expected)) {
    next(new UnauthorizedError('Invalid internal token'));
    return;
  }

  next();
}
