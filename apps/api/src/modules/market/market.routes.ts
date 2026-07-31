import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { candlesQuerySchema, symbolSearchSchema, watchlistSchema, marketWarmSchema } from '@tradinjournal/contracts';
import {
  handleCandles,
  handleSymbolSearch,
  handleCandleStream,
  handleGetWatchlist,
  handleSetWatchlist,
  handleWarm,
} from './market.controller.js';

// Public (signed-in) market routes.
export const marketRouter: IRouter = Router();
marketRouter.use(requireAuth);
marketRouter.get('/candles', validateQuery(candlesQuerySchema), handleCandles);
marketRouter.get('/search', validateQuery(symbolSearchSchema), handleSymbolSearch);
marketRouter.get('/stream', validateQuery(candlesQuerySchema), handleCandleStream);
marketRouter.get('/watchlist', handleGetWatchlist);
marketRouter.put('/watchlist', validateBody(watchlistSchema), handleSetWatchlist);

// Internal (worker → API) warm refresher, token-guarded.
export const marketInternalRouter: IRouter = Router();
marketInternalRouter.use(requireInternalToken);
marketInternalRouter.post('/warm', validateBody(marketWarmSchema), handleWarm);
