// Platform access rules — manual grants, Elefin verification, activity checks.
import { prisma, type UserAccess } from '@tradinjournal/db';
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
import { isElefinServer } from '../../lib/broker-policy.js';
export { isElefinServer };

const ACTIVITY_CACHE_MS = 15 * 60 * 1000;
const INACTIVE_CACHE_MS = 60 * 1000;

/** "Need 1 closed trade on Elefin in the last 30 days" (from the live settings). */
function activityRuleText(): string {
  const n = env.ACCESS_MIN_TRADES_7D;
  return `Need ${n} closed trade${n === 1 ? '' : 's'} on Elefin in the last ${env.ACCESS_ACTIVITY_WINDOW_DAYS} days`;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}


const brokerMode = () => env.ELEFIN_VERIFY_MODE === 'broker';
const elefinCheck = (): 'broker' | 'api' => (brokerMode() ? 'broker' : 'api');

/**
 * Elefin itself confirmed this trader as a partner's active client (the partner's Elefin
 * key, looked up by their confirmed email), or an admin verified them for Elefin. A
 * suspended or unknown client doesn't count.
 */
async function elefinConfirmedClient(userId: string): Promise<boolean> {
  const row = await prisma.clientVerification.findFirst({
    where: { userId, broker: 'elefin', brokerAccountId: null, externalAccountId: null, status: 'VERIFIED' },
    select: { id: true },
  });
  return !!row;
}

/**
 * Broker mode: the user's Elefin status follows the evidence — VERIFIED while they have an
 * MT5 account on an Elefin server or Elefin confirmed them through their partner's key,
 * PENDING otherwise. Manual grants are left alone.
 */
async function syncElefinFromAccounts(row: UserAccess): Promise<UserAccess> {
  if (row.source === 'MANUAL_GRANT') return row;
  const accounts = await prisma.brokerAccount.findMany({ where: { userId: row.userId }, select: { server: true } });
  const has = accounts.some(a => isElefinServer(a.server)) || (await elefinConfirmedClient(row.userId));
  const want = has ? 'VERIFIED' : 'PENDING';
  if (row.elefinStatus === want) return row;
  return prisma.userAccess.update({
    where: { userId: row.userId },
    data: has
      ? { elefinStatus: 'VERIFIED', source: 'ELEFIN_VERIFIED', elefinVerifiedAt: new Date(), lastDeniedReason: null }
      : { elefinStatus: 'PENDING', source: null, lastDeniedReason: 'No Elefin MT5 account connected and no partner’s Elefin confirmation' },
  });
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
  if (env.ACCESS_REQUIRE_ACTIVITY && input.activityStatus !== 'ACTIVE') return 'INACTIVE';
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
  const partnerStatus = env.PARTNER_PROGRAM_ENABLED
    ? (await prisma.partner.findUnique({ where: { userId }, select: { status: true } }))?.status ?? null
    : null;

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
      elefinCheck: elefinCheck(),
      maintenance: { enabled: maintenance.enabled, message: maintenance.message },
    };
  }

  await syncManualGrant(userId, email);
  let row = await ensureUserAccess(userId);
  if (brokerMode()) row = await syncElefinFromAccounts(row);
  const grant = await getActiveGrant(email);

  // Trade activity, when the rule is on, is worked out here (cached), so this status,
  // the web gate and the API middleware all agree. A saved INACTIVE from earlier must
  // not lock out someone who has traded since, and a saved ACTIVE must not outlive the
  // window. New signups are let in for ACCESS_ACTIVITY_WINDOW_DAYS (checkActivity).
  let activityStatus = row.activityStatus;
  let tradeCount7d = row.tradeCount7d;
  if (row.elefinStatus === 'VERIFIED') {
    if (!env.ACCESS_REQUIRE_ACTIVITY || grant || adminUser) activityStatus = 'ACTIVE';
    else {
      const a = await checkActivity(userId, email);
      activityStatus = a.active ? 'ACTIVE' : 'INACTIVE';
      tradeCount7d = a.tradeCount7d;
    }
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
    tradeCount7d,
    minTradesRequired: env.ACCESS_MIN_TRADES_7D,
    activityWindowDays: env.ACCESS_ACTIVITY_WINDOW_DAYS,
    isAdmin: adminUser,
    partnerStatus,
    elefinCheck: elefinCheck(),
    maintenance: { enabled: maintenance.enabled, message: maintenance.message },
  };
}

