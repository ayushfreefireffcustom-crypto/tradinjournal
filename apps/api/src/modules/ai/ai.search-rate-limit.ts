// Separate per-user budget for web searches, on top of the 20 chats/min limit in
// ai.rate-limit.ts. A search is more expensive (external API + bigger prompt) and
// only fires for web/hybrid lanes, so it gets its own smaller budget counted ONLY
// when a search actually runs. Called inline from the controller (not as route
// middleware) for that reason.
//
// Mirrors ai.rate-limit.ts: Redis when REDIS_URL is set (shared across instances),
// in-memory Map otherwise. Fails OPEN on Redis hiccups — a rate-limit outage must
// not block the coach.
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

const WINDOW_SECONDS = 60;
const MAX_SEARCHES = 10; // per user, per window

let redis: Redis | null = null;
let redisHealthy = false;
if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: times => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    redis.on('ready', () => { redisHealthy = true; });
    redis.on('error', () => {
      if (redisHealthy) logger.warn('AI search rate-limit Redis unavailable — falling back to in-memory');
      redisHealthy = false;
    });
    redis.on('end', () => { redisHealthy = false; });
  } catch (err) {
    logger.warn(`AI search rate-limit Redis init failed, using in-memory: ${(err as Error).message}`);
    redis = null;
  }
}

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true when the user is still within their search budget for this window
 * (and counts the search). Fails OPEN (returns true) on any backend error so a
 * limiter outage never blocks a search. Over-budget → false (caller skips search,
 * chat still answers).
 */
export async function checkSearchBudget(userId: string): Promise<boolean> {
  if (redis && redisHealthy) {
    try {
      const key = `aisr:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WINDOW_SECONDS);
      return count <= MAX_SEARCHES;
    } catch {
      // fall through to in-memory
    }
  }
  const now = Date.now();
  const entry = memory.get(userId);
  if (!entry || entry.resetAt <= now) {
    memory.set(userId, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_SEARCHES;
}
