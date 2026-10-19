import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors.js';
import { assertPlatformAccess } from '../../modules/admin/access.service.js';
import { isAdmin } from '../../lib/admin.js';
import { isMaintenanceEnabled } from '../../modules/admin/settings.service.js';
import { MaintenanceError } from '../errors.js';
import { env } from '@tradinjournal/config';

/**
 * Enforces platform access rules after requireAuth.
 * Admins bypass maintenance and access checks.
 * When PLATFORM_ACCESS_ENABLED is false, only maintenance is enforced.
 */
// A page fires several gated requests at once, and each full check is ~8 queries
// (plus a possible activity recount). Remember a PASS for a minute per user and
// share in-flight checks; failures are never cached, so someone who just became
// eligible gets in immediately. Revocations take effect within PASS_TTL_MS.
const PASS_TTL_MS = 60_000;
const passes = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

async function checkAccessCached(userId: string, email: string, requireActivity: boolean): Promise<void> {
  const key = `${userId}:${requireActivity ? 'a' : 'n'}`;
  const until = passes.get(key);
  if (until && until > Date.now()) return;
  let p = inflight.get(key);
  if (!p) {
    p = assertPlatformAccess(userId, email, { requireActivity })
      .then(() => {
        passes.set(key, Date.now() + PASS_TTL_MS);
        if (passes.size > 50_000) for (const [k, t] of passes) if (t <= Date.now()) passes.delete(k);
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Test hook. */
export function clearAccessPassCache(): void { passes.clear(); }

export async function requirePlatformAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = res.locals.user;
    if (!user?.id || !user.email) {
      next(new UnauthorizedError());
      return;
    }

    if (isAdmin(user.email)) {
      next();
      return;
    }

    const maintenance = await isMaintenanceEnabled();
    if (maintenance) {
      const { getMaintenanceMode } = await import('../../modules/admin/settings.service.js');
      const mode = await getMaintenanceMode();
      next(new MaintenanceError(mode.message ?? undefined, mode.message ?? undefined));
      return;
    }

    if (!env.PLATFORM_ACCESS_ENABLED) {
      next();
      return;
    }

    // Elefin required everywhere; activity required except accounts/sync so
    // inactive users can still connect brokers and earn the trade threshold.
    const mount = req.baseUrl || '';
    const full = `${mount}${req.path || ''}`;
    const allowWithoutActivity =
      mount.includes('/accounts') ||
      full.includes('/api/accounts');

    await checkAccessCached(user.id, user.email, !allowWithoutActivity);
    next();
  } catch (err) {
    next(err);
  }
}

/** Shorthand: requireAuth + requirePlatformAccess for protected app routes. */
export { requireAuth } from './require-auth.js';
