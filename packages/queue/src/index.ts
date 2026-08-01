/**
 * BullMQ queue infrastructure: Redis connection factory, queue names, and typed
 * job payloads shared by whoever produces a job and whoever consumes it.
 *
 * Everything here is inert without REDIS_URL. `getQueue()` returns null rather
 * than throwing, so a deployment with no Redis simply has no background jobs —
 * the API and web app are unaffected.
 */
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

// ─── Queue names + payloads ──────────────────────────────────────────────────

export const QUEUE_WEEKLY_REVIEW = 'weekly-review' as const;

/** Fan-out job: find everyone due a digest this week and enqueue one send each. */
export interface WeeklyReviewDispatchJob {
  kind: 'dispatch';
  /** ISO week the run belongs to (e.g. "2026-W30") — the idempotency scope. */
  weekKey: string;
}

/** Leaf job: build and email one user's digest. */
export interface WeeklyReviewSendJob {
  kind: 'send';
  userId: string;
  weekKey: string;
}

export type WeeklyReviewJob = WeeklyReviewDispatchJob | WeeklyReviewSendJob;

/** Name given to the repeatable (cron) job, so it can be found and replaced. */
export const WEEKLY_REVIEW_SCHEDULER_ID = 'weekly-review-cron';

/**
 * ISO-8601 week key ("2026-W30"). Used as the idempotency scope for a run: a
 * duplicate cron fire, a worker restart, or a manual re-dispatch within the same
 * week all resolve to the same key and therefore the same job id.
 */
