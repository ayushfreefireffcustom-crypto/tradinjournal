// Broker mode: only Elefin clients get in: an MT5 account on an Elefin server, or Elefin's
// own confirmation through a partner's key.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const env = {
  PLATFORM_ACCESS_ENABLED: true,
  ELEFIN_VERIFY_MODE: 'broker',
  ACCESS_REQUIRE_ACTIVITY: false,
  ACCESS_MIN_TRADES_7D: 2,
  ACCESS_ACTIVITY_WINDOW_DAYS: 7,
  PARTNER_PROGRAM_ENABLED: false,
  ADMIN_EMAILS_LIST: ['admin@test.com'],
  MACRO_ADMIN_EMAILS_LIST: [],
};
vi.mock('@tradinjournal/config', () => ({ env }));
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Row = { userId: string; source: string | null; elefinStatus: string; activityStatus: string; tradeCount7d: number; activityCheckedAt: Date | null };
const rows = new Map<string, Row>();
let accounts: { userId: string; broker: string; server: string }[] = [];
let grants: { email: string }[] = [];
/** Trader-level Elefin answers (a partner's key looked up their email). */
let confirmations: { userId: string; status: string }[] = [];
const provider = { verifyUnderUs: vi.fn() };
/** Closed trades per user on their MT5 accounts, as days ago. */
let closedDaysAgo: Record<string, number[]> = {};
/** Elefin's last-trade date for a partner-confirmed trader (days ago), from the partner's book. */
let elefinLastDaysAgo: Record<string, number | null> = {};
let createdDaysAgo = 2000;
const DAY = 86_400_000;

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    accessGrant: { findFirst: vi.fn(async ({ where }: { where: { email: string } }) => grants.find(g => g.email === where.email) ?? null) },
    userAccess: {
      upsert: vi.fn(async ({ where, create, update }: { where: { userId: string }; create: Partial<Row>; update: Partial<Row> }) => {
        const prev = rows.get(where.userId);
        const next = prev ? { ...prev, ...update } : { userId: where.userId, source: null, elefinStatus: 'PENDING', activityStatus: 'UNKNOWN', tradeCount7d: 0, activityCheckedAt: null, ...create };
        rows.set(where.userId, next as Row);
        return next;
      }),
      update: vi.fn(async ({ where, data }: { where: { userId: string }; data: Partial<Row> }) => {
        const next = { ...rows.get(where.userId)!, ...data };
        rows.set(where.userId, next);
        return next;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => rows.get(where.userId) ?? null),
    },
    clientVerification: { findFirst: vi.fn(async ({ where }: { where: { userId: string; status: string } }) => confirmations.find(c => c.userId === where.userId && c.status === where.status) ?? null) },
    brokerAccount: { findMany: vi.fn(async ({ where }: { where: { userId: string } }) => accounts.filter(a => a.userId === where.userId)) },
    user: { findUnique: vi.fn(async () => ({ createdAt: new Date(Date.now() - createdDaysAgo * DAY), email: 'x@test.com' })) },
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...vals: unknown[]) => {
      const userId = vals.find(v => typeof v === 'string' && !String(v).includes('%')) as string;
      const d = elefinLastDaysAgo[userId];
      return [{ last: d == null ? null : BigInt(Math.floor((Date.now() - d * DAY) / 1000)) }];
    }),
    partner: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('../settings.service.js', () => ({ getMaintenanceMode: vi.fn(async () => ({ enabled: false, message: null })) }));
vi.mock('../elefin.provider.js', () => ({ getElefinProvider: () => provider }));
vi.mock('../../accounts/accounts.repository.js', () => ({ findAccountsByUser: vi.fn(async (id: string) => accounts.filter(a => a.userId === id)) }));
vi.mock('../../trades/trades.service.js', () => ({
  fetchTrades: vi.fn(async (userId: string) => (closedDaysAgo[userId] ?? []).map(d => ({ status: 'CLOSED', closeTime: new Date(Date.now() - d * DAY).toISOString() }))),
}));

const svc = await import('../access.service.js');

describe('isElefinServer', () => {
  it('matches Elefin servers only', () => {
    expect(svc.isElefinServer('Elefin-Trade')).toBe(true);
    expect(svc.isElefinServer(' elefin-live ')).toBe(true);
    expect(svc.isElefinServer('XMGlobal-MT5 10')).toBe(false);
    expect(svc.isElefinServer('Fake-Elefin')).toBe(false);
  });
});

