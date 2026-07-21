// Per-user fixed-window rate limiter for the AI endpoints. Uses Redis when
// REDIS_URL is configured (works across multiple API instances); falls back to
// an in-process Map otherwise, so local dev needs no Redis. Throws
// AiRateLimitError (429) when the window budget is exceeded.
import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AiRateLimitError } from '../../http/errors.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 20; // per user, per window

// ── Redis backend (shared across instances) ──────────────────────────────────
let redis: Redis | null = null;
if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    redis.on('error', err => logger.warn(`AI rate-limit Redis error: ${err.message}`));
  } catch (err) {
    logger.warn(`AI rate-limit Redis init failed, using in-memory: ${(err as Error).message}`);
    redis = null;
  }
}

// ── In-memory backend (single instance / dev) ────────────────────────────────
const memory = new Map<string, { count: number; resetAt: number }>();

async function hit(userId: string): Promise<boolean> {
  if (redis) {
    const key = `airl:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    return count <= MAX_REQUESTS;
  }
  const now = Date.now();
  const entry = memory.get(userId);
  if (!entry || entry.resetAt <= now) {
    memory.set(userId, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_REQUESTS;
}

export async function aiRateLimit(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const allowed = await hit(userId);
    if (!allowed) throw new AiRateLimitError();
    next();
  } catch (err) {
    // If Redis is momentarily unreachable, fail open rather than block the user.
    if (err instanceof AiRateLimitError) return next(err);
    logger.warn(`AI rate-limit check failed open: ${(err as Error).message}`);
    next();
  }
}