export function isoWeekKey(date: Date = new Date()): string {
  // Shift to the Thursday of the same week — ISO weeks are defined by which year
  // that Thursday falls in, which is what makes year boundaries come out right.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday is 7, not 0
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Stable job id so the same user can't be queued twice for the same week. */
export function weeklyReviewSendJobId(userId: string, weekKey: string): string {
  return `wr-send:${weekKey}:${userId}`;
}

// ─── Phase 2: calendar / news / notification ingestion ───────────────────────
// The worker only schedules these and calls the API's /internal routes; it never
// touches the DB or providers. Payloads are tiny (the API does the real work).

export const QUEUE_CALENDAR_INGEST = 'calendar-ingest' as const;
export const QUEUE_NEWS_INGEST = 'news-ingest' as const;
export const QUEUE_NEWS_ENRICH = 'news-enrich' as const;
export const QUEUE_NOTIFICATIONS = 'notifications' as const;
export const QUEUE_NOTIFICATIONS_DIGEST = 'notifications-digest' as const;
export const QUEUE_MARKET_WARM = 'market-warm' as const;
export const QUEUE_PRICE_ALERTS = 'price-alerts' as const;

export const CALENDAR_INGEST_SCHEDULER_ID = 'calendar-ingest-cron';
export const NEWS_INGEST_SCHEDULER_ID = 'news-ingest-cron';
export const NEWS_ENRICH_SCHEDULER_ID = 'news-enrich-cron';
export const NOTIFICATIONS_SCHEDULER_ID = 'notifications-cron';
export const NOTIFICATIONS_DIGEST_SCHEDULER_ID = 'notifications-digest-cron';
export const MARKET_WARM_SCHEDULER_ID = 'market-warm-cron';
export const PRICE_ALERTS_SCHEDULER_ID = 'price-alerts-cron';

/** Trigger a calendar ingest for a UTC window (bucketed for idempotency). */
export interface CalendarIngestJob {
  kind: 'calendar-ingest';
  /** Bucket key (e.g. "2026-07-25T12" — hour) so a duplicate fire is a no-op. */
  bucket: string;
}

/** Trigger a news ingest tick (bucketed to the minute). */
export interface NewsIngestJob {
  kind: 'news-ingest';
  bucket: string;
}

/** Trigger a news enrichment tick — drains the un-enriched backlog (LLM). */
export interface NewsEnrichJob {
  kind: 'news-enrich';
  bucket: string;
}

/** Trigger a notification dispatch sweep (bucketed to the minute). */
export interface NotificationsJob {
  kind: 'notifications-dispatch';
  bucket: string;
}

/** Trigger the daily email digest (bucketed to the day). */
export interface NotificationsDigestJob {
  kind: 'notifications-digest';
  bucket: string;
}

/** Trigger a market warm refresh — refetch the hot symbol set (bucketed/minute). */
export interface MarketWarmJob {
  kind: 'market-warm';
  bucket: string;
}

/** Trigger a price-alert dispatch sweep (bucketed to the minute). */
export interface PriceAlertsJob {
  kind: 'price-alerts';
  bucket: string;
}

/** Truncate a Date to an idempotency bucket at hour or minute granularity. */
export function timeBucket(date: Date, granularity: 'hour' | 'minute'): string {
  const iso = date.toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ
  return granularity === 'hour' ? iso.slice(0, 13) : iso.slice(0, 16);
}

export function calendarIngestJobId(bucket: string): string {
  return `cal-ingest:${bucket}`;
}
export function newsIngestJobId(bucket: string): string {
  return `news-ingest:${bucket}`;
}
export function newsEnrichJobId(bucket: string): string {
  return `news-enrich:${bucket}`;
}
export function notificationsJobId(bucket: string): string {
  return `notif:${bucket}`;
}
export function notificationsDigestJobId(bucket: string): string {
  return `notif-digest:${bucket}`;
}
export function marketWarmJobId(bucket: string): string {
  return `market-warm:${bucket}`;
}
export function priceAlertsJobId(bucket: string): string {
  return `price-alerts:${bucket}`;
}

// ─── Connection ──────────────────────────────────────────────────────────────

/**
 * The connection type, re-exported so consumers can pass connections around
 * without taking a direct dependency on ioredis.
 */
export type QueueConnection = Redis;

/**
 * Describe a connection failure usefully. ioredis surfaces AggregateError for a
 * multi-address failure, and its `.message` is empty — logging that alone
 * produces "Queue Redis error:" with nothing after it.
 */
function describeError(err: Error): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (err.message) return code ? `${code}: ${err.message}` : err.message;
  const inner = (err as AggregateError).errors?.[0] as Error | undefined;
  return code ?? inner?.message ?? err.name;
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its connection — it manages
 * retries itself, and ioredis's default would abort blocking commands mid-wait.
 *
 * ioredis retries a dead endpoint several times a second, so errors are logged
 * on the transition into failure and again on recovery, never once per attempt.
 * An unreachable Redis must not flood the logs of a long-running worker.
 */
export function createRedisConnection(): Redis | null {
  if (!env.REDIS_URL) return null;
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  let down = false;
  redis.on('error', err => {
    if (down) return;
    down = true;
    logger.error(`Queue Redis unavailable (retrying): ${describeError(err)}`);
  });
  redis.on('ready', () => {
    if (down) logger.info('Queue Redis connection restored');
    down = false;
  });

  return redis;
}

/** Shared default job policy: bounded retries, bounded history. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  // Keep Redis from growing without bound while retaining enough to debug.
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: { age: 30 * 24 * 3600, count: 5000 },
};

// One Queue instance per name per process; BullMQ holds a connection per queue.
const queues = new Map<string, Queue>();

/**
 * Get (or lazily create) a queue. Returns null when Redis isn't configured, so
 * callers degrade to "no background work" instead of crashing.
 */
export function getQueue<T = unknown>(name: string): Queue<T> | null {
  const existing = queues.get(name);
  if (existing) return existing as unknown as Queue<T>;

  const connection = createRedisConnection();
  if (!connection) return null;

  const queue = new Queue<T>(name, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queues.set(name, queue as unknown as Queue);
  return queue;
}

/** Close every queue this process opened — call on SIGINT/SIGTERM. */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map(q => q.close()));
  queues.clear();
}
