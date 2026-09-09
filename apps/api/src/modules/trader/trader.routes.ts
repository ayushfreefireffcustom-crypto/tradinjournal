// Trader Master routes. Free for any signed-in user (no paid membership gate);
// analyze is rate-limited to protect the free upstream quotas.
import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { traderAnalyzeSchema, traderGradeJobSchema } from '@tradinjournal/contracts';
import {
  handleAnalyze,
  handleHistory,
  handleTrackRecord,
  handleGradePending,
} from './trader.controller.js';
import { traderRateLimit } from './trader.rate-limit.js';

export const traderRouter: IRouter = Router();
traderRouter.use(requireAuth, requirePlatformAccess);

traderRouter.post('/analyze', traderRateLimit, validateBody(traderAnalyzeSchema), handleAnalyze);
traderRouter.get('/history', handleHistory);
traderRouter.get('/track-record', handleTrackRecord);

/** Worker cron → grade pending analyses against subsequent candles. */
export const traderInternalRouter: IRouter = Router();
traderInternalRouter.use(requireInternalToken);
traderInternalRouter.post('/grade', validateBody(traderGradeJobSchema), handleGradePending);
