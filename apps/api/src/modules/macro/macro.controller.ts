import type { Request, Response, NextFunction } from 'express';
import type { MacroIngestInput } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { getMacroState, ingestMacro } from './macro.service.js';

// GET /api/macro/state — the dashboard JSON (auth'd; cached in P1).
export async function handleGetMacroState(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getMacroState());
  } catch (err) {
    next(err);
  }
}

// POST /internal/macro/ingest — worker-only (token-guarded).
export async function handleIngestMacro(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await ingestMacro(req.body as MacroIngestInput));
  } catch (err) {
    next(err);
  }
}
