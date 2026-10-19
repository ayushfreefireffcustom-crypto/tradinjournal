// Platform access rules — manual grants, Elefin verification, activity checks.
import { prisma } from '@tradinjournal/db';
import type {
  AccessStatusDto,
  ActivityCheckResult,
  PlatformAccessStatusDto,
  VerifyElefinInput,
} from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { isAdmin } from '../../lib/admin.js';
import { getElefinProvider } from './elefin.provider.js';
import { getMaintenanceMode } from './settings.service.js';
import { findAccountsByUser } from '../accounts/accounts.repository.js';
import { fetchTrades } from '../trades/trades.service.js';

const ACTIVITY_CACHE_MS = 15 * 60 * 1000;

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isElefinBroker(broker: string, server: string): boolean {
  const b = broker.toLowerCase();
  const s = server.toLowerCase();
  return b.includes('elefin') || s.includes('elefin');
}

async function getActiveGrant(email: string) {
  return prisma.accessGrant.findFirst({
    where: { email: normEmail(email), revokedAt: null },
  });
}

async function ensureUserAccess(userId: string) {
  return prisma.userAccess.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function resolvePlatformStatus(input: {
  isAdminUser: boolean;
  maintenance: boolean;
  hasGrant: boolean;
  elefinStatus: string;
  activityStatus: string;
}): PlatformAccessStatusDto {
  if (input.maintenance && !input.isAdminUser) return 'MAINTENANCE';
  if (input.hasGrant || input.isAdminUser) return 'FULL_ACCESS';
  if (input.elefinStatus !== 'VERIFIED') return 'ELEFIN_REQUIRED';
  if (input.activityStatus !== 'ACTIVE') return 'INACTIVE';
  return 'FULL_ACCESS';
}

/** New Elefin partners get a grace window from signup before the trade-activity gate applies. */
async function isWithinSignupGrace(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) return false;
  const graceMs = env.ACCESS_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - user.createdAt.getTime() < graceMs;
}

export async function syncManualGrant(userId: string, email: string): Promise<void> {
  const grant = await getActiveGrant(email);
  if (!grant) return;
  await prisma.userAccess.upsert({
    where: { userId },
    create: {
      userId,
      source: 'MANUAL_GRANT',
      elefinStatus: 'VERIFIED',
      activityStatus: 'ACTIVE',
      elefinVerifiedAt: new Date(),
    },
    update: {
      source: 'MANUAL_GRANT',
      elefinStatus: 'VERIFIED',
      activityStatus: 'ACTIVE',
      elefinVerifiedAt: new Date(),
      lastDeniedReason: null,
    },
  });
}

export async function getAccessStatus(userId: string, email: string): Promise<AccessStatusDto> {
  const maintenance = await getMaintenanceMode();
  const adminUser = isAdmin(email);
  const partnerStatus = (await prisma.partner.findUnique({ where: { userId }, select: { status: true } }))?.status ?? null;

  // Open launch: skip Elefin / activity gates but still surface maintenance + admin.
  if (!env.PLATFORM_ACCESS_ENABLED) {
    return {
      status: maintenance.enabled && !adminUser ? 'MAINTENANCE' : 'FULL_ACCESS',
      source: null,
      elefinStatus: 'PENDING',
      activityStatus: 'ACTIVE',
      tradeCount7d: 0,
      minTradesRequired: env.ACCESS_MIN_TRADES_7D,
      activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
      isAdmin: adminUser,
      partnerStatus,
      maintenance: { enabled: maintenance.enabled, message: maintenance.message },
    };
  }

  await syncManualGrant(userId, email);
  const row = await ensureUserAccess(userId);
  const grant = await getActiveGrant(email);

  // First-time / new signups: Elefin-verified users are admitted without trade
  // activity until ACCESS_ACTIVITY_WINDOW_DAYS after signup date.
  // Grace is computed in-memory only — never persist ACTIVE here or the gate
  // stays unlocked forever after the window ends.
  let activityStatus = row.activityStatus;
  if (
    !grant &&
    !adminUser &&
    row.elefinStatus === 'VERIFIED' &&
    activityStatus !== 'ACTIVE' &&
    (await isWithinSignupGrace(userId))
  ) {
    activityStatus = 'ACTIVE';
  }

  const status = resolvePlatformStatus({
    isAdminUser: adminUser,
    maintenance: maintenance.enabled,
    hasGrant: !!grant,
    elefinStatus: row.elefinStatus,
    activityStatus,
  });

  return {
    status,
    source: row.source,
    elefinStatus: row.elefinStatus,
    activityStatus,
    tradeCount7d: row.tradeCount7d,
    minTradesRequired: env.ACCESS_MIN_TRADES_7D,
    activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
    isAdmin: adminUser,
    partnerStatus,
    maintenance: { enabled: maintenance.enabled, message: maintenance.message },
  };
}

