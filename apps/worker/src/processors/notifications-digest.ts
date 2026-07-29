// Daily email-digest worker. Once a day it asks the API to compile each opted-in
// user's upcoming events into a single email. The API owns the once-per-day
// idempotency ledger; the worker only schedules and forwards the day bucket.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_NOTIFICATIONS_DIGEST, type NotificationsDigestJob, type QueueConnection } from '@tradinjournal/queue';
import { dispatchDigest, InternalApiError } from '../lib/api-client.js';

export function createDigestWorker(connection: QueueConnection, _queue: Queue<NotificationsDigestJob>): Worker<NotificationsDigestJob> {
  return new Worker<NotificationsDigestJob>(
    QUEUE_NOTIFICATIONS_DIGEST,
    async (job: Job<NotificationsDigestJob>) => {
      const res = await dispatchDigest({ bucket: job.data.bucket });
      logger.info(`Digest ${job.data.bucket}: ${res.sent} email(s) sent to ${res.users} opted-in user(s)`);
      return res;
    },
    { connection: connection as unknown as ConnectionOptions, concurrency: 1 },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
