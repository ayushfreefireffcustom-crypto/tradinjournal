// Trader Master HTTP handlers.
import type { Request, Response, NextFunction } from 'express';
import type {
  TraderAnalyzeInput,
  TraderStrategyCreateInput,
  TraderStrategyBacktestInput,
  TraderTimeframe,
} from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { analyze } from './trader.service.js';
import { listHistory } from './trader.history.service.js';
import { gradePendingAnalyses } from './trader.grade.service.js';
import { getTrackRecord } from './trader.track-record.service.js';
import { trainMetaModelFromDb } from './trader.meta.service.js';
import {
  createStrategy,
  listStrategies,
  backtestUserStrategy,
} from './trader.strategy.service.js';
import { archiveStrategy, promoteStrategy, tickPaperBook } from './trader.paper.service.js';
import { trainLgbmChallenger } from './trader.lgbm.service.js';

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

export async function handleMetaTrain(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await trainMetaModelFromDb());
  } catch (err) {
    next(err);
  }
}

export async function handleListStrategies(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await listStrategies(res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

export async function handleCreateStrategy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as TraderStrategyCreateInput;
    ok(
      res,
      await createStrategy(res.locals.user.id as string, body.prompt, {
        symbol: body.symbol,
        timeframe: body.timeframe,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function handlePromoteStrategy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await promoteStrategy(res.locals.user.id as string, req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function handleArchiveStrategy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await archiveStrategy(res.locals.user.id as string, req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function handlePaperTick(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : 40;
    ok(res, await tickPaperBook(limit));
  } catch (err) {
    next(err);
  }
}

export async function handleLgbmTrain(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await trainLgbmChallenger());
  } catch (err) {
    next(err);
  }
}

export async function handleBacktestStrategy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as TraderStrategyBacktestInput;
    const id = req.params.id as string;
    ok(
      res,
      await backtestUserStrategy(
        res.locals.user.id as string,
        id,
        body.symbol,
        (body.timeframe ?? '1h') as TraderTimeframe,
      ),
    );
  } catch (err) {
    next(err);
  }
}
