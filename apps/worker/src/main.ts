/**
 * Worker entrypoint.
 *
 * Runs the background pipelines (weekly AI review, economic-calendar ingestion,
 * and — later — news ingestion + notifications). The worker only schedules work
 * and applies backpressure; it holds no database connection and never talks to
 * the MT5 bridge or providers directly — it calls the API's /internal routes.
 * See src/lib/api-client.ts for why.
 *
 * Without REDIS_URL + INTERNAL_API_TOKEN the process starts, logs why it has
 * nothing to do, and idles. It never crashes a deployment lacking Redis.
 */
import type { Worker } from 'bullmq';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import {
  QUEUE_WEEKLY_REVIEW,
  WEEKLY_REVIEW_SCHEDULER_ID,
  QUEUE_CALENDAR_INGEST,
  CALENDAR_INGEST_SCHEDULER_ID,
  QUEUE_NEWS_INGEST,
  NEWS_INGEST_SCHEDULER_ID,
  QUEUE_NEWS_ENRICH,
  NEWS_ENRICH_SCHEDULER_ID,
  QUEUE_NOTIFICATIONS,
  NOTIFICATIONS_SCHEDULER_ID,
  QUEUE_NOTIFICATIONS_DIGEST,
  NOTIFICATIONS_DIGEST_SCHEDULER_ID,
  QUEUE_MARKET_WARM,
  MARKET_WARM_SCHEDULER_ID,
  QUEUE_PRICE_ALERTS,
  PRICE_ALERTS_SCHEDULER_ID,
  QUEUE_MACRO_INGEST,
  MACRO_INGEST_SCHEDULER_ID,
  QUEUE_TRADER_GRADE,
  TRADER_GRADE_SCHEDULER_ID,
  QUEUE_TRADER_META,
  TRADER_META_SCHEDULER_ID,
  createRedisConnection,
  getQueue,
  closeQueues,
  isoWeekKey,
  timeBucket,
  type WeeklyReviewJob,
  type CalendarIngestJob,
  type NewsIngestJob,
  type NewsEnrichJob,
  type NotificationsJob,
  type NotificationsDigestJob,
  type MarketWarmJob,
  type PriceAlertsJob,
  type MacroIngestJob,
  type TraderGradeJob,
  type TraderMetaTrainJob,
} from '@tradinjournal/queue';
import { createWeeklyReviewWorker, isUnrecoverable as weeklyUnrecoverable } from './processors/weekly-review.js';
import { createCalendarWorker, isUnrecoverable as calendarUnrecoverable } from './processors/calendar-ingest.js';
import { createNewsWorker, isUnrecoverable as newsUnrecoverable } from './processors/news-ingest.js';
import { createNewsEnrichWorker, isUnrecoverable as newsEnrichUnrecoverable } from './processors/news-enrich.js';
import { createNotificationsWorker, isUnrecoverable as notifUnrecoverable } from './processors/notifications.js';
import { createDigestWorker, isUnrecoverable as digestUnrecoverable } from './processors/notifications-digest.js';
import { createMarketWarmWorker, isUnrecoverable as marketWarmUnrecoverable } from './processors/market-warm.js';
import { createPriceAlertsWorker, isUnrecoverable as priceAlertsUnrecoverable } from './processors/price-alerts.js';
import { createMacroWorker, isUnrecoverable as macroUnrecoverable } from './processors/macro-ingest.js';
import { createTraderGradeWorker, isUnrecoverable as traderGradeUnrecoverable } from './processors/trader-grade.js';
import { createTraderMetaWorker, isUnrecoverable as traderMetaUnrecoverable } from './processors/trader-meta.js';

const workers: Worker[] = [];
let connection: ReturnType<typeof createRedisConnection> = null;

/** Standard failure/error logging for every registered worker. */
function attach(worker: Worker, label: string, unrecoverable: (err: unknown) => boolean): void {
  worker.on('failed', (job, err) => {
    const attempt = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?';
    if (unrecoverable(err)) {
      logger.error(`${label} job ${job?.id} rejected by the API (check INTERNAL_API_TOKEN): ${err.message}`);
    } else {
      logger.warn(`${label} job ${job?.id} failed (attempt ${attempt}): ${err.message}`);
    }
  });
  worker.on('error', err => logger.error(`${label} worker error: ${err.message}`));
  workers.push(worker);
}

