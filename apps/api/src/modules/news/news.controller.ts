import type { Request, Response, NextFunction } from 'express';
import type { NewsQuery } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { ok } from '../../http/response.js';
import { isAiEnabled, getProvider } from '../../lib/ai/provider.js';
import { subscribeNews } from '../../lib/news/stream.js';
import { BRIEF_PROMPT, briefUserContent } from '../../lib/news/prompts.js';
import { env } from '@tradinjournal/config';
import type { NewsPreferencesInput } from '@tradinjournal/contracts';
import {
  ingestNews,
  enrichPendingNews,
  listNews,
  listSources,
  getNewsPreferences,
  setNewsPreferences,
  getBriefHeadlines,
} from './news.service.js';

function sseWrite(res: Response, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

// GET /api/news — paginated feed (auth'd).
export async function handleListNews(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as unknown as NewsQuery;
    ok(res, await listNews(q));
  } catch (err) {
    next(err);
  }
}

// GET /api/news/sources — the outlet catalog for the personalization picker.
export async function handleListSources(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { sources: listSources() });
  } catch (err) {
    next(err);
  }
}

// GET /api/news/preferences — the user's preferred outlet keys.
export async function handleGetNewsPrefs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getNewsPreferences(res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

// PUT /api/news/preferences — replace the user's preferred outlets.
export async function handleSetNewsPrefs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sources } = req.body as NewsPreferencesInput;
    ok(res, await setNewsPreferences(res.locals.user.id as string, sources));
  } catch (err) {
    next(err);
  }
}

// GET /api/news/stream — live feed over SSE. Forwards newly-ingested items as
// they arrive; heartbeats keep proxies warm. Degrades to heartbeat-only (client
// polls) when Redis isn't configured.
export function handleNewsStream(req: Request, res: Response): void {
  sseHeaders(res);
  res.write(': connected\n\n');

  const unsubscribe = subscribeNews(items => {
    if (!res.writableEnded) sseWrite(res, { items });
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  });
}

// GET /api/news/brief/stream — one-shot AI "morning brief" over SSE, grounded on
// today's top headlines. Reuses the coach's streaming shape.
export async function handleNewsBrief(req: Request, res: Response): Promise<void> {
  sseHeaders(res);
  const controller = new AbortController();
  req.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    const headlines = await getBriefHeadlines();
    if (!isAiEnabled() || headlines.length === 0) {
      sseWrite(res, {
        token: isAiEnabled()
          ? 'No notable headlines in the last 24 hours yet — check back once the feed fills in.'
          : 'The AI brief is unavailable right now. Browse the live feed below for the latest headlines.',
      });
      sseWrite(res, { done: true });
      res.end();
      return;
    }
    const provider = getProvider();
    for await (const token of provider.stream(
      [
        { role: 'system', content: BRIEF_PROMPT },
        { role: 'user', content: briefUserContent(headlines) },
      ],
      controller.signal,
    )) {
      if (res.writableEnded) break;
      sseWrite(res, { token });
    }
  } catch (err) {
    logger.warn(`News brief failed: ${(err as Error).message}`);
    if (!res.writableEnded) sseWrite(res, { error: 'Could not generate the brief right now.' });
  }
  if (!res.writableEnded) {
    sseWrite(res, { done: true });
    res.end();
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

// POST /internal/news/enrich — worker-only. Drains a batch of un-enriched items.
export async function handleEnrichNews(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await enrichPendingNews(env.NEWS_ENRICH_MAX_PER_TICK));
  } catch (err) {
    next(err);
  }
}