describe('access in broker mode', () => {
  beforeEach(() => {
    rows.clear(); accounts = []; grants = []; confirmations = []; provider.verifyUnderUs.mockReset();
    env.ACCESS_REQUIRE_ACTIVITY = false; env.ACCESS_MIN_TRADES_7D = 2; env.ACCESS_ACTIVITY_WINDOW_DAYS = 7;
    closedDaysAgo = {}; elefinLastDaysAgo = {}; createdDaysAgo = 2000;
  });

  it('locks users with no Elefin account', async () => {
    const s = await svc.getAccessStatus('u1', 'u1@test.com');
    expect(s.status).toBe('ELEFIN_REQUIRED');
    expect(s.elefinCheck).toBe('broker');
    await expect(svc.assertPlatformAccess('u1', 'u1@test.com')).rejects.toMatchObject({ code: 'ACCESS_ELEFIN_REQUIRED' });
  });

  it('a broker name saying Elefin on another server does not count', async () => {
    accounts = [{ userId: 'u1', broker: 'Elefin', server: 'XMGlobal-MT5 10' }];
    expect((await svc.getAccessStatus('u1', 'u1@test.com')).status).toBe('ELEFIN_REQUIRED');
  });

  it('lets in a user with an Elefin MT5 account, without any trade activity', async () => {
    accounts = [{ userId: 'u2', broker: 'Elefin', server: 'Elefin-Trade' }];
    const s = await svc.getAccessStatus('u2', 'u2@test.com');
    expect(s.status).toBe('FULL_ACCESS');
    expect(s.elefinStatus).toBe('VERIFIED');
    expect(rows.get('u2')?.source).toBe('ELEFIN_VERIFIED');
    await expect(svc.assertPlatformAccess('u2', 'u2@test.com')).resolves.toBeUndefined();
    expect(provider.verifyUnderUs).not.toHaveBeenCalled();
  });

  it('locks again when the Elefin account is removed', async () => {
    accounts = [{ userId: 'u3', broker: 'Elefin', server: 'Elefin-Trade' }];
    expect((await svc.getAccessStatus('u3', 'u3@test.com')).status).toBe('FULL_ACCESS');
    accounts = [];
    expect((await svc.getAccessStatus('u3', 'u3@test.com')).status).toBe('ELEFIN_REQUIRED');
    expect(rows.get('u3')?.elefinStatus).toBe('PENDING');
  });

  it('admins and manual grants get in without Elefin', async () => {
    expect((await svc.getAccessStatus('a1', 'admin@test.com')).status).toBe('FULL_ACCESS');
    grants = [{ email: 'friend@test.com' }];
    expect((await svc.getAccessStatus('g1', 'friend@test.com')).status).toBe('FULL_ACCESS');
    await expect(svc.assertPlatformAccess('g1', 'friend@test.com')).resolves.toBeUndefined();
  });

  it('verify-elefin never calls the Elefin API in broker mode', async () => {
    const s = await svc.verifyElefin('u4', 'u4@test.com', { mt5Login: 123 });
    expect(s.status).toBe('ELEFIN_REQUIRED');
    expect(provider.verifyUnderUs).not.toHaveBeenCalled();
  });

  it('lets in a referred trader Elefin confirmed through their partner’s key, with no MT5 yet', async () => {
    confirmations = [{ userId: 'u7', status: 'VERIFIED' }];
    const s = await svc.getAccessStatus('u7', 'u7@test.com');
    expect(s.status).toBe('FULL_ACCESS');
    expect(s.elefinStatus).toBe('VERIFIED');
  });

  it('a held or unknown Elefin answer doesn’t count, and losing the confirmation locks again', async () => {
    confirmations = [{ userId: 'u8', status: 'NOT_FOUND' }];
    expect((await svc.getAccessStatus('u8', 'u8@test.com')).status).toBe('ELEFIN_REQUIRED');
    confirmations = [{ userId: 'u8', status: 'VERIFIED' }];
    expect((await svc.getAccessStatus('u8', 'u8@test.com')).status).toBe('FULL_ACCESS');
    confirmations = [{ userId: 'u8', status: 'NOT_FOUND' }];
    expect((await svc.getAccessStatus('u8', 'u8@test.com')).status).toBe('ELEFIN_REQUIRED');
  });

  it('applies the activity rule only when switched on', async () => {
    env.ACCESS_REQUIRE_ACTIVITY = true;
    accounts = [{ userId: 'u5', broker: 'Elefin', server: 'Elefin-Trade' }];
    await expect(svc.assertPlatformAccess('u5', 'u5@test.com')).rejects.toMatchObject({ code: 'ACCESS_INACTIVE' });
  });
});

