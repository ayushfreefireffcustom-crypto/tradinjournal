import type { Request, Response, NextFunction } from 'express';
import type { CandlesQuery, SymbolSearchQuery, WatchlistInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { acquireLive, releaseLive, subscribeCandle } from '../../lib/market/stream.js';
import {
  getCandles,
  searchSymbols,
  warmSymbols,
  getWatchlist,
  setWatchlist,
  brokerCredsFor,
} from './market.service.js';

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function sseWrite(res: Response, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// GET /api/market/candles — cached OHLC for one symbol/timeframe.
export async function handleCandles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as unknown as CandlesQuery;
    ok(res, await getCandles(q, res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

// GET /api/market/search — fuzzy symbol search across providers.
export async function handleSymbolSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q } = req.query as unknown as SymbolSearchQuery;
    ok(res, await searchSymbols(q));
  } catch (err) {
    next(err);
  }
}

// GET /api/market/stream — live forming bar over SSE. The LiveHub keeps a single
// upstream feed per (symbol,tf); this connection just subscribes to the fan-out.
// Degrades to heartbeat-only (client re-fetches) when Redis isn't configured.
export async function handleCandleStream(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as CandlesQuery;
  const { creds, scope } = await brokerCredsFor(q.accountId, res.locals.user.id as string);

  sseHeaders(res);
  res.write(': connected\n\n');

  await acquireLive(q.symbol, q.tf, { broker: creds, scope });
  const unsubscribe = subscribeCandle(q.symbol, q.tf, candle => {
    if (!res.writableEnded) sseWrite(res, { candle });
  }, scope);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    releaseLive(q.symbol, q.tf, scope);
    if (!res.writableEnded) res.end();
  });
}

// GET /api/market/watchlist — the user's pinned symbols.
export async function handleGetWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getWatchlist(res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

// PUT /api/market/watchlist — replace the user's pinned symbols.
export async function handleSetWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { symbols } = req.body as WatchlistInput;
    ok(res, await setWatchlist(res.locals.user.id as string, symbols));
  } catch (err) {
    next(err);
  }
}

// POST /internal/market/warm — worker-only. Refresh the warm symbol set.
export async function handleWarm(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await warmSymbols());
  } catch (err) {
    next(err);
  }
}
