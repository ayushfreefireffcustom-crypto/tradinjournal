import type { Request, Response, NextFunction } from 'express';
import { logger } from '@tradinjournal/logger';
import type { AiChatInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { NotFoundError } from '../../http/errors.js';
import { isAiEnabled, getProvider } from '../../lib/ai/provider.js';
import { routeQuery, type Lane } from '../../lib/ai/router.js';
import { getSearchProvider, type SearchResult } from '../../lib/ai/search.js';
import { checkSearchBudget } from './ai.search-rate-limit.js';
import {
  loadTraderContext,
  buildMessages,
  fallbackReply,
  persistTurn,
  listConversations,
  getConversation,
  deleteConversation,
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
  // Carried out of the try block so the turn is persisted with its citations/lane.
  let sources: SearchResult[] = [];
  let lane: Lane = 'personal';

  // Best-effort persistence — never fail the response on a write error. Returns
  // the (possibly newly-created) conversation id. Skipped when nothing was
  // generated, so a stop-before-first-token leaves no empty turn behind.
  const persist = async (): Promise<string | undefined> => {
    if (full.trim() === '') return input.conversationId;
    try {
      return await persistTurn({
        userId,
        brokerAccountId: input.accountId,
        conversationId: input.conversationId,
        userContent: lastUser,
        assistantContent: full,
        sources,
        lane,
        regenerate: input.regenerate,
      });
    } catch (err) {
      logger.error(`Failed to persist AI turn: ${(err as Error).message}`);
      return input.conversationId;
    }
  };

  try {
    if (isAiEnabled()) {
      const provider = getProvider();

      // 1) Route the question: pick the lane AND (for web/hybrid) a focused,
      //    finance-scoped search query. Fails safe to `personal` — never search
      //    on doubt.
      const route = await routeQuery(lastUser, provider, controller.signal);
      lane = route.lane;

      // 2) For web/hybrid lanes, search the internet under a budget + hard timeout.
      //    Any failure/empty/over-budget degrades to a no-search answer; the model
      //    is told (below) it couldn't fetch live data rather than inventing facts.
      const wantsWeb = lane === 'web' || lane === 'hybrid';
      const searchProvider = wantsWeb ? getSearchProvider() : null;
      if (searchProvider && !aborted) {
        if (await checkSearchBudget(userId)) {
          sseWrite(res, { status: 'searching' });
          try {
            sources = await searchProvider.search(route.searchQuery || lastUser, controller.signal);
          } catch (err) {
            logger.warn(`Web search failed, answering without it: ${(err as Error).message}`);
            sources = [];
          }
        } else {
          logger.info(`Search budget exhausted for user ${userId} — answering without web`);
        }
      }

      // 3) Build the grounded prompt (+ web results when present). When web was
      //    wanted but produced nothing, add a soft note so the model says so.
      const messages = buildMessages(context, input.messages, sources);
      if (wantsWeb && sources.length === 0) {
        messages.splice(2, 0, {
          role: 'system',
          content:
            'Note: a live web search was attempted but returned no usable results (or was unavailable). Do not invent external facts, prices, or news — tell the user you could not fetch live information.',
        });
      }

      // 4) Stream the reply token-by-token.
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
      // Stopped by the user — keep the partial answer so it survives a reload.
      await persist();
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
    await persist();
    res.end();
    return;
  }

  const conversationId = await persist();

  if (sources.length > 0) sseWrite(res, { sources });
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

// DELETE /api/ai/conversations/:id
export async function handleDeleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const deleted = await deleteConversation(userId, req.params.id!);
    if (!deleted) throw new NotFoundError('Conversation not found');
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}
