// Partner mode: only Elefin traders confirmed as a TRADElogs partner's client get in.
// An MT5 account at Elefin alone isn't enough any more.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const env = {
  PLATFORM_ACCESS_ENABLED: true,
  ELEFIN_VERIFY_MODE: 'partner',
  ACCESS_REQUIRE_ACTIVITY: false,
  ACCESS_MIN_TRADES_7D: 1,
  ACCESS_ACTIVITY_WINDOW_DAYS: 30,
  PARTNER_PROGRAM_ENABLED: true,
  ADMIN_EMAILS_LIST: ['admin@test.com'],
  MACRO_ADMIN_EMAILS_LIST: [],
};
vi.mock('@tradinjournal/config', () => ({ env }));
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@tradinjournal/logger', () => ({ logger }));

type Row = { userId: string; source: string | null; elefinStatus: string; activityStatus: string; tradeCount7d: number; activityCheckedAt: Date | null; lastDeniedReason?: string | null };
const rows = new Map<string, Row>();
let accounts: { userId: string; server: string }[] = [];
let grants: { email: string }[] = [];
/** userId → the partner they're linked to. */
let referrals: Record<string, string> = {};
/** partnerId → status; userId → partner record (they ARE a partner). */
let partnerStatus: Record<string, string> = {};
let partnerOf: Record<string, string> = {};
/** Client verifications (trader-level or account-level, any method). */
let verifs: { userId: string; partnerId: string; broker: string; status: string; brokerAccountId?: string | null }[] = [];
let closedDaysAgo: Record<string, number[]> = {};
let createdDaysAgo = 2000;
const DAY = 86_400_000;
const lookupTrader = vi.fn(async () => 'skipped');

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    accessGrant: { findFirst: vi.fn(async ({ where }: { where: { email: string } }) => grants.find(g => g.email === where.email) ?? null) },
    userAccess: {
      upsert: vi.fn(async ({ where, create, update }: { where: { userId: string }; create: Partial<Row>; update: Partial<Row> }) => {
        const prev = rows.get(where.userId);
        const next = prev ? { ...prev, ...update } : { userId: where.userId, source: null, elefinStatus: 'PENDING', activityStatus: 'UNKNOWN', tradeCount7d: 0, activityCheckedAt: null, lastDeniedReason: null, ...create };
        rows.set(where.userId, next as Row);
        return next;
      }),
      update: vi.fn(async ({ where, data }: { where: { userId: string }; data: Partial<Row> }) => {
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        const next = { ...rows.get(where.userId)!, ...clean };
        rows.set(where.userId, next);
        return next;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => rows.get(where.userId) ?? null),
    },
    referral: { findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => (referrals[where.userId] ? { partnerId: referrals[where.userId] } : null)) },
    clientVerification: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; partnerId?: string; broker: string; status: string; brokerAccountId?: null; externalAccountId?: null; partner?: { status: string } } }) =>
        verifs.find(v => v.userId === where.userId && v.broker === where.broker && v.status === where.status
          && (where.partnerId === undefined || v.partnerId === where.partnerId)
          && (where.brokerAccountId === undefined || !v.brokerAccountId)
          && (!where.partner || partnerStatus[v.partnerId] === where.partner.status)) ?? null),
    },
    brokerAccount: { findMany: vi.fn(async ({ where }: { where: { userId: string } }) => accounts.filter(a => a.userId === where.userId)) },
    user: { findUnique: vi.fn(async () => ({ createdAt: new Date(Date.now() - createdDaysAgo * DAY), email: 'x@test.com' })) },
    $queryRaw: vi.fn(async () => [{ last: null }]),
    partner: { findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => (partnerOf[where.userId] ? { status: partnerOf[where.userId] } : null)) },
  },
}));
vi.mock('../settings.service.js', () => ({ getMaintenanceMode: vi.fn(async () => ({ enabled: false, message: null })) }));
vi.mock('../elefin.provider.js', () => ({ getElefinProvider: () => ({ verifyUnderUs: vi.fn() }) }));
vi.mock('../../partners/ib/elefin/verify.js', () => ({ lookupTrader }));
vi.mock('../../accounts/accounts.repository.js', () => ({ findAccountsByUser: vi.fn(async (id: string) => accounts.filter(a => a.userId === id)) }));
vi.mock('../../trades/trades.service.js', () => ({
  fetchTrades: vi.fn(async (userId: string) => (closedDaysAgo[userId] ?? []).map(d => ({ status: 'CLOSED', closeTime: new Date(Date.now() - d * DAY).toISOString() }))),
}));

const svc = await import('../access.service.js');
const status = async (u: string, e = `${u}@test.com`) => (await svc.getAccessStatus(u, e)).status;

