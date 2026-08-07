import type { Request, Response, NextFunction } from 'express';
import type {
  MacroIngestInput,
  MacroMemberApplyInput,
  MacroMemberDecisionInput,
  MacroAssistantInput,
} from '@tradinjournal/contracts';
import { ok, created } from '../../http/response.js';
import { ForbiddenError } from '../../http/errors.js';
import { getMacroState, ingestMacro } from './macro.service.js';
import {
  applyMembership,
  approveMember,
  getMembership,
  isMacroAdmin,
  listMembers,
  listSignals,
  rejectMember,
} from './macro-member.service.js';
import { answerMacroQuestion, streamMacroAnswer } from './macro-assistant.service.js';

export async function handleGetMacroState(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getMacroState());
  } catch (err) {
    next(err);
  }
}

export async function handleIngestMacro(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await ingestMacro(req.body as MacroIngestInput));
  } catch (err) {
    next(err);
  }
}

export async function handleGetMembership(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getMembership(res.locals.user.id));
  } catch (err) {
    next(err);
  }
}

export async function handleApplyMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, await applyMembership(res.locals.user.id, req.body as MacroMemberApplyInput));
  } catch (err) {
    next(err);
  }
}

export async function handleListSignals(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await listSignals());
  } catch (err) {
    next(err);
  }
}

function requireAdminEmail(res: Response): string {
  const email = res.locals.user.email;
  if (!isMacroAdmin(email)) throw new ForbiddenError('Not a macro admin');
  return email;
}

export async function handleAdminListMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireAdminEmail(res);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const allowed = status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' ? status : undefined;
    ok(res, await listMembers(allowed));
  } catch (err) {
    next(err);
  }
}

export async function handleAdminApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = requireAdminEmail(res);
    void (req.body as MacroMemberDecisionInput | undefined);
    ok(res, await approveMember(req.params.id!, email));
  } catch (err) {
    next(err);
  }
}

export async function handleAdminReject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = requireAdminEmail(res);
    void (req.body as MacroMemberDecisionInput | undefined);
    ok(res, await rejectMember(req.params.id!, email));
  } catch (err) {
    next(err);
  }
}

/** POST /api/macro/assistant — JSON reply (non-stream). */
export async function handleAssistant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question } = req.body as MacroAssistantInput;
    ok(res, await answerMacroQuestion(question));
  } catch (err) {
    next(err);
  }
}

/** POST /api/macro/assistant/stream — text/event-stream of token chunks. */
export async function handleAssistantStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question } = req.body as MacroAssistantInput;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    for await (const chunk of streamMacroAnswer(question)) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) next(err);
    else {
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}
