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

// ─── Connection ──────────────────────────────────────────────────────────────

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its connection — it manages
 * retries itself, and ioredis's default would abort blocking commands mid-wait.
 */
export function createRedisConnection(): Redis | null {
  if (!env.REDIS_URL) return null;
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  redis.on('error', err => logger.error(`Queue Redis error: ${err.message}`));
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
