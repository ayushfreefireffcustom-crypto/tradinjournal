import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { backtestParamsSchema, createStrategySchema, generateStrategySchema, previewBacktestSchema, strategySpecSchema, updateStrategySchema, type BacktestParamsDto } from '@tradinjournal/contracts';
import type { StrategySpec } from '@tradinjournal/core';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok, created } from '../../http/response.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import {
  backtestSpec, backtestStrategy, createStrategy, duplicateStrategy, generateStrategy, getBacktest, getStrategy, inspect,
  listStrategies, restoreVersion, updateStrategy,
} from './strategies.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const btLimit = perUserRateLimit({ name: 'strategy-backtest', max: 30, windowSeconds: 60, message: 'Too many backtests in a minute. Give it a moment.' });
const aiLimit = perUserRateLimit({ name: 'strategy-generate', max: 10, windowSeconds: 3600, message: 'That’s a lot of AI strategies for one hour. Try again later.' });
const p = (req: Request) => String(req.params.id).slice(0, 40);

// Strategy builder (Part F).
export const strategiesRouter: IRouter = Router();
strategiesRouter.use(requireAuth, requirePlatformAccess);
strategiesRouter.get('/', wrap(async (_req, res) => ok(res, await listStrategies(uid(res)))));
strategiesRouter.post('/', validateBody(createStrategySchema), wrap(async (req, res) => created(res, await createStrategy(uid(res), req.body))));
// Live checks while editing: validation and the plain-English read-back.
strategiesRouter.post('/inspect', validateBody(strategySpecSchema), wrap(async (req, res) => ok(res, inspect(req.body as StrategySpec))));
// Auto-backtest on edit: an unsaved spec, not stored.
strategiesRouter.post('/preview', btLimit, validateBody(previewBacktestSchema), wrap(async (req, res) => {
  const b = req.body as { spec: StrategySpec; params: BacktestParamsDto };
  const run = await backtestSpec(b.spec, b.params);
  ok(res, { ...run, result: { ...run.result, trades: run.result.trades.slice(-200) } });
}));
strategiesRouter.post('/generate', aiLimit, validateBody(generateStrategySchema), wrap(async (req, res) => created(res, await generateStrategy(uid(res), req.body))));
strategiesRouter.get('/:id', wrap(async (req, res) => ok(res, await getStrategy(uid(res), p(req)))));
strategiesRouter.patch('/:id', validateBody(updateStrategySchema), wrap(async (req, res) => ok(res, await updateStrategy(uid(res), p(req), req.body))));
strategiesRouter.post('/:id/duplicate', wrap(async (req, res) => created(res, await duplicateStrategy(uid(res), p(req)))));
strategiesRouter.post('/:id/versions/:version/restore', wrap(async (req, res) => ok(res, await restoreVersion(uid(res), p(req), Number(req.params.version)))));
strategiesRouter.post('/:id/backtests', btLimit, validateBody(backtestParamsSchema), wrap(async (req, res) => created(res, await backtestStrategy(uid(res), p(req), req.body as BacktestParamsDto))));
strategiesRouter.get('/:id/backtests/:bid', wrap(async (req, res) => ok(res, await getBacktest(uid(res), p(req), String(req.params.bid).slice(0, 40)))));
