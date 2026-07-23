// Tiny JSON cache over Redis for hot, shared, read-heavy data (calendar window,
// latest news). Entirely optional: with no REDIS_URL every call is a graceful
// no-op — `get` returns null (caller falls through to Postgres) and `set` does
// nothing. Never throws for a Redis hiccup; the source of truth is always the DB.
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

let redis: Redis | null = null;
let down = false;

function client(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (redis) return redis;
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: times => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  redis.on('error', () => {
    if (!down) logger.warn('Cache Redis unavailable — serving from Postgres');
    down = true;
  });
  redis.on('ready', () => { down = false; });
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = client();
  if (!c || down) return null;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = client();
  if (!c || down) return;
  try {
    await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Best-effort — a failed cache write must never fail the request.
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const c = client();
  if (!c || down || keys.length === 0) return;
  try {
    await c.del(...keys);
  } catch {
    /* ignore */
  }
}
