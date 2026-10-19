// Per-user fixed-window rate limit middleware on the shared cache client
// (lib/cache.ts: Redis across instances, in-process fallback). Fails open if the
// counter can't be read — a limiter must never take the endpoint down.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '@tradinjournal/logger';
import { AppError } from '../http/errors.js';
import { cacheIncr } from './cache.js';

export function perUserRateLimit(opts: { name: string; max: number; windowSeconds: number; message: string }): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const userId = res.locals.user?.id as string | undefined;
    if (!userId) return next();
    let count: number;
    try {
      count = await cacheIncr(`rl:${opts.name}:${userId}`, opts.windowSeconds);
    } catch (err) {
      logger.warn(`[rate-limit] ${opts.name} check failed open`, { err });
      return next();
    }
    if (count > opts.max) {
      res.setHeader('Retry-After', String(opts.windowSeconds));
      return next(new AppError(429, 'RATE_LIMITED', opts.message));
    }
    next();
  };
}
