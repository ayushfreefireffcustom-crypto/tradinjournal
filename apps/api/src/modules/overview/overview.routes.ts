import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { ok } from '../../http/response.js';
import { ValidationError } from '../../http/errors.js';
import { correlationOverview, marketOverview } from './overview.service.js';
import { statsFor } from './stats.service.js';
import { weeklyMarketBrief } from './brief.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Market overview (E10) and correlation matrix (E14).
export const overviewRouter: IRouter = Router();
overviewRouter.use(requireAuth, requirePlatformAccess);
overviewRouter.get('/', wrap(async (_req, res) => ok(res, await marketOverview())));
overviewRouter.get('/correlation', wrap(async (req, res) => {
  const days = Number(req.query.days ?? 90);
  if (![30, 90, 180].includes(days)) throw new ValidationError('days must be 30, 90 or 180.');
  ok(res, await correlationOverview(16, days));
}));
// Symbol deep-dive stats for the charts page (E12).
overviewRouter.get('/stats', wrap(async (req, res) => ok(res, await statsFor(String(req.query.symbol ?? '')))));
// Weekly AI market brief (E15).
overviewRouter.get('/brief', wrap(async (_req, res) => ok(res, await weeklyMarketBrief())));
