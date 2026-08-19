// Trader Master routes. Free for any signed-in user (no paid membership gate);
// analyze is rate-limited to protect the free upstream quotas.
import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { traderAnalyzeSchema } from '@tradinjournal/contracts';
import { handleAnalyze, handleHistory } from './trader.controller.js';
import { traderRateLimit } from './trader.rate-limit.js';

export const traderRouter: IRouter = Router();
traderRouter.use(requireAuth);

traderRouter.post('/analyze', traderRateLimit, validateBody(traderAnalyzeSchema), handleAnalyze);
traderRouter.get('/history', handleHistory);