describe('access in partner mode', () => {
  beforeEach(() => {
    rows.clear(); accounts = []; grants = []; referrals = {}; partnerStatus = { p1: 'ACTIVE', p2: 'ACTIVE', pz: 'PAUSED' }; partnerOf = {}; verifs = [];
    env.ELEFIN_VERIFY_MODE = 'partner'; env.PARTNER_PROGRAM_ENABLED = true; env.ACCESS_REQUIRE_ACTIVITY = false;
    closedDaysAgo = {}; createdDaysAgo = 2000; lookupTrader.mockClear(); logger.error.mockClear();
  });

  it('says the check is by partner', async () => {
    expect((await svc.getAccessStatus('u0', 'u0@test.com')).elefinCheck).toBe('partner');
  });

  it('an Elefin MT5 account alone no longer gets anyone in', async () => {
    accounts = [{ userId: 'u1', server: 'Elefin-Trade' }];
    expect(await status('u1')).toBe('ELEFIN_REQUIRED');
    expect(rows.get('u1')?.lastDeniedReason).toBe('Not confirmed as an Elefin client of a TRADElogs partner');
    await expect(svc.assertPlatformAccess('u1', 'u1@test.com')).rejects.toMatchObject({ code: 'ACCESS_ELEFIN_REQUIRED' });
  });

  it('lets in a trader Elefin confirmed for their partner (email lookup)', async () => {
    referrals = { u2: 'p1' };
    verifs = [{ userId: 'u2', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }];
    expect(await status('u2')).toBe('FULL_ACCESS');
    expect(rows.get('u2')?.source).toBe('ELEFIN_VERIFIED');
  });

  it('an MT5 account found on the partner’s Elefin list counts too', async () => {
    referrals = { u3: 'p1' };
    accounts = [{ userId: 'u3', server: 'Elefin-Trade' }];
    verifs = [{ userId: 'u3', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED', brokerAccountId: 'acc-1' }];
    expect(await status('u3')).toBe('FULL_ACCESS');
  });

  it('a confirmation at another broker does not count', async () => {
    referrals = { u4: 'p1' };
    verifs = [{ userId: 'u4', partnerId: 'p1', broker: 'xellion', status: 'VERIFIED' }];
    expect(await status('u4')).toBe('ELEFIN_REQUIRED');
  });

  it('a held or not-found answer does not count', async () => {
    referrals = { u5: 'p1' };
    verifs = [{ userId: 'u5', partnerId: 'p1', broker: 'elefin', status: 'NOT_FOUND' }];
    expect(await status('u5')).toBe('ELEFIN_REQUIRED');
  });

  it('only their own, active partner’s confirmation counts', async () => {
    referrals = { u6: 'p2' };
    verifs = [{ userId: 'u6', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }];
    expect(await status('u6')).toBe('ELEFIN_REQUIRED');
    referrals = { u7: 'pz' };
    verifs = [{ userId: 'u7', partnerId: 'pz', broker: 'elefin', status: 'VERIFIED' }];
    expect(await status('u7')).toBe('ELEFIN_REQUIRED');
    verifs = [{ userId: 'u8', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }];
    expect(await status('u8')).toBe('ELEFIN_REQUIRED'); // no referral at all
  });

  it('locks again when the confirmation goes away', async () => {
    referrals = { u9: 'p1' };
    verifs = [{ userId: 'u9', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }];
    expect(await status('u9')).toBe('FULL_ACCESS');
    partnerStatus.p1 = 'PAUSED';
    expect(await status('u9')).toBe('ELEFIN_REQUIRED');
    expect(rows.get('u9')?.elefinStatus).toBe('PENDING');
  });

  it('an active partner keeps their own journal with an Elefin MT5 account', async () => {
    partnerOf = { pu: 'ACTIVE' };
    accounts = [{ userId: 'pu', server: 'Elefin-Trade' }];
    expect(await status('pu')).toBe('FULL_ACCESS');
    partnerOf = { pu: 'PAUSED' };
    expect(await status('pu')).toBe('ELEFIN_REQUIRED');
    partnerOf = { pu: 'ACTIVE' }; accounts = [];
    expect(await status('pu')).toBe('ELEFIN_REQUIRED');
  });

  it('admins and manual grants still get in', async () => {
    expect(await status('a1', 'admin@test.com')).toBe('FULL_ACCESS');
    grants = [{ email: 'friend@test.com' }];
    expect(await status('g1', 'friend@test.com')).toBe('FULL_ACCESS');
  });

  it('the monthly trade rule still applies to confirmed traders', async () => {
    env.ACCESS_REQUIRE_ACTIVITY = true;
    referrals = { t1: 'p1' };
    accounts = [{ userId: 't1', server: 'Elefin-Trade' }];
    verifs = [{ userId: 't1', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }];
    closedDaysAgo = { t1: [45] };
    expect(await status('t1')).toBe('INACTIVE');
    closedDaysAgo = { t1: [3] };
    await svc.checkActivity('t1', 't1@test.com', true);
    expect(await status('t1')).toBe('FULL_ACCESS');
  });

  it('“check again” asks Elefin through the partner, then reports', async () => {
    referrals = { c1: 'p1' };
    lookupTrader.mockImplementationOnce(async () => { verifs = [{ userId: 'c1', partnerId: 'p1', broker: 'elefin', status: 'VERIFIED' }]; return 'changed'; });
    const s = await svc.verifyElefin('c1', 'c1@test.com', { email: 'c1@test.com' });
    expect(lookupTrader).toHaveBeenCalledWith('c1');
    expect(s.status).toBe('FULL_ACCESS');
  });

  it('without the partner programme it falls back to broker rules (never locks everyone out)', async () => {
    env.PARTNER_PROGRAM_ENABLED = false;
    accounts = [{ userId: 'f1', server: 'Elefin-Trade' }];
    const s = await svc.getAccessStatus('f1', 'f1@test.com');
    expect(s.status).toBe('FULL_ACCESS');
    expect(s.elefinCheck).toBe('broker');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('switching from broker to partner mode moves an Elefin-account-only user out, with the new reason', async () => {
    env.ELEFIN_VERIFY_MODE = 'broker';
    accounts = [{ userId: 's1', server: 'Elefin-Trade' }];
    expect(await status('s1')).toBe('FULL_ACCESS');
    env.ELEFIN_VERIFY_MODE = 'partner';
    expect(await status('s1')).toBe('ELEFIN_REQUIRED');
    expect(rows.get('s1')?.lastDeniedReason).toBe('Not confirmed as an Elefin client of a TRADElogs partner');
  });
});
