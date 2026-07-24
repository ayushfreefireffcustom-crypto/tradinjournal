import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { newsQuerySchema, newsIngestSchema } from '@tradinjournal/contracts';
import { handleListNews, handleIngestNews, handleNewsStream, handleNewsBrief } from './news.controller.js';

// Public (signed-in) news routes.
export const newsRouter: IRouter = Router();
newsRouter.use(requireAuth);
newsRouter.get('/', validateQuery(newsQuerySchema), handleListNews);
newsRouter.get('/stream', handleNewsStream);
newsRouter.get('/brief/stream', handleNewsBrief);

// Internal (worker → API) ingestion, token-guarded.
export const newsInternalRouter: IRouter = Router();
newsInternalRouter.use(requireInternalToken);
newsInternalRouter.post('/ingest', validateBody(newsIngestSchema), handleIngestNews);
