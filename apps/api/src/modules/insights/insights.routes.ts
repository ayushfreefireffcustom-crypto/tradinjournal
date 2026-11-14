import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { dashboardAskSchema, dashboardV2QuerySchema, type DashboardAskInput, type DashboardV2Query } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { askJournal, dashboardV2 } from './insights.service.js';
import { tradeReviewRouter } from './trade-review.routes.js';
import { tradelogRouter } from './tradelog.routes.js';
import { analyticsRouter } from './analytics.routes.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Dashboard v2: every widget in one call, and deterministic "Ask your journal" answers.
export const insightsRouter: IRouter = Router();
insightsRouter.use(requireAuth, requirePlatformAccess);
insightsRouter.get('/dashboard', validateQuery(dashboardV2QuerySchema), wrap(async (req, res) => {
  ok(res, await dashboardV2(res.locals.user.id as string, req.query as unknown as DashboardV2Query));
}));
insightsRouter.post('/ask', validateBody(dashboardAskSchema), wrap(async (req, res) => {
  ok(res, await askJournal(res.locals.user.id as string, req.body as DashboardAskInput));
}));
insightsRouter.use(tradeReviewRouter); // GET /trade-review
insightsRouter.use('/tradelog', tradelogRouter); // GET /tradelog, /tradelog/export, /tradelog/trade; POST /tradelog/paths, /tradelog/tag
insightsRouter.use(analyticsRouter); // GET /analytics
