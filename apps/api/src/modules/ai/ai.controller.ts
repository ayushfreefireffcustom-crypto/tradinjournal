import type { Request, Response, NextFunction } from 'express';
import { logger } from '@tradinjournal/logger';
import type { AiChatInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { NotFoundError } from '../../http/errors.js';
import { isAiEnabled, getProvider } from '../../lib/ai/provider.js';
import {
  loadTraderContext,
  buildMessages,
  fallbackReply,
  persistTurn,
  listConversations,
  getConversation,
} from './ai.service.js';

function sseWrite(res: Response, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// POST /api/ai/chat — streams the coach reply over SSE, then persists the turn.
export async function handleChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = res.locals.user.id as string;
  const input = req.body as AiChatInput;

  // Ground on the account's data first. If this fails (broker down, bad account)
  // we haven't started streaming yet, so return a normal JSON error.
  let context;
  try {
    context = await loadTraderContext(userId, input.accountId);
  } catch (err) {
    return next(err);
  }

  const lastUser = [...input.messages].reverse().find(m => m.role === 'user')?.content ?? '';

  // Begin the SSE stream.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  res.flushHeaders?.();

  const controller = new AbortController();
  let aborted = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      aborted = true;
      controller.abort();
    }
  });

  let full = '';
  try {
    if (isAiEnabled()) {
      const provider = getProvider();
      const messages = buildMessages(context, input.messages);
      for await (const token of provider.stream(messages, controller.signal)) {
        if (aborted) break;
        full += token;
        sseWrite(res, { token });
      }
    } else {
      full = fallbackReply(context);
      sseWrite(res, { token: full });
    }
  } catch (err) {
    if (aborted) {
      res.end();
      return;
    }
    logger.warn(`AI stream failed, using fallback: ${(err as Error).message}`);
    if (full === '') {
      full = fallbackReply(context);
      sseWrite(res, { token: full });
    } else {
      // Partial reply already sent — signal a soft error, keep what we have.
      sseWrite(res, { error: 'The coach was interrupted. Here is the partial answer.' });
    }
  }

  if (aborted) {
    res.end();
    return;
  }

  // Persist the completed turn (best-effort — never fail the response on this).
  let conversationId = input.conversationId;
  try {
    conversationId = await persistTurn({
      userId,
      brokerAccountId: input.accountId,
      conversationId: input.conversationId,
      userContent: lastUser,
      assistantContent: full,
    });
  } catch (err) {
    logger.error(`Failed to persist AI turn: ${(err as Error).message}`);
  }

  sseWrite(res, { done: true, conversationId });
  res.end();
}

// GET /api/ai/conversations
export async function handleListConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    ok(res, await listConversations(userId));
  } catch (err) {
    next(err);
  }
}

// GET /api/ai/conversations/:id
export async function handleGetConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const convo = await getConversation(userId, req.params.id!);
    if (!convo) throw new NotFoundError('Conversation not found');
    ok(res, convo);
  } catch (err) {
    next(err);
  }
}
