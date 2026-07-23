import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { aiChatSchema, aiReportQuerySchema } from '@tradinjournal/contracts';
import { aiRateLimit } from './ai.rate-limit.js';
import {
  handleChat,
  handleListConversations,
  handleGetConversation,
  handleDeleteConversation,
  handleGetReport,
} from './ai.controller.js';

export const aiRouter: IRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post('/chat', aiRateLimit, validateBody(aiChatSchema), handleChat);
// Rate-limited alongside chat: a cache miss (or ?force=1) costs a model call.
aiRouter.get('/report', aiRateLimit, validateQuery(aiReportQuerySchema), handleGetReport);
aiRouter.get('/conversations', handleListConversations);
aiRouter.get('/conversations/:id', handleGetConversation);
aiRouter.delete('/conversations/:id', handleDeleteConversation);
