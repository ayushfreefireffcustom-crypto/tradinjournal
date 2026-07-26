// News ingestion worker. Each tick asks the API to fetch every news provider,
// dedup, and bulk-store new items. Enrichment is a separate worker (news-enrich)
// so the LLM never blocks the fast fetch path. The API does all the work; the
// worker only schedules and forwards the minute bucket for idempotent logging.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_NEWS_INGEST, type NewsIngestJob, type QueueConnection } from '@tradinjournal/queue';
import { ingestNews, InternalApiError } from '../lib/api-client.js';

export function createNewsWorker(connection: QueueConnection, _queue: Queue<NewsIngestJob>): Worker<NewsIngestJob> {
  return new Worker<NewsIngestJob>(
    QUEUE_NEWS_INGEST,
    async (job: Job<NewsIngestJob>) => {
      const res = await ingestNews({ bucket: job.data.bucket });
      logger.info(`News ingest ${job.data.bucket}: fetched ${res.fetched}, +${res.inserted} new`);
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