export async function verifyElefin(userId: string, email: string, input: VerifyElefinInput): Promise<AccessStatusDto> {
  const grant = await getActiveGrant(email);
  if (grant) {
    await syncManualGrant(userId, email);
    return getAccessStatus(userId, email);
  }

  const verifyEmail = input.email?.trim().toLowerCase() ?? email;
  try {
    const result = await getElefinProvider().verifyUnderUs({
      email: verifyEmail,
      mt5Login: input.mt5Login,
    });

    if (result.verified) {
      // Mark Elefin verified; trade-activity starts after signup grace.
      // Keep activity UNKNOWN so post-grace checks still run (do not stamp ACTIVE).
      await prisma.userAccess.upsert({
        where: { userId },
        create: {
          userId,
          source: 'ELEFIN_VERIFIED',
          elefinStatus: 'VERIFIED',
          activityStatus: 'UNKNOWN',
          elefinUid: result.elefinUid ?? null,
          elefinVerifiedAt: new Date(),
          lastDeniedReason: null,
        },
        update: {
          source: 'ELEFIN_VERIFIED',
          elefinStatus: 'VERIFIED',
          activityStatus: 'UNKNOWN',
          elefinUid: result.elefinUid ?? null,
          elefinVerifiedAt: new Date(),
          lastDeniedReason: null,
        },
      });
    } else {
      await prisma.userAccess.upsert({
        where: { userId },
        create: {
          userId,
          elefinStatus: 'FAILED',
          lastDeniedReason: 'No Elefin account found under our referral',
        },
        update: {
          elefinStatus: 'FAILED',
          lastDeniedReason: 'No Elefin account found under our referral',
        },
      });
    }
  } catch (err) {
    logger.error('[access] Elefin verify failed', { err });
    throw err;
  }

  return getAccessStatus(userId, email);
}

async function countElefinTrades7d(userId: string): Promise<number> {
  const accounts = await findAccountsByUser(userId);
  const elefinAccounts = accounts.filter(a => isElefinBroker(a.broker, a.server));
  if (!elefinAccounts.length) return 0;

  const windowMs = env.ACCESS_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  let count = 0;

  for (const account of elefinAccounts) {
    try {
      // Stored data — never blocks a gated request on the bridge.
      const trades = await fetchTrades(userId, account.id, 'background');
      count += trades.filter(
        t =>
          t.status === 'CLOSED' &&
          t.closeTime &&
          new Date(t.closeTime).getTime() >= cutoff,
      ).length;
    } catch (err) {
      logger.warn('[access] activity check failed for account', { accountId: account.id, err });
    }
  }
  return count;
}

