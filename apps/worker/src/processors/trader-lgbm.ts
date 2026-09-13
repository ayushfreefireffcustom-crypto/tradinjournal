import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_TRADER_LGBM, type TraderLgbmJob, type QueueConnection } from '@tradinjournal/queue';
import { trainTraderLgbm, InternalApiError } from '../lib/api-client.js';

export function createTraderLgbmWorker(
  connection: QueueConnection,
  _queue: Queue<TraderLgbmJob>,
): Worker<TraderLgbmJob> {
  return new Worker<TraderLgbmJob>(
    QUEUE_TRADER_LGBM,
    async (job: Job<TraderLgbmJob>) => {
      const res = await trainTraderLgbm({ bucket: job.data.bucket });
      logger.info(
        `Trader lgbm ${job.data.bucket}: trained=${res.trained} serving=${res.serving} ${res.reason ?? ''}`,
      );
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1,
    },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
