// Broker mode: only users with an MT5 account on an Elefin server get in.
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
const provider = { verifyUnderUs: vi.fn() };

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
    },
    brokerAccount: { findMany: vi.fn(async ({ where }: { where: { userId: string } }) => accounts.filter(a => a.userId === where.userId)) },
    user: { findUnique: vi.fn(async () => ({ createdAt: new Date('2020-01-01'), email: 'x@test.com' })) },
    partner: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('../settings.service.js', () => ({ getMaintenanceMode: vi.fn(async () => ({ enabled: false, message: null })) }));
vi.mock('../elefin.provider.js', () => ({ getElefinProvider: () => provider }));
vi.mock('../../accounts/accounts.repository.js', () => ({ findAccountsByUser: vi.fn(async (id: string) => accounts.filter(a => a.userId === id)) }));
vi.mock('../../trades/trades.service.js', () => ({ fetchTrades: vi.fn(async () => []) }));

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
    rows.clear(); accounts = []; grants = []; provider.verifyUnderUs.mockReset();
    env.ACCESS_REQUIRE_ACTIVITY = false;
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

  it('applies the activity rule only when switched on', async () => {
    env.ACCESS_REQUIRE_ACTIVITY = true;
    accounts = [{ userId: 'u5', broker: 'Elefin', server: 'Elefin-Trade' }];
    await expect(svc.assertPlatformAccess('u5', 'u5@test.com')).rejects.toMatchObject({ code: 'ACCESS_INACTIVE' });
  });
});