// The live rule: Elefin only, and at least 1 closed trade in the last 30 days.
describe('trade activity rule (1 trade in 30 days)', () => {
  beforeEach(() => {
    rows.clear(); accounts = []; grants = []; confirmations = [];
    env.ACCESS_REQUIRE_ACTIVITY = true; env.ACCESS_MIN_TRADES_7D = 1; env.ACCESS_ACTIVITY_WINDOW_DAYS = 30;
    closedDaysAgo = {}; elefinLastDaysAgo = {}; createdDaysAgo = 2000;
  });

  it('a trade closed inside 30 days keeps access', async () => {
    accounts = [{ userId: 't1', broker: 'Elefin', server: 'Elefin-Trade' }];
    closedDaysAgo = { t1: [29] };
    const s = await svc.getAccessStatus('t1', 't1@test.com');
    expect(s.status).toBe('FULL_ACCESS');
    expect(s.tradeCount7d).toBe(1);
    await expect(svc.assertPlatformAccess('t1', 't1@test.com')).resolves.toBeUndefined();
  });

  it('no trade in 30 days locks the app, and the status says so (not just the API)', async () => {
    accounts = [{ userId: 't2', broker: 'Elefin', server: 'Elefin-Trade' }];
    closedDaysAgo = { t2: [31, 90] };
    const s = await svc.getAccessStatus('t2', 't2@test.com');
    expect(s.status).toBe('INACTIVE');
    expect(s.tradeCount7d).toBe(0);
    await expect(svc.assertPlatformAccess('t2', 't2@test.com')).rejects.toMatchObject({ code: 'ACCESS_INACTIVE', message: expect.stringContaining('1 closed trade on Elefin in the last 30 days') });
    // Their broker pages stay open so they can fix it.
    await expect(svc.assertPlatformAccess('t2', 't2@test.com', { requireActivity: false })).resolves.toBeUndefined();
  });

  it('trading again lets them back in within the short lock cache (or at once on recheck)', async () => {
    accounts = [{ userId: 't3', broker: 'Elefin', server: 'Elefin-Trade' }];
    expect((await svc.getAccessStatus('t3', 't3@test.com')).status).toBe('INACTIVE');
    closedDaysAgo = { t3: [0] };
    expect((await svc.checkActivity('t3', 't3@test.com', true)).active).toBe(true);
    expect((await svc.getAccessStatus('t3', 't3@test.com')).status).toBe('FULL_ACCESS');
  });

  it('a stale ACTIVE from before does not outlive the window', async () => {
    accounts = [{ userId: 't4', broker: 'Elefin', server: 'Elefin-Trade' }];
    rows.set('t4', { userId: 't4', source: 'ELEFIN_VERIFIED', elefinStatus: 'VERIFIED', activityStatus: 'ACTIVE', tradeCount7d: 5, activityCheckedAt: new Date(Date.now() - 20 * 60_000) });
    expect((await svc.getAccessStatus('t4', 't4@test.com')).status).toBe('INACTIVE');
  });

  it('new signups get the 30 days before the rule applies', async () => {
    accounts = [{ userId: 't5', broker: 'Elefin', server: 'Elefin-Trade' }];
    createdDaysAgo = 3;
    expect((await svc.getAccessStatus('t5', 't5@test.com')).status).toBe('FULL_ACCESS');
    createdDaysAgo = 31;
    expect((await svc.checkActivity('t5', 't5@test.com', true)).active).toBe(false);
  });

  it('a partner-confirmed trader counts Elefin’s own last trade, even without MT5 here', async () => {
    confirmations = [{ userId: 't6', status: 'VERIFIED' }];
    elefinLastDaysAgo = { t6: 5 };
    expect((await svc.getAccessStatus('t6', 't6@test.com')).status).toBe('FULL_ACCESS');
    elefinLastDaysAgo = { t6: 45 };
    expect((await svc.checkActivity('t6', 't6@test.com', true)).active).toBe(false);
    expect((await svc.getAccessStatus('t6', 't6@test.com')).status).toBe('INACTIVE');
  });

  it('admins and manual grants are never held to it', async () => {
    expect((await svc.getAccessStatus('a1', 'admin@test.com')).status).toBe('FULL_ACCESS');
    grants = [{ email: 'friend@test.com' }];
    expect((await svc.getAccessStatus('g1', 'friend@test.com')).status).toBe('FULL_ACCESS');
    await expect(svc.assertPlatformAccess('g1', 'friend@test.com')).resolves.toBeUndefined();
  });

  it('still needs Elefin first: no Elefin account is ELEFIN_REQUIRED, not INACTIVE', async () => {
    expect((await svc.getAccessStatus('t7', 't7@test.com')).status).toBe('ELEFIN_REQUIRED');
  });

  it('a recheck by someone without Elefin keeps the Elefin reason, not the trade one', async () => {
    await svc.getAccessStatus('t8', 't8@test.com');
    const before = rows.get('t8')?.activityStatus;
    expect((await svc.checkActivity('t8', 't8@test.com', true)).active).toBe(false);
    expect(rows.get('t8')?.activityStatus).toBe(before);
  });
});
