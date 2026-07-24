/**
 * Worker entrypoint.
 *
 * Currently runs the weekly AI review pipeline. The worker schedules work and
 * applies backpressure; it holds no database connection and never talks to the
 * MT5 bridge — see src/lib/api-client.ts for why.
 *
 * Without REDIS_URL + INTERNAL_API_TOKEN the process starts, logs why it has
 * nothing to do, and idles. It never crashes a deployment that simply hasn't
 * provisioned Redis.
 */
import type { Worker } from 'bullmq';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import {
  QUEUE_WEEKLY_REVIEW,
  WEEKLY_REVIEW_SCHEDULER_ID,
  createRedisConnection,
  getQueue,
  closeQueues,
  isoWeekKey,
  type WeeklyReviewJob,
} from '@tradinjournal/queue';
import { createWeeklyReviewWorker, isUnrecoverable } from './processors/weekly-review.js';

const workers: Worker[] = [];
let connection: ReturnType<typeof createRedisConnection> = null;

async function start(): Promise<void> {
  if (!env.WEEKLY_REVIEW_ENABLED) {
    const missing = [!env.REDIS_URL && 'REDIS_URL', !env.INTERNAL_API_TOKEN && 'INTERNAL_API_TOKEN'].filter(Boolean);
    logger.warn(`Weekly review disabled — missing ${missing.join(' and ')}. Worker is idle.`);
    return;
  }

  connection = createRedisConnection();
  if (!connection) {
    logger.warn('No Redis connection available — worker is idle.');
    return;
  }

  // Register the recurring dispatch. `upsertJobScheduler` replaces any previous
  // definition under the same id, so changing WEEKLY_REVIEW_CRON takes effect on
  // the next deploy instead of leaving a stale schedule behind.
  const queue = getQueue<WeeklyReviewJob>(QUEUE_WEEKLY_REVIEW);
  if (!queue) {
    logger.warn('Weekly review queue unavailable — worker is idle.');
    return;
  }

  await queue.upsertJobScheduler(
    WEEKLY_REVIEW_SCHEDULER_ID,
    { pattern: env.WEEKLY_REVIEW_CRON, tz: 'UTC' },
    { name: 'dispatch', data: { kind: 'dispatch', weekKey: isoWeekKey() } },
  );
  logger.info(`Weekly review scheduled: "${env.WEEKLY_REVIEW_CRON}" UTC`);

  const worker = createWeeklyReviewWorker(connection, queue);
  worker.on('failed', (job, err) => {
    const attempt = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?';
    if (isUnrecoverable(err)) {
      logger.error(`Weekly review job ${job?.id} rejected by the API (check INTERNAL_API_TOKEN): ${err.message}`);
    } else {
      logger.warn(`Weekly review job ${job?.id} failed (attempt ${attempt}): ${err.message}`);
    }
  });
  worker.on('error', err => logger.error(`Weekly review worker error: ${err.message}`));
  workers.push(worker as unknown as Worker);

  logger.info(
    `Weekly review worker ready — concurrency ${env.WEEKLY_REVIEW_CONCURRENCY}, ${env.WEEKLY_REVIEW_PER_MINUTE}/min`,
  );
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down worker`);
  try {
    // Close workers first so in-flight jobs finish before the queues go away.
    await Promise.all(workers.map(w => w.close()));
    await closeQueues();
    await connection?.quit();
  } catch (err) {
    logger.warn(`Shutdown error (continuing): ${(err as Error).message}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

logger.info('Worker process started');

start().catch((err: Error) => {
  logger.error(`Worker failed to start: ${err.message}`);
  process.exit(1);
});
