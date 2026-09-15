import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { updateLocationSchema } from '@tradinjournal/contracts';
import {
  handleGetLocation,
  handleUpdateLocation,
  handleSuggestLocation,
} from './location.controller.js';

export const meRouter: IRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/location', handleGetLocation);
meRouter.get('/location/suggest', handleSuggestLocation);
meRouter.patch('/location', validateBody(updateLocationSchema), handleUpdateLocation);
