// Tiny JSON cache for hot, shared, read-heavy data (calendar window, latest
// news). Prefers Redis; when Redis is absent or down it falls back to a bounded
// in-process cache so single-process / no-Redis deployments still get caching
// (otherwise every read hammers Postgres). Never throws; DB is the source of truth.
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

let redis: Redis | null = null;
let down = false;

// In-process fallback cache — bounded (oldest-out) + per-entry TTL.
const mem = new Map<string, { value: string; expires: number }>();
const MEM_MAX = 300;
function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) { mem.delete(key); return null; }
  return e.value;
}
function memSet(key: string, value: string, ttlSeconds: number): void {
  if (mem.size >= MEM_MAX) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
  mem.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}
function memDel(keys: string[]): void {
  for (const k of keys) mem.delete(k);
}

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
  if (c && !down) {
    try {
      const raw = await c.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* fall through to the in-process cache */
    }
  }
  const raw = memGet(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const json = JSON.stringify(value);
  const c = client();
  if (c && !down) {
    try {
      await c.set(key, json, 'EX', ttlSeconds);
      return;
    } catch {
      /* fall through to the in-process cache */
    }
  }
  memSet(key, json, ttlSeconds);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  memDel(keys);
  const c = client();
  if (!c || down) return;
  try {
    await c.del(...keys);
  } catch {
    /* ignore */
  }
}
