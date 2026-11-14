// GET /api/insights/trade-review?accountId=&positionId= — one position's review.
// Mounted on insightsRouter, which already applies requireAuth + requirePlatformAccess.
import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import { tradeReviewQuerySchema, type TradeReviewQuery } from '@tradinjournal/contracts';
import { validateQuery } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { tradeReview } from './trade-review.service.js';

export const tradeReviewRouter: IRouter = Router();
tradeReviewRouter.get('/trade-review', validateQuery(tradeReviewQuerySchema), (req: Request, res: Response, next: NextFunction) => {
  tradeReview(res.locals.user.id as string, req.query as unknown as TradeReviewQuery).then(d => ok(res, d)).catch(next);
});
