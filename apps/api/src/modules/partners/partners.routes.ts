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
import {
  accessConsentSchema, accessJoinSchema, accessReviewSchema, accessVerifySchema, adminVerificationActionSchema,
  ibListUploadSchema, partnerBrokerUpsertSchema, partnerPackagePatchSchema, partnerPackageSchema,
  programEventsQuerySchema, programExportQuerySchema, programRangeQuerySchema, programSettingsSchema,
  adminPackageSchema, adminPartnerTermsSchema, earningsUploadSchema,
  externalAccountSchema, ibApiConnectSchema, partnerProductPatchSchema, partnerProductSchema,
  productFileSchema, productReviewSchema,
} from '@tradinjournal/contracts';
import * as c from './partners.controller.js';
import * as ib from './ib/ib.controller.js';

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
partnerRouter.get('/brokers', ib.handleBrokers);
partnerRouter.post('/brokers', validateBody(partnerBrokerUpsertSchema), ib.handleUpsertBroker);
partnerRouter.delete('/brokers/:id', ib.handleRemoveBroker);
partnerRouter.post('/brokers/:id/accounts', validateBody(ibListUploadSchema), ib.handleUploadList);
partnerRouter.post('/brokers/:id/sync', ib.handleSyncBroker);
partnerRouter.get('/packages', ib.handlePackages);
partnerRouter.post('/packages', validateBody(partnerPackageSchema), ib.handleCreatePackage);
partnerRouter.patch('/packages/:id', validateBody(partnerPackagePatchSchema), ib.handleUpdatePackage);
partnerRouter.post('/templates/:id/audience', ib.handleTemplateAudience);
partnerRouter.get('/brokers/:id/integration', ib.handleIntegration);
partnerRouter.post('/brokers/:id/postback/rotate', ib.handleRotatePostback);
partnerRouter.put('/brokers/:id/api', validateBody(ibApiConnectSchema), ib.handleApiConfig);
partnerRouter.post('/brokers/:id/earnings', validateBody(earningsUploadSchema), ib.handleEarningsUpload);
partnerRouter.get('/products', ib.handleProducts);
partnerRouter.post('/products', validateBody(partnerProductSchema), ib.handleCreateProduct);
partnerRouter.patch('/products/:id', validateBody(partnerProductPatchSchema), ib.handleUpdateProduct);
partnerRouter.post('/products/:id/file', validateBody(productFileSchema), ib.handleProductFile);
partnerRouter.post('/products/:id/submit', ib.handleSubmitProduct);
partnerRouter.get('/earnings', ib.handleEarnings);
partnerRouter.get('/reports', validateQuery(programRangeQuerySchema), ib.handleReports);
partnerRouter.get('/export', ib.handlePartnerExport);

// A trader's side: their partner, verification, unlocked packages and consent.
export const partnerAccessRouter: IRouter = Router();
partnerAccessRouter.use(requireAuth);
partnerAccessRouter.get('/', ib.handleAccess);
partnerAccessRouter.get('/perks', ib.handlePerks);
partnerAccessRouter.post('/join', validateBody(accessJoinSchema), ib.handleJoin);
partnerAccessRouter.post('/verify', validateBody(accessVerifySchema), ib.handleVerify);
partnerAccessRouter.post('/review', validateBody(accessReviewSchema), ib.handleRequestReview);
partnerAccessRouter.post('/consent', validateBody(accessConsentSchema), ib.handleConsent);
partnerAccessRouter.get('/products/:id', ib.handleClientProduct);
partnerAccessRouter.get('/products/:id/file', ib.handleClientProductFile);
partnerAccessRouter.post('/accounts', validateBody(externalAccountSchema), ib.handleAddAccount);
partnerAccessRouter.delete('/accounts/:id', ib.handleRemoveAccount);

// Public, server-to-server: broker postbacks (secret token in the path).
export const ibPublicRouter: IRouter = Router();
ibPublicRouter.get('/ib/postback/:token', ib.handlePostback);
ibPublicRouter.post('/ib/postback/:token', ib.handlePostback);

// Admin.
export const adminPartnersRouter: IRouter = Router();
adminPartnersRouter.use(['/partners', '/partner-codes', '/partner-program'], requireAuth, requireAdmin);
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
adminPartnersRouter.post('/partners/:id/recheck', ib.handleAdminRecheck);
adminPartnersRouter.get('/partner-program', validateQuery(programRangeQuerySchema), ib.handleProgram);
adminPartnersRouter.get('/partner-program/reviews', ib.handleReviews);
adminPartnersRouter.post('/partner-program/verifications/:id', validateBody(adminVerificationActionSchema), ib.handleReviewDecision);
adminPartnersRouter.get('/partner-program/events', validateQuery(programEventsQuerySchema), ib.handleEvents);
adminPartnersRouter.get('/partner-program/settings', ib.handleGetSettings);
adminPartnersRouter.put('/partner-program/settings', validateBody(programSettingsSchema), ib.handleSaveSettings);
adminPartnersRouter.get('/partner-program/export', validateQuery(programExportQuerySchema), ib.handleExport);
adminPartnersRouter.get('/partners/:id/terms', ib.handleAdminGetTerms);
adminPartnersRouter.put('/partners/:id/terms', validateBody(adminPartnerTermsSchema), ib.handleAdminTerms);
adminPartnersRouter.get('/partner-program/products', ib.handleProductQueue);
adminPartnersRouter.get('/partner-program/products/:id', ib.handleAdminProduct);
adminPartnersRouter.get('/partner-program/products/:id/file', ib.handleAdminProductFile);
adminPartnersRouter.post('/partner-program/products/:id/review', validateBody(productReviewSchema), ib.handleProductReview);
adminPartnersRouter.get('/partner-program/packages', ib.handleAdminPackages);
adminPartnersRouter.post('/partner-program/packages/:id/hold', validateBody(adminPackageSchema), ib.handleAdminPackageHold);
adminPartnersRouter.get('/partner-program/cohorts', ib.handleCohorts);
adminPartnersRouter.get('/partner-codes/reserved', c.handleReservedList);
adminPartnersRouter.post('/partner-codes/reserved', validateBody(adminReserveCodeSchema), c.handleReservedCreate);
adminPartnersRouter.delete('/partner-codes/reserved/:reservedId', c.handleReservedDelete);

// Internal (worker / cron → API).
export const partnersInternalRouter: IRouter = Router();
partnersInternalRouter.use(requireInternalToken);
partnersInternalRouter.post('/refresh-stats', validateBody(partnerRefreshStatsSchema), c.handleRefreshStats);
partnersInternalRouter.post('/ib-cycle', ib.handleIbCycle);