export async function checkActivity(userId: string, email: string, force = false): Promise<ActivityCheckResult> {
  const grant = await getActiveGrant(email);
  if (grant || isAdmin(email)) {
    return {
      active: true,
      tradeCount7d: env.ACCESS_MIN_TRADES_7D,
      minTradesRequired: env.ACCESS_MIN_TRADES_7D,
      activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
    };
  }

  // Grace from signup date: don't require trades until the activity window
  // has elapsed since the user first signed up. Do not persist ACTIVE — that
  // would bypass the gate permanently after grace ends.
  if (await isWithinSignupGrace(userId)) {
    await prisma.userAccess.updateMany({
      where: { userId },
      data: {
        lastDeniedReason: null,
        activityCheckedAt: new Date(),
      },
    });
    return {
      active: true,
      tradeCount7d: 0,
      minTradesRequired: env.ACCESS_MIN_TRADES_7D,
      activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
    };
  }

  const row = await ensureUserAccess(userId);
  const now = Date.now();
  const cached =
    !force &&
    row.activityCheckedAt &&
    now - row.activityCheckedAt.getTime() < ACTIVITY_CACHE_MS;

  let tradeCount = cached ? row.tradeCount7d : await countElefinTrades7d(userId);
  const active = tradeCount >= env.ACCESS_MIN_TRADES_7D;
  const activityStatus = active ? 'ACTIVE' : 'INACTIVE';

  if (!cached) {
    await prisma.userAccess.update({
      where: { userId },
      data: {
        tradeCount7d: tradeCount,
        activityStatus,
        activityCheckedAt: new Date(),
        lastDeniedReason: active
          ? null
          : `Need ${env.ACCESS_MIN_TRADES_7D}+ closed trades on Elefin in the last ${env.ACCESS_ACTIVITY_WINDOW_DAYS} days`,
      },
    });
  }

  return {
    active,
    tradeCount7d: tradeCount,
    minTradesRequired: env.ACCESS_MIN_TRADES_7D,
    activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
  };
}

/** Throws if user cannot access protected platform routes. */
export async function assertPlatformAccess(
  userId: string,
  email: string,
  opts?: { requireActivity?: boolean },
): Promise<void> {
  if (!env.PLATFORM_ACCESS_ENABLED) {
    // Still honour maintenance when gates are otherwise off.
    const maintenance = await getMaintenanceMode();
    if (maintenance.enabled && !isAdmin(email)) {
      const { MaintenanceError } = await import('../../http/errors.js');
      throw new MaintenanceError(maintenance.message ?? undefined, maintenance.message ?? undefined);
    }
    return;
  }

  const status = await getAccessStatus(userId, email);

  if (status.status === 'MAINTENANCE') {
    const { MaintenanceError } = await import('../../http/errors.js');
    throw new MaintenanceError(status.maintenance.message ?? undefined, status.maintenance.message ?? undefined);
  }
  if (status.status === 'ELEFIN_REQUIRED') {
    const { AccessElefinRequiredError } = await import('../../http/errors.js');
    throw new AccessElefinRequiredError();
  }

  // Admins / manual grants are FULL_ACCESS without activity.
  // Elefin-verified users may look FULL_ACCESS during grace (in-memory) or from a
  // stale ACTIVE row written by older builds — always re-check activity once past grace.
  const privileged = status.isAdmin || status.source === 'MANUAL_GRANT';
  if (opts?.requireActivity !== false && !privileged && status.elefinStatus === 'VERIFIED') {
    if (!(await isWithinSignupGrace(userId))) {
      const activity = await checkActivity(userId, email);
      if (!activity.active) {
        const { AccessInactiveError } = await import('../../http/errors.js');
        throw new AccessInactiveError(undefined, activity.tradeCount7d);
      }
    }
    return;
  }

  if (status.status === 'FULL_ACCESS') return;
  if (status.status === 'INACTIVE' && opts?.requireActivity === false) return;
  if (status.status === 'INACTIVE') {
    const activity = await checkActivity(userId, email);
    if (!activity.active) {
      const { AccessInactiveError } = await import('../../http/errors.js');
      throw new AccessInactiveError(undefined, activity.tradeCount7d);
    }
  }
}

export async function recheckUserAccess(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;
  await syncManualGrant(userId, user.email);
  const row = await prisma.userAccess.findUnique({ where: { userId } });
  if (!row || row.source === 'MANUAL_GRANT') return;
  if (row.elefinStatus !== 'VERIFIED') {
    await verifyElefin(userId, user.email, { email: user.email });
  }
  await checkActivity(userId, user.email, true);
}