export async function verifyElefin(userId: string, email: string, input: VerifyElefinInput): Promise<AccessStatusDto> {
  const grant = await getActiveGrant(email);
  if (grant) {
    await syncManualGrant(userId, email);
    return getAccessStatus(userId, email);
  }

  // Broker mode has nothing to call: connecting an Elefin MT5 account is the check.
  if (brokerMode()) return getAccessStatus(userId, email);

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

/**
 * When Elefin last saw this trader close a trade, from their partner's synced Elefin book
 * (only for traders Elefin confirmed as that partner's client). Covers trading at Elefin
 * on an account they haven't connected here. Null when unknown.
 */
async function elefinLastTradeMs(userId: string): Promise<number | null> {
  const [row] = await prisma.$queryRaw<{ last: bigint | number | null }[]>`
    SELECT MAX((pb."apiConfig" #>> ARRAY['roster', 'clients', substr(cv."ibAccountId", ${ELEFIN_REF_PREFIX.length + 1}), '2'])::bigint) AS last
    FROM "client_verification" cv
    JOIN "partner_broker" pb ON pb."partnerId" = cv."partnerId" AND pb.broker = 'elefin'
    WHERE cv."userId" = ${userId} AND cv.broker = 'elefin' AND cv.status = 'VERIFIED'
      AND cv."brokerAccountId" IS NULL AND cv."externalAccountId" IS NULL
      AND cv."ibAccountId" LIKE ${`${ELEFIN_REF_PREFIX}%`}`;
  const last = row?.last == null ? null : Number(row.last);
  return last && Number.isFinite(last) ? last * 1000 : null;
}
/** Same as clientRef in partners/ib/elefin/verify.ts; kept here so access checks don't load the partner module. */
const ELEFIN_REF_PREFIX = 'elefin-client:';

/**
 * Closed trades in the activity window on the user's Elefin MT5 accounts. When none are
 * connected or none closed, Elefin's own last-trade date (partner-confirmed traders)
 * counts as one, so trading at Elefin keeps access even before MT5 is connected here.
 */
async function countElefinTrades7d(userId: string): Promise<number> {
  const windowMs = env.ACCESS_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const mt5 = await countMt5Closed(userId, cutoff);
  if (mt5 > 0) return mt5;
  try {
    const last = await elefinLastTradeMs(userId);
    return last != null && last >= cutoff ? 1 : 0;
  } catch (err) {
    logger.warn('[access] Elefin last-trade lookup failed', { err });
    return 0;
  }
}

async function countMt5Closed(userId: string, cutoff: number): Promise<number> {
  const accounts = await findAccountsByUser(userId);
  const elefinAccounts = accounts.filter(a => isElefinServer(a.server));
  if (!elefinAccounts.length) return 0;
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
  // A pass is remembered for 15 minutes; a lock only for a minute, so someone who just
  // traded gets back in quickly. UNKNOWN (never counted) always counts now.
  const ttl = row.activityStatus === 'ACTIVE' ? ACTIVITY_CACHE_MS : row.activityStatus === 'INACTIVE' ? INACTIVE_CACHE_MS : 0;
  const cached =
    !force &&
    row.activityCheckedAt &&
    now - row.activityCheckedAt.getTime() < ttl;

  const tradeCount = cached ? row.tradeCount7d : await countElefinTrades7d(userId);
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
          : activityRuleText(),
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

  // getAccessStatus already counted trade activity (admins, grants and new signups pass).
  // Routes that let an inactive user fix it (their broker accounts) skip only this part.
  if (status.status === 'INACTIVE' && opts?.requireActivity !== false) {
    const { AccessInactiveError } = await import('../../http/errors.js');
    throw new AccessInactiveError(`${activityRuleText()}. Trade on Elefin, then recheck.`, status.tradeCount7d);
  }
}

export async function recheckUserAccess(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;
  await syncManualGrant(userId, user.email);
  const row = await prisma.userAccess.findUnique({ where: { userId } });
  if (!row || row.source === 'MANUAL_GRANT') return;
  if (brokerMode()) await syncElefinFromAccounts(row);
  else if (row.elefinStatus !== 'VERIFIED') {
    await verifyElefin(userId, user.email, { email: user.email });
  }
  if (env.ACCESS_REQUIRE_ACTIVITY) await checkActivity(userId, user.email, true);
}
