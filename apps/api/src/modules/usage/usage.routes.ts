import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { handleHeartbeat } from './usage.controller.js';

export const usageRouter: IRouter = Router();
usageRouter.use(requireAuth);
usageRouter.post('/heartbeat', handleHeartbeat);
