import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { verifyElefinSchema } from '@tradinjournal/contracts';
import {
  handleGetAccessStatus,
  handleVerifyElefin,
  handleCheckActivity,
  handlePublicMaintenance,
} from './access.controller.js';

export const accessRouter: IRouter = Router();

accessRouter.get('/maintenance', handlePublicMaintenance);
accessRouter.use(requireAuth);
accessRouter.get('/status', handleGetAccessStatus);
accessRouter.post('/verify-elefin', validateBody(verifyElefinSchema), handleVerifyElefin);
accessRouter.post('/check-activity', handleCheckActivity);
