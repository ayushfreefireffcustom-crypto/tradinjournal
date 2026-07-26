// News enrichment worker. Runs on its own cron, decoupled from ingestion: each
// tick asks the API to LLM-tag a batch of un-enriched items (sentiment /
// relevance / impact / category). Keeping this separate means a slow or degraded
// LLM never holds up the fast fetch-and-store path.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_NEWS_ENRICH, type NewsEnrichJob, type QueueConnection } from '@tradinjournal/queue';
import { enrichNews, InternalApiError } from '../lib/api-client.js';

export function createNewsEnrichWorker(connection: QueueConnection, _queue: Queue<NewsEnrichJob>): Worker<NewsEnrichJob> {
  return new Worker<NewsEnrichJob>(
    QUEUE_NEWS_ENRICH,
    async (job: Job<NewsEnrichJob>) => {
      const res = await enrichNews({ bucket: job.data.bucket });
      logger.info(`News enrich ${job.data.bucket}: ${res.enriched} enriched`);
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1, // single flight — the LLM is rate/budget-limited upstream
    },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
