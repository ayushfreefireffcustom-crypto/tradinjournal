import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { macroIngestSchema } from '@tradinjournal/contracts';
import { handleGetMacroState, handleIngestMacro } from './macro.controller.js';

// Public (signed-in) macro routes.
export const macroRouter: IRouter = Router();
macroRouter.use(requireAuth);
macroRouter.get('/state', handleGetMacroState);

// Internal (worker → API) ingestion, token-guarded.
export const macroInternalRouter: IRouter = Router();
macroInternalRouter.use(requireInternalToken);
macroInternalRouter.post('/ingest', validateBody(macroIngestSchema), handleIngestMacro);
