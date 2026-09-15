// Trader Master grading worker. Each cron tick asks the API to grade pending
// analyses against subsequent candles (triple-barrier). The API owns DB + market
// data; the worker only schedules and forwards.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_TRADER_GRADE, type TraderGradeJob, type QueueConnection } from '@tradinjournal/queue';
import { gradeTraderAnalyses, InternalApiError } from '../lib/api-client.js';

export function createTraderGradeWorker(
  connection: QueueConnection,
  _queue: Queue<TraderGradeJob>,
): Worker<TraderGradeJob> {
  return new Worker<TraderGradeJob>(
    QUEUE_TRADER_GRADE,
    async (job: Job<TraderGradeJob>) => {
      const res = await gradeTraderAnalyses({ bucket: job.data.bucket });
      logger.info(
        `Trader grade ${job.data.bucket}: scanned=${res.scanned} graded=${res.graded} open=${res.stillOpen} err=${res.errors}`,
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
