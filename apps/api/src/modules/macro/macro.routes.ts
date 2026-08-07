import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { requireMember } from '../../http/middleware/require-member.js';
import { validateBody } from '../../http/middleware/validate.js';
import {
  macroIngestSchema,
  macroMemberApplySchema,
  macroMemberDecisionSchema,
  macroAssistantSchema,
} from '@tradinjournal/contracts';
import {
  handleGetMacroState,
  handleIngestMacro,
  handleGetMembership,
  handleApplyMembership,
  handleListSignals,
  handleAdminListMembers,
  handleAdminApprove,
  handleAdminReject,
  handleAssistant,
  handleAssistantStream,
} from './macro.controller.js';
import { macroAssistantRateLimit } from './macro-assistant.rate-limit.js';

export const macroRouter: IRouter = Router();
macroRouter.use(requireAuth);
macroRouter.get('/state', handleGetMacroState);
macroRouter.get('/membership', handleGetMembership);
macroRouter.post('/membership/apply', validateBody(macroMemberApplySchema), handleApplyMembership);

macroRouter.get('/signals', requireMember, handleListSignals);

macroRouter.post(
  '/assistant',
  macroAssistantRateLimit,
  validateBody(macroAssistantSchema),
  handleAssistant,
);
macroRouter.post(
  '/assistant/stream',
  macroAssistantRateLimit,
  validateBody(macroAssistantSchema),
  handleAssistantStream,
);

macroRouter.get('/admin/members', handleAdminListMembers);
macroRouter.post('/admin/members/:id/approve', validateBody(macroMemberDecisionSchema), handleAdminApprove);
macroRouter.post('/admin/members/:id/reject', validateBody(macroMemberDecisionSchema), handleAdminReject);

export const macroInternalRouter: IRouter = Router();
macroInternalRouter.use(requireInternalToken);
macroInternalRouter.post('/ingest', validateBody(macroIngestSchema), handleIngestMacro);
