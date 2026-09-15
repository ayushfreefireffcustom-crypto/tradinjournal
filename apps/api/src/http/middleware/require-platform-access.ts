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

    await assertPlatformAccess(user.id, user.email, {
      requireActivity: !allowWithoutActivity,
    });
    next();
  } catch (err) {
    next(err);
  }
}

/** Shorthand: requireAuth + requirePlatformAccess for protected app routes. */
export { requireAuth } from './require-auth.js';
