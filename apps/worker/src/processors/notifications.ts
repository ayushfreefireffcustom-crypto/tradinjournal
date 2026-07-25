// Notification dispatch worker. Each minute it asks the API to sweep for events
// entering a user's reminder window and deliver across their channels. The API
// owns the idempotency ledger; the worker only schedules and forwards the bucket.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_NOTIFICATIONS, type NotificationsJob, type QueueConnection } from '@tradinjournal/queue';
import { dispatchNotifications, InternalApiError } from '../lib/api-client.js';

export function createNotificationsWorker(connection: QueueConnection, _queue: Queue<NotificationsJob>): Worker<NotificationsJob> {
  return new Worker<NotificationsJob>(
    QUEUE_NOTIFICATIONS,
    async (job: Job<NotificationsJob>) => {
      const res = await dispatchNotifications({ bucket: job.data.bucket });
      if (res.delivered > 0) logger.info(`Notifications ${job.data.bucket}: ${res.delivered} delivered across ${res.events} event(s)`);
      return res;
    },
    { connection: connection as unknown as ConnectionOptions, concurrency: 1 },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
