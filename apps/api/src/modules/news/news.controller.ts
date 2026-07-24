import type { Request, Response, NextFunction } from 'express';
import type { NewsQuery } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { ingestNews, listNews } from './news.service.js';

// GET /api/news — paginated feed (auth'd).
export async function handleListNews(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as unknown as NewsQuery;
    ok(res, await listNews(q));
  } catch (err) {
    next(err);
  }
}

// POST /internal/news/ingest — worker-only.
export async function handleIngestNews(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await ingestNews());
  } catch (err) {
    next(err);
  }
}
