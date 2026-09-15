import type { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../http/response.js';
import type {
  CreateAccessGrantInput,
  MaintenanceModeInput,
} from '@tradinjournal/contracts';
import {
  getAdminOverview,
  getAdminEngagement,
  listGrants,
  createGrant,
  revokeGrant,
  toggleMaintenance,
  listAdminUsers,
  getAdminUserDossier,
  listAdminAudit,
  adminRecheckUser,
} from './admin.service.js';
import { getMaintenanceMode } from './settings.service.js';

function actor(res: Response) {
  return { id: res.locals.user.id, email: res.locals.user.email };
}

export async function handleAdminOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getAdminOverview());
  } catch (err) {
    next(err);
  }
}

export async function handleAdminEngagement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = String(req.query.range || '14d');
    const range = raw === '7d' || raw === '30d' || raw === '14d' ? raw : '14d';
    ok(res, await getAdminEngagement(range));
  } catch (err) {
    next(err);
  }
}

export async function handleListGrants(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await listGrants());
  } catch (err) {
    next(err);
  }
}

export async function handleCreateGrant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, await createGrant(req.body as CreateAccessGrantInput, actor(res)));
  } catch (err) {
    next(err);
  }
}

export async function handleRevokeGrant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await revokeGrant(req.params.id!, actor(res)));
  } catch (err) {
    next(err);
  }
}

export async function handleGetMaintenance(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getMaintenanceMode());
  } catch (err) {
    next(err);
  }
}

export async function handleSetMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as MaintenanceModeInput;
    ok(res, await toggleMaintenance(body.enabled, actor(res), body.message));
  } catch (err) {
    next(err);
  }
}

export async function handleListUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const filterRaw = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const filter = (
      ['all', 'elefin', 'grant', 'inactive', 'no_broker', 'active_today'] as const
    ).includes(filterRaw as 'all')
      ? (filterRaw as 'all' | 'elefin' | 'grant' | 'inactive' | 'no_broker' | 'active_today')
      : 'all';
    ok(res, await listAdminUsers(page, limit, q, filter));
  } catch (err) {
    next(err);
  }
}

export async function handleUserDossier(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await getAdminUserDossier(req.params.id!));
  } catch (err) {
    next(err);
  }
}

export async function handleListAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    ok(res, await listAdminAudit(page, limit));
  } catch (err) {
    next(err);
  }
}

export async function handleRecheckUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminRecheckUser(req.params.id!, actor(res));
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

export async function handleAdminTraderOps(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getTraderOpsStatus } = await import('../trader/trader.ops.service.js');
    ok(res, await getTraderOpsStatus());
  } catch (err) {
    next(err);
  }
}

export async function handleAdminGeo(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getAdminGeo } = await import('../me/location.service.js');
    ok(res, await getAdminGeo());
  } catch (err) {
    next(err);
  }
}
