// Trader Master HTTP handlers.
import type { Request, Response, NextFunction } from 'express';
import type { TraderAnalyzeInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { analyze } from './trader.service.js';
import { listHistory } from './trader.history.service.js';

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
