import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { newsQuerySchema, newsIngestSchema, newsEnrichSchema, newsPreferencesSchema } from '@tradinjournal/contracts';
import {
  handleListNews,
  handleListSources,
  handleGetNewsPrefs,
  handleSetNewsPrefs,
  handleIngestNews,
  handleEnrichNews,
  handleNewsStream,
  handleNewsBrief,
} from './news.controller.js';

// Public (signed-in) news routes.
export const newsRouter: IRouter = Router();
newsRouter.use(requireAuth, requirePlatformAccess);
newsRouter.get('/', validateQuery(newsQuerySchema), handleListNews);
newsRouter.get('/sources', handleListSources);
newsRouter.get('/preferences', handleGetNewsPrefs);
newsRouter.put('/preferences', validateBody(newsPreferencesSchema), handleSetNewsPrefs);
newsRouter.get('/stream', handleNewsStream);
newsRouter.get('/brief/stream', handleNewsBrief);

// Internal (worker → API) ingestion, token-guarded.
export const newsInternalRouter: IRouter = Router();
newsInternalRouter.use(requireInternalToken);
newsInternalRouter.post('/ingest', validateBody(newsIngestSchema), handleIngestNews);
newsInternalRouter.post('/enrich', validateBody(newsEnrichSchema), handleEnrichNews);
