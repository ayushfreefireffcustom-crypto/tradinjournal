// Price-alert worker. Each tick asks the API to check every active alert against
// the current price and fire on a threshold cross. The API does the work (DB +
// price lookups + delivery); the worker only schedules and forwards the minute
// bucket for idempotent logging.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_PRICE_ALERTS, type PriceAlertsJob, type QueueConnection } from '@tradinjournal/queue';
import { dispatchPriceAlerts, InternalApiError } from '../lib/api-client.js';

export function createPriceAlertsWorker(connection: QueueConnection, _queue: Queue<PriceAlertsJob>): Worker<PriceAlertsJob> {
  return new Worker<PriceAlertsJob>(
    QUEUE_PRICE_ALERTS,
    async (job: Job<PriceAlertsJob>) => {
      const res = await dispatchPriceAlerts({ bucket: job.data.bucket });
      if (res.fired > 0) logger.info(`Price alerts ${job.data.bucket}: checked ${res.checked}, fired ${res.fired}`);
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1, // single flight — reads shared price cache
    },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
