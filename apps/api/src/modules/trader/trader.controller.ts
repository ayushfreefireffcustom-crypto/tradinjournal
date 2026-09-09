// Trader Master HTTP handlers.
import type { Request, Response, NextFunction } from 'express';
import type { TraderAnalyzeInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { analyze } from './trader.service.js';
import { listHistory } from './trader.history.service.js';
import { gradePendingAnalyses } from './trader.grade.service.js';
import { getTrackRecord } from './trader.track-record.service.js';

export async function handleAnalyze(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = await analyze(req.body as TraderAnalyzeInput, res.locals.user.id as string);
    ok(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function handleHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await listHistory(res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

/** Platform-wide honest track record (also scoped mine via ?scope=me). */
export async function handleTrackRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
    const userId = scope === 'me' ? (res.locals.user.id as string) : undefined;
    ok(res, await getTrackRecord({ userId }));
  } catch (err) {
    next(err);
  }
}

export async function handleGradePending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : 40;
    ok(res, await gradePendingAnalyses(limit));
  } catch (err) {
    next(err);
  }
}
