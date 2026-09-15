import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireAdmin } from '../../http/middleware/require-admin.js';
import { validateBody } from '../../http/middleware/validate.js';
import { createAccessGrantSchema, maintenanceModeSchema } from '@tradinjournal/contracts';
import {
  handleAdminOverview,
  handleAdminEngagement,
  handleListGrants,
  handleCreateGrant,
  handleRevokeGrant,
  handleGetMaintenance,
  handleSetMaintenance,
  handleListUsers,
  handleUserDossier,
  handleListAudit,
  handleRecheckUser,
  handleAdminGeo,
  handleAdminTraderOps,
} from './admin.controller.js';

export const adminRouter: IRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', handleAdminOverview);
adminRouter.get('/trader', handleAdminTraderOps);
adminRouter.get('/engagement', handleAdminEngagement);
adminRouter.get('/geo', handleAdminGeo);
adminRouter.get('/users', handleListUsers);
adminRouter.get('/users/:id', handleUserDossier);
adminRouter.get('/grants', handleListGrants);
adminRouter.post('/grants', validateBody(createAccessGrantSchema), handleCreateGrant);
adminRouter.delete('/grants/:id', handleRevokeGrant);
adminRouter.get('/maintenance', handleGetMaintenance);
adminRouter.post('/maintenance', validateBody(maintenanceModeSchema), handleSetMaintenance);
adminRouter.get('/audit', handleListAudit);
adminRouter.post('/users/:id/recheck', handleRecheckUser);
