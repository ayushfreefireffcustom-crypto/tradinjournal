import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_TRADER_META, type TraderMetaTrainJob, type QueueConnection } from '@tradinjournal/queue';
import { trainTraderMeta, InternalApiError } from '../lib/api-client.js';

export function createTraderMetaWorker(
  connection: QueueConnection,
  _queue: Queue<TraderMetaTrainJob>,
): Worker<TraderMetaTrainJob> {
  return new Worker<TraderMetaTrainJob>(
    QUEUE_TRADER_META,
    async (job: Job<TraderMetaTrainJob>) => {
      const res = await trainTraderMeta({ bucket: job.data.bucket });
      logger.info(
        `Trader meta ${job.data.bucket}: trained=${res.trained} n=${res.sampleSize ?? 0} auc=${res.oofAuc ?? 'n/a'} ${res.reason ?? ''}`,
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
