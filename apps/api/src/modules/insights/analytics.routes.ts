// Analytics v2 route, mounted on the insights router (auth + platform access run there first).
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { analyticsV2QuerySchema, type AnalyticsV2Query } from '@tradinjournal/contracts';
import { validateQuery } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { analyticsV2 } from './analytics.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const analyticsRouter: IRouter = Router();
// Every analytics view in one call (GET /api/insights/analytics).
analyticsRouter.get('/analytics', validateQuery(analyticsV2QuerySchema), wrap(async (req, res) => {
  ok(res, await analyticsV2(res.locals.user.id as string, req.query as unknown as AnalyticsV2Query));
}));
