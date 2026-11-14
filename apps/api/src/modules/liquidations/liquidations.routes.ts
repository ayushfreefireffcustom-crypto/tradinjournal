import { Router, type IRouter } from 'express';
import { liquidationMapQuerySchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateQuery } from '../../http/middleware/validate.js';
import { handleLiquidationMap, handleMaxPainBoard } from './liquidations.controller.js';

// Estimated liquidation map + max pain (crypto perps).
export const liquidationsRouter: IRouter = Router();
liquidationsRouter.use(requireAuth, requirePlatformAccess);
liquidationsRouter.get('/map', validateQuery(liquidationMapQuerySchema), handleLiquidationMap);
liquidationsRouter.get('/max-pain', handleMaxPainBoard);
