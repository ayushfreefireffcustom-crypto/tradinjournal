import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { aiChatSchema } from '@tradinjournal/contracts';
import { aiRateLimit } from './ai.rate-limit.js';
import { handleChat, handleListConversations, handleGetConversation } from './ai.controller.js';

export const aiRouter: IRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post('/chat', aiRateLimit, validateBody(aiChatSchema), handleChat);
aiRouter.get('/conversations', handleListConversations);
aiRouter.get('/conversations/:id', handleGetConversation);
