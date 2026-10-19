import { Router, type IRouter } from 'express';
import {
  adminAssignClientSchema, adminCreatePartnerSchema, adminLookupQuerySchema, adminMoveClientsSchema,
  adminPartnerListQuerySchema, adminPartnerNoteSchema, adminPartnerStatusSchema, adminReserveCodeSchema,
  createPartnerChannelSchema, partnerApplySchema, partnerClientsQuerySchema, partnerRangeQuerySchema,
  partnerRefreshStatsSchema, referralCheckQuerySchema, reservePartnerCodeSchema,
} from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireAdmin } from '../../http/middleware/require-admin.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import * as c from './partners.controller.js';

// Public: the referral link itself and the signup-form code check.
export const referralPublicRouter: IRouter = Router();
referralPublicRouter.get('/r/:code', c.handleReferralLink);
referralPublicRouter.get('/referrals/check', validateQuery(referralCheckQuerySchema), c.handleCheckCode);

// Signed-in partner portal. /me and /apply work for anyone signed in; the rest
// require an ACTIVE partner (checked in the service so the error says why).
export const partnerRouter: IRouter = Router();
partnerRouter.use(requireAuth);
partnerRouter.get('/me', c.handleMe);
partnerRouter.post('/apply', validateBody(partnerApplySchema), c.handleApply);
partnerRouter.get('/overview', validateQuery(partnerRangeQuerySchema), c.handleOverview);
partnerRouter.get('/clients', validateQuery(partnerClientsQuerySchema), c.handleClients);
partnerRouter.get('/links', c.handleLinks);
partnerRouter.post('/channels', validateBody(createPartnerChannelSchema), c.handleCreateChannel);
partnerRouter.delete('/channels/:channelId', c.handleArchiveChannel);
partnerRouter.post('/codes', validateBody(reservePartnerCodeSchema), c.handleReserveCode);
partnerRouter.delete('/codes/:codeId', c.handleReleaseCode);

// Admin.
export const adminPartnersRouter: IRouter = Router();
adminPartnersRouter.use(['/partners', '/partner-codes'], requireAuth, requireAdmin);
adminPartnersRouter.get('/partners', validateQuery(adminPartnerListQuerySchema), c.handleAdminList);
adminPartnersRouter.post('/partners', validateBody(adminCreatePartnerSchema), c.handleAdminCreate);
adminPartnersRouter.get('/partners/lookup', validateQuery(adminLookupQuerySchema), c.handleAdminLookup);
adminPartnersRouter.get('/partners/:id', validateQuery(partnerRangeQuerySchema), c.handleAdminDetail);
adminPartnersRouter.get('/partners/:id/clients', validateQuery(partnerClientsQuerySchema), c.handleAdminClients);
adminPartnersRouter.post('/partners/:id/clients', validateBody(adminAssignClientSchema), c.handleAdminAssign);
adminPartnersRouter.delete('/partners/:id/clients/:clientId', c.handleAdminUnlink);
adminPartnersRouter.post('/partners/:id/move-clients', validateBody(adminMoveClientsSchema), c.handleAdminMove);
adminPartnersRouter.post('/partners/:id/status', validateBody(adminPartnerStatusSchema), c.handleAdminStatus);
adminPartnersRouter.post('/partners/:id/notes', validateBody(adminPartnerNoteSchema), c.handleAdminNote);
adminPartnersRouter.delete('/partners/:id/codes/:codeId', c.handleAdminRevokeCode);
adminPartnersRouter.get('/partner-codes/reserved', c.handleReservedList);
adminPartnersRouter.post('/partner-codes/reserved', validateBody(adminReserveCodeSchema), c.handleReservedCreate);
adminPartnersRouter.delete('/partner-codes/reserved/:reservedId', c.handleReservedDelete);

// Internal (worker / cron → API).
export const partnersInternalRouter: IRouter = Router();
partnersInternalRouter.use(requireInternalToken);
partnersInternalRouter.post('/refresh-stats', validateBody(partnerRefreshStatsSchema), c.handleRefreshStats);
