// Trader Master routes. Free for any signed-in user (no paid membership gate);
// analyze is rate-limited to protect the free upstream quotas.
import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import {
  traderAnalyzeSchema,
  traderGradeJobSchema,
  traderMetaTrainSchema,
  traderPaperTickSchema,
  traderStrategyCreateSchema,
  traderStrategyBacktestSchema,
} from '@tradinjournal/contracts';
import {
  handleAnalyze,
  handleHistory,
  handleTrackRecord,
  handleGradePending,
  handleMetaTrain,
  handleLgbmTrain,
  handlePaperTick,
  handleListStrategies,
  handleCreateStrategy,
  handleBacktestStrategy,
  handlePromoteStrategy,
  handleArchiveStrategy,
} from './trader.controller.js';
import { traderRateLimit } from './trader.rate-limit.js';

export const traderRouter: IRouter = Router();
traderRouter.use(requireAuth, requirePlatformAccess);

traderRouter.post('/analyze', traderRateLimit, validateBody(traderAnalyzeSchema), handleAnalyze);
traderRouter.get('/history', handleHistory);
traderRouter.get('/track-record', handleTrackRecord);

traderRouter.get('/strategies', handleListStrategies);
traderRouter.post('/strategies', validateBody(traderStrategyCreateSchema), handleCreateStrategy);
traderRouter.post(
  '/strategies/:id/backtest',
  validateBody(traderStrategyBacktestSchema),
  handleBacktestStrategy,
);
traderRouter.post('/strategies/:id/promote', handlePromoteStrategy);
traderRouter.post('/strategies/:id/archive', handleArchiveStrategy);

/** Worker cron → grade pending analyses / retrain meta-model. */
export const traderInternalRouter: IRouter = Router();
traderInternalRouter.use(requireInternalToken);
traderInternalRouter.post('/grade', validateBody(traderGradeJobSchema), handleGradePending);
traderInternalRouter.post('/meta/train', validateBody(traderMetaTrainSchema), handleMetaTrain);
traderInternalRouter.post('/meta/lgbm', validateBody(traderMetaTrainSchema), handleLgbmTrain);
traderInternalRouter.post('/paper/tick', validateBody(traderPaperTickSchema), handlePaperTick);