async function start(): Promise<void> {
  // The worker can run as soon as it has Redis to queue on and a token to prove
  // itself to the API. Individual features no-op server-side when unconfigured.
  if (!env.REDIS_URL || !env.INTERNAL_API_TOKEN) {
    const missing = [!env.REDIS_URL && 'REDIS_URL', !env.INTERNAL_API_TOKEN && 'INTERNAL_API_TOKEN'].filter(Boolean);
    logger.warn(`Worker disabled — missing ${missing.join(' and ')}. Idle.`);
    return;
  }

  connection = createRedisConnection();
  if (!connection) {
    logger.warn('No Redis connection available — worker is idle.');
    return;
  }

  // ── Weekly AI review ────────────────────────────────────────────────────────
  const wrQueue = getQueue<WeeklyReviewJob>(QUEUE_WEEKLY_REVIEW);
  if (wrQueue) {
    await wrQueue.upsertJobScheduler(
      WEEKLY_REVIEW_SCHEDULER_ID,
      { pattern: env.WEEKLY_REVIEW_CRON, tz: 'UTC' },
      { name: 'dispatch', data: { kind: 'dispatch', weekKey: isoWeekKey() } },
    );
    attach(createWeeklyReviewWorker(connection, wrQueue) as unknown as Worker, 'Weekly review', weeklyUnrecoverable);
    logger.info(`Weekly review scheduled: "${env.WEEKLY_REVIEW_CRON}" UTC`);
  }

  // ── Economic-calendar ingestion ─────────────────────────────────────────────
  // Scheduled unconditionally — the API decides whether any providers are
  // configured (it no-ops when none), so the worker needn't know their keys.
  const calQueue = getQueue<CalendarIngestJob>(QUEUE_CALENDAR_INGEST);
  if (calQueue) {
    await calQueue.upsertJobScheduler(
      CALENDAR_INGEST_SCHEDULER_ID,
      { pattern: env.CALENDAR_INGEST_CRON, tz: 'UTC' },
      { name: 'ingest', data: { kind: 'calendar-ingest', bucket: timeBucket(new Date(), 'hour') } },
    );
    attach(createCalendarWorker(connection, calQueue) as unknown as Worker, 'Calendar ingest', calendarUnrecoverable);
    logger.info(`Calendar ingest scheduled: "${env.CALENDAR_INGEST_CRON}" UTC`);
  }

  // ── News ingestion ──────────────────────────────────────────────────────────
  // RSS baseline always has something to fetch, so this runs whenever the worker
  // does. This path is LLM-free (bulk fetch + store); enrichment is separate.
  const newsQueue = getQueue<NewsIngestJob>(QUEUE_NEWS_INGEST);
  if (newsQueue) {
    await newsQueue.upsertJobScheduler(
      NEWS_INGEST_SCHEDULER_ID,
      { pattern: env.NEWS_INGEST_CRON, tz: 'UTC' },
      { name: 'ingest', data: { kind: 'news-ingest', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createNewsWorker(connection, newsQueue) as unknown as Worker, 'News ingest', newsUnrecoverable);
    logger.info(`News ingest scheduled: "${env.NEWS_INGEST_CRON}" UTC`);
  }

  // ── News enrichment ─────────────────────────────────────────────────────────
  // Own cron, decoupled from ingest so the LLM never blocks the fetch path. The
  // API no-ops when AI is off or there's no backlog, and bounds spend per tick.
  const newsEnrichQueue = getQueue<NewsEnrichJob>(QUEUE_NEWS_ENRICH);
  if (newsEnrichQueue) {
    await newsEnrichQueue.upsertJobScheduler(
      NEWS_ENRICH_SCHEDULER_ID,
      { pattern: env.NEWS_ENRICH_CRON, tz: 'UTC' },
      { name: 'enrich', data: { kind: 'news-enrich', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createNewsEnrichWorker(connection, newsEnrichQueue) as unknown as Worker, 'News enrich', newsEnrichUnrecoverable);
    logger.info(`News enrich scheduled: "${env.NEWS_ENRICH_CRON}" UTC`);
  }

  // ── Notification dispatch (event reminders) ─────────────────────────────────
  // Every minute so reminder precision is ≤1 min. The API no-ops cheaply when
  // there are no due reminders.
  const notifQueue = getQueue<NotificationsJob>(QUEUE_NOTIFICATIONS);
  if (notifQueue) {
    await notifQueue.upsertJobScheduler(
      NOTIFICATIONS_SCHEDULER_ID,
      { pattern: '* * * * *', tz: 'UTC' },
      { name: 'dispatch', data: { kind: 'notifications-dispatch', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createNotificationsWorker(connection, notifQueue) as unknown as Worker, 'Notifications', notifUnrecoverable);
    logger.info('Notification dispatch scheduled: every minute UTC');
  }

  // ── Daily email digest ──────────────────────────────────────────────────────
  // Once a day: one compilation email per opted-in user (the email channel; push
  // covers real-time). The API bounds it to one send per user per day.
  const digestQueue = getQueue<NotificationsDigestJob>(QUEUE_NOTIFICATIONS_DIGEST);
  if (digestQueue) {
    await digestQueue.upsertJobScheduler(
      NOTIFICATIONS_DIGEST_SCHEDULER_ID,
      { pattern: env.NOTIFICATIONS_DIGEST_CRON, tz: 'UTC' },
      { name: 'digest', data: { kind: 'notifications-digest', bucket: timeBucket(new Date(), 'hour') } },
    );
    attach(createDigestWorker(connection, digestQueue) as unknown as Worker, 'Digest', digestUnrecoverable);
    logger.info(`Daily digest scheduled: "${env.NOTIFICATIONS_DIGEST_CRON}" UTC`);
  }

  // ── Market data warm refresh ────────────────────────────────────────────────
  // Keeps the configured hot symbol set a cache hit for everyone. The API no-ops
  // cheaply when no warm symbols are configured.
  const marketQueue = getQueue<MarketWarmJob>(QUEUE_MARKET_WARM);
  if (marketQueue) {
    await marketQueue.upsertJobScheduler(
      MARKET_WARM_SCHEDULER_ID,
      { pattern: env.MARKET_WARM_CRON, tz: 'UTC' },
      { name: 'warm', data: { kind: 'market-warm', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createMarketWarmWorker(connection, marketQueue) as unknown as Worker, 'Market warm', marketWarmUnrecoverable);
    logger.info(`Market warm scheduled: "${env.MARKET_WARM_CRON}" UTC`);
  }

  // ── Price alerts ────────────────────────────────────────────────────────────
  // Every minute; the API no-ops cheaply when no alerts are active.
  const alertsQueue = getQueue<PriceAlertsJob>(QUEUE_PRICE_ALERTS);
  if (alertsQueue) {
    await alertsQueue.upsertJobScheduler(
      PRICE_ALERTS_SCHEDULER_ID,
      { pattern: env.PRICE_ALERT_CRON, tz: 'UTC' },
      { name: 'dispatch', data: { kind: 'price-alerts', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createPriceAlertsWorker(connection, alertsQueue) as unknown as Worker, 'Price alerts', priceAlertsUnrecoverable);
    logger.info(`Price alerts scheduled: "${env.PRICE_ALERT_CRON}" UTC`);
  }

  // ── Macro data spine ────────────────────────────────────────────────────────
  // Scheduled unconditionally — the API no-ops when the macro segment is off
  // (no FRED key), so the worker needn't know the provider keys.
  const macroQueue = getQueue<MacroIngestJob>(QUEUE_MACRO_INGEST);
  if (macroQueue) {
    await macroQueue.upsertJobScheduler(
      MACRO_INGEST_SCHEDULER_ID,
      { pattern: env.MACRO_INGEST_CRON, tz: 'UTC' },
      { name: 'ingest', data: { kind: 'macro-ingest', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(createMacroWorker(connection, macroQueue) as unknown as Worker, 'Macro ingest', macroUnrecoverable);
    logger.info(`Macro ingest scheduled: "${env.MACRO_INGEST_CRON}" UTC`);
  }

  // ── Trader Master grading ───────────────────────────────────────────────────
  // Triple-barrier outcomes for published analyses — feeds the public track record.
  const traderGradeQueue = getQueue<TraderGradeJob>(QUEUE_TRADER_GRADE);
  if (traderGradeQueue) {
    await traderGradeQueue.upsertJobScheduler(
      TRADER_GRADE_SCHEDULER_ID,
      { pattern: env.TRADER_GRADE_CRON, tz: 'UTC' },
      { name: 'grade', data: { kind: 'trader-grade', bucket: timeBucket(new Date(), 'minute') } },
    );
    attach(
      createTraderGradeWorker(connection, traderGradeQueue) as unknown as Worker,
      'Trader grade',
      traderGradeUnrecoverable,
    );
    logger.info(`Trader grade scheduled: "${env.TRADER_GRADE_CRON}" UTC`);
  }

  const traderMetaQueue = getQueue<TraderMetaTrainJob>(QUEUE_TRADER_META);
  if (traderMetaQueue) {
    await traderMetaQueue.upsertJobScheduler(
      TRADER_META_SCHEDULER_ID,
      { pattern: env.TRADER_META_TRAIN_CRON, tz: 'UTC' },
      { name: 'train', data: { kind: 'trader-meta-train', bucket: timeBucket(new Date(), 'hour') } },
    );
    attach(
      createTraderMetaWorker(connection, traderMetaQueue) as unknown as Worker,
      'Trader meta',
      traderMetaUnrecoverable,
    );
    logger.info(`Trader meta train scheduled: "${env.TRADER_META_TRAIN_CRON}" UTC`);
  }

  logger.info(`Worker ready — ${workers.length} pipeline(s) registered.`);
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
