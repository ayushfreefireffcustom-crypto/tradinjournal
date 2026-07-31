import type { Request, Response, NextFunction } from 'express';
import type { CreateAlertInput, UpdateAlertInput } from '@tradinjournal/contracts';
import { ok, created } from '../../http/response.js';
import { NotFoundError } from '../../http/errors.js';
import { listAlerts, createAlert, updateAlert, deleteAlert, dispatchPriceAlerts } from './alerts.service.js';

// GET /api/alerts — the user's price alerts.
export async function handleListAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { alerts: await listAlerts(res.locals.user.id as string) });
  } catch (err) {
    next(err);
  }
}

// POST /api/alerts — create a price alert.
export async function handleCreateAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, await createAlert(res.locals.user.id as string, req.body as CreateAlertInput));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/alerts/:id — edit threshold / status / recurring / note.
export async function handleUpdateAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alert = await updateAlert(res.locals.user.id as string, req.params.id as string, req.body as UpdateAlertInput);
    if (!alert) throw new NotFoundError('Alert not found');
    ok(res, alert);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/alerts/:id — remove an alert.
export async function handleDeleteAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await deleteAlert(res.locals.user.id as string, req.params.id as string));
  } catch (err) {
    next(err);
  }
}

// POST /internal/alerts/dispatch — worker-only. Check + fire due alerts.
export async function handleDispatchAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await dispatchPriceAlerts());
  } catch (err) {
    next(err);
  }
}
