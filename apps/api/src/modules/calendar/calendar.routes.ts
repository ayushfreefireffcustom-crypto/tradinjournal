import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { calendarIngestSchema, calendarQuerySchema } from '@tradinjournal/contracts';
import {
  handleListEvents,
  handleGetEvent,
  handleWatchEvent,
  handleUnwatchEvent,
  handleIngestCalendar,
} from './calendar.controller.js';

// Public (signed-in) calendar routes.
export const calendarRouter: IRouter = Router();
calendarRouter.use(requireAuth);
calendarRouter.get('/', validateQuery(calendarQuerySchema), handleListEvents);
calendarRouter.get('/:id', handleGetEvent);
calendarRouter.post('/:id/watch', handleWatchEvent);
calendarRouter.delete('/:id/watch', handleUnwatchEvent);

// Internal (worker → API) ingestion, token-guarded.
export const calendarInternalRouter: IRouter = Router();
calendarInternalRouter.use(requireInternalToken);
calendarInternalRouter.post('/ingest', validateBody(calendarIngestSchema), handleIngestCalendar);
