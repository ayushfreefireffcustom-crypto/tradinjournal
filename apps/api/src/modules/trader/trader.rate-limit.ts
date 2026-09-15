// Per-user rate limit for Trader Master analyze. Protects the free upstream
// quotas (Yahoo, Groq). Redis-backed with an in-memory fallback — same shape as
// the macro assistant limiter, its own key namespace and budget.
import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AiRateLimitError } from '../../http/errors.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 15;

let redis: Redis | null = null;
let redisHealthy = false;
if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    redis.on('ready', () => { redisHealthy = true; });
    redis.on('error', () => {
      if (redisHealthy) logger.warn('Trader rate-limit Redis unavailable — in-memory');
      redisHealthy = false;
    });
  } catch {
    redis = null;
  }
}

const memory = new Map<string, { count: number; resetAt: number }>();

async function hit(userId: string): Promise<boolean> {
  if (redis && redisHealthy) {
    try {
      const key = `trader:rl:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WINDOW_SECONDS);
      return count <= MAX_REQUESTS;
    } catch { /* fall through to memory */ }
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

export async function traderRateLimit(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    if (!(await hit(userId))) throw new AiRateLimitError('Trader Master rate limit — try again shortly.');
    next();
  } catch (err) {
    if (err instanceof AiRateLimitError) return next(err);
    next();
  }
}
