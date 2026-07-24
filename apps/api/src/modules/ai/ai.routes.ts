import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import {
  aiChatSchema,
  aiReportQuerySchema,
  weeklyReviewPrefSchema,
  weeklyReviewRunSchema,
  weeklyReviewUnsubscribeSchema,
} from '@tradinjournal/contracts';
import { aiRateLimit } from './ai.rate-limit.js';
import {
  handleChat,
  handleListConversations,
  handleGetConversation,
  handleDeleteConversation,
  handleGetReport,
  handleGetWeeklyReviewPref,
  handleSetWeeklyReviewPref,
  handleUnsubscribeWeeklyReview,
  handleRunWeeklyReview,
} from './ai.controller.js';

export const aiRouter: IRouter = Router();

// Unauthenticated by design: this is reached from a link in an email, where no
// session exists. Declared BEFORE requireAuth so the guard below doesn't cover
// it. The 32-byte token in the body is the only credential.
aiRouter.post(
  '/weekly-review/unsubscribe',
  validateBody(weeklyReviewUnsubscribeSchema),
  handleUnsubscribeWeeklyReview,
);

// Everything past this point requires a signed-in user.
aiRouter.use(requireAuth);

aiRouter.post('/chat', aiRateLimit, validateBody(aiChatSchema), handleChat);
// Rate-limited alongside chat: a cache miss (or ?force=1) costs a model call.
aiRouter.get('/report', aiRateLimit, validateQuery(aiReportQuerySchema), handleGetReport);
aiRouter.get('/conversations', handleListConversations);
aiRouter.get('/conversations/:id', handleGetConversation);
aiRouter.delete('/conversations/:id', handleDeleteConversation);
aiRouter.get('/weekly-review', handleGetWeeklyReviewPref);
aiRouter.patch('/weekly-review', validateBody(weeklyReviewPrefSchema), handleSetWeeklyReviewPref);

/**
 * Machine-to-machine routes, mounted separately at /internal so no session
 * middleware is involved. The worker authenticates with the shared token; when
 * no token is configured the guard closes the route entirely.
 */
export const aiInternalRouter: IRouter = Router();

aiInternalRouter.use(requireInternalToken);
aiInternalRouter.post('/weekly-review', validateBody(weeklyReviewRunSchema), handleRunWeeklyReview);
