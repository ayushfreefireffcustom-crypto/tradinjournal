import type { Request, Response, NextFunction } from 'express';
import { ok } from '../../http/response.js';
import type { VerifyElefinInput } from '@tradinjournal/contracts';
import {
  getAccessStatus,
  verifyElefin,
  checkActivity,
} from './access.service.js';
import { getMaintenanceMode } from './settings.service.js';

export async function handleGetAccessStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = res.locals.user;
    ok(res, await getAccessStatus(user.id, user.email));
  } catch (err) {
    next(err);
  }
}

export async function handleVerifyElefin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = res.locals.user;
    ok(res, await verifyElefin(user.id, user.email, req.body as VerifyElefinInput));
  } catch (err) {
    next(err);
  }
}

export async function handleCheckActivity(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = res.locals.user;
    const result = await checkActivity(user.id, user.email, true);
    // Always return the payload so the inactive page can show tradeCount7d.
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

/** Public maintenance probe — no auth required. */
export async function handlePublicMaintenance(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getMaintenanceMode());
  } catch (err) {
    next(err);
  }
}
