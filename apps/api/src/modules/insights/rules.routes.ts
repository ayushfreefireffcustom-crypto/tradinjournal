// POST /api/insights/rules-preview: how often the trader's (unsaved) rules
// were broken on this account over the last N days, and what it cost.
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { rulesPreviewSchema, type RulesPreviewInput } from '@tradinjournal/contracts';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { loadInsightTrades } from './insights.service.js';
import { rulesPreview } from './rules.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const rulesRouter: IRouter = Router();
rulesRouter.post('/rules-preview', validateBody(rulesPreviewSchema), wrap(async (req, res) => {
  const b = req.body as RulesPreviewInput;
  // Ownership is checked inside loadAccountData.
  const { startingBalance, trades } = await loadInsightTrades(res.locals.user.id as string, b.accountId);
  ok(res, rulesPreview(trades, b.rules, startingBalance, Date.now(), b.days));
}));
