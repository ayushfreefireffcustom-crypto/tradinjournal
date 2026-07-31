// Market warm worker. Each tick asks the API to refresh the configured hot
// symbol set so popular symbols stay a cache hit for everyone (bounded provider
// calls regardless of user count). The API does the work; the worker only
// schedules and forwards the minute bucket for idempotent logging.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_MARKET_WARM, type MarketWarmJob, type QueueConnection } from '@tradinjournal/queue';
import { warmMarket, InternalApiError } from '../lib/api-client.js';

export function createMarketWarmWorker(connection: QueueConnection, _queue: Queue<MarketWarmJob>): Worker<MarketWarmJob> {
  return new Worker<MarketWarmJob>(
    QUEUE_MARKET_WARM,
    async (job: Job<MarketWarmJob>) => {
      const res = await warmMarket({ bucket: job.data.bucket });
      logger.info(`Market warm ${job.data.bucket}: warmed ${res.warmed} symbol/timeframe pairs`);
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1, // single flight — providers are rate-limited upstream
    },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
