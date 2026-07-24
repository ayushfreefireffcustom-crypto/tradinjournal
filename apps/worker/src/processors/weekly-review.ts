// Weekly AI review pipeline.
//
//   cron (Sat 09:00 UTC) ──▶ "dispatch" job
//                              │  pages through everyone due a digest
//                              ▼
//                            one "send" job per user
//                              │  concurrency 1, rate-limited
//                              ▼
//                            POST /internal/ai/weekly-review
//
// Why the fan-out is throttled: building a digest reads the MT5 bridge, which
// serialises on a single terminal. Firing every send at once on a Saturday
// morning would queue behind one terminal and time out en masse. Concurrency and
// rate come from config so they can be raised when the bridge is scaled out.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import {
  QUEUE_WEEKLY_REVIEW,
  isoWeekKey,
  weeklyReviewSendJobId,
  type QueueConnection,
  type WeeklyReviewJob,
} from '@tradinjournal/queue';
import { fetchWeeklyReviewRecipients, runWeeklyReview, InternalApiError } from '../lib/api-client.js';

/** Users fetched per page while fanning out. */
const PAGE_SIZE = 100;

/**
 * Start of the run's week (Monday 00:00 UTC). Anyone whose last send predates
 * this is due; anyone sent after it is already done. This is what makes a
 * duplicate cron fire or a manual re-run harmless.
 */
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday is 7, not 0
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  return d;
}

async function processDispatch(queue: Queue<WeeklyReviewJob>, weekKey: string): Promise<{ queued: number }> {
  const sentAfter = weekStart().toISOString();

  let cursor: string | undefined;
  let queued = 0;

  for (;;) {
    const page = await fetchWeeklyReviewRecipients({ sentAfter, cursor, limit: PAGE_SIZE });
    for (const { userId } of page.recipients) {
      await queue.add(
        'send',
        { kind: 'send', userId, weekKey } satisfies WeeklyReviewJob,
        // Stable id: re-dispatching the same week is a no-op rather than a
        // second email. BullMQ drops an add() whose jobId already exists.
        { jobId: weeklyReviewSendJobId(userId, weekKey) },
      );
      queued += 1;
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  logger.info(`Weekly review ${weekKey}: queued ${queued} digest(s)`);
  return { queued };
}

async function processSend(userId: string, weekKey: string): Promise<void> {
  const outcome = await runWeeklyReview({ userId, sentAfter: weekStart().toISOString() });
  if (outcome.sent) logger.info(`Weekly review ${weekKey}: sent to ${userId} (${outcome.accounts} account(s))`);
  else logger.info(`Weekly review ${weekKey}: skipped ${userId} — ${outcome.reason}`);
}

/**
 * Register the weekly-review worker. The queue is passed in rather than taken
 * from the job (BullMQ keeps `job.queue` protected) — the dispatch step needs it
 * to enqueue the per-user sends.
 */
export function createWeeklyReviewWorker(
  connection: QueueConnection,
  queue: Queue<WeeklyReviewJob>,
): Worker<WeeklyReviewJob> {
  return new Worker<WeeklyReviewJob>(
    QUEUE_WEEKLY_REVIEW,
    async (job: Job<WeeklyReviewJob>) => {
      const data = job.data;
      const weekKey = data.weekKey || isoWeekKey();
      if (data.kind === 'dispatch') return processDispatch(queue, weekKey);
      await processSend(data.userId, weekKey);
      return undefined;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: env.WEEKLY_REVIEW_CONCURRENCY,
      limiter: { max: env.WEEKLY_REVIEW_PER_MINUTE, duration: 60_000 },
    },
  );
}

/**
 * A 401 from the API means the token is wrong — retrying can only produce the
 * same result, so surface it loudly instead of burning the retry budget.
 */
export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
