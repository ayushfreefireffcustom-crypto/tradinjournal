import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_TRADER_PAPER, type TraderPaperJob, type QueueConnection } from '@tradinjournal/queue';
import { tickTraderPaper, InternalApiError } from '../lib/api-client.js';

export function createTraderPaperWorker(
  connection: QueueConnection,
  _queue: Queue<TraderPaperJob>,
): Worker<TraderPaperJob> {
  return new Worker<TraderPaperJob>(
    QUEUE_TRADER_PAPER,
    async (job: Job<TraderPaperJob>) => {
      const res = await tickTraderPaper({ bucket: job.data.bucket });
      if (res.opened || res.closed || res.errors) {
        logger.info(
          `Trader paper ${job.data.bucket}: scanned=${res.scanned} opened=${res.opened} closed=${res.closed} err=${res.errors}`,
        );
      }
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
