// Runs the broker REST adapter against a disposable Postgres with a fake broker API
// (global fetch stubbed). Skipped unless PARTNERS_TEST_DB points at a local database:
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_partner pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB;
  process.env.CREDENTIAL_ENCRYPTION_KEY ??= 'b4dc161ef8aede4aa30829dfe68a7aa4a57b4cc3e892986dd831b9e2e7da74ce';
}

describe.skipIf(!local)('broker REST adapter (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let integ: typeof import('../ib/integrations.service.js');
  let saveSettings: typeof import('../ib/settings.js').saveProgramSettings;
  let invalidate: typeof import('../ib/settings.js').invalidateProgramSettings;
  const tag = `ra${Date.now()}`;
  let partnerId = '', brokerId = '';
  const calls: { url: string; init?: RequestInit }[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    integ = await import('../ib/integrations.service.js');
    ({ saveProgramSettings: saveSettings, invalidateProgramSettings: invalidate } = await import('../ib/settings.js'));
    const owner = await prisma.user.create({ data: { name: 'RA Partner', email: `${tag}@partners.test` } });
    const p = await prisma.partner.create({ data: { userId: owner.id, status: 'ACTIVE', approvedAt: new Date() } });
    partnerId = p.id;
    brokerId = (await prisma.partnerBroker.create({ data: { partnerId, broker: 'exness' } })).id;
    await saveSettings({
      activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 7, lockedPerks: [],
      ibApiHosts: ['exnessaffiliates.com'],
    }, 'test');
    // Fake broker: login → token, then two pages of clients.
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/api/auth/')) {
        const body = JSON.parse(String(init?.body));
        return body.password === 'right-password' ? json({ token: 'tok-123' }) : json({ detail: 'bad login' }, 401);
      }
      if ((init?.headers as Record<string, string>)?.Authorization !== 'JWT tok-123') return json({ detail: 'unauthorised' }, 401);
      if (url.includes('page=2')) return json({ data: [{ client_account: 9100003, email: 'C@X.IO', volume_lots: 4 }], next: null });
      return json({ data: [{ client_account: 9100001, email: 'a@x.io', volume_lots: 1.5 }, { client_account: 'bad id!' }, { client_account: 9100002 }], next: 'https://my.exnessaffiliates.com/api/clients/?page=2' });
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await prisma?.partnerBroker.deleteMany({ where: { partnerId } });
    await prisma?.partnerEvent.deleteMany({ where: { partnerId } });
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.systemSetting.deleteMany({ where: { key: 'partner.program' } });
    invalidate();
    await prisma?.$disconnect();
  });

  const config = {
    baseUrl: 'https://my.exnessaffiliates.com', auth: 'jwt-login' as const, authPath: '/api/auth/', username: 'honey@ib.test',
    clientsPath: '/api/clients/', listKey: 'data', fields: { accountId: 'client_account', email: 'email', lots: 'volume_lots' },
  };

  it('refuses hosts that are not approved', async () => {
    await expect(integ.saveApiConfig(partnerId, brokerId, { ...config, baseUrl: 'https://evil.example.com' }, 'x')).rejects.toMatchObject({ code: 'IB_API_HOST' });
    await expect(integ.saveApiConfig(partnerId, brokerId, { ...config, baseUrl: 'https://exnessaffiliates.com.evil.io' }, 'x')).rejects.toMatchObject({ code: 'IB_API_HOST' });
  });

  it('logs in, follows pages and applies the list', async () => {
    const out = await integ.saveApiConfig(partnerId, brokerId, config, 'right-password');
    expect(out).toEqual({ ok: true, accounts: 3 });
    const rows = await prisma.ibAccount.findMany({ where: { partnerBrokerId: brokerId }, orderBy: { accountId: 'asc' } });
    expect(rows.map(r => [r.accountId, r.email, r.lotsTotal])).toEqual([['9100001', 'a@x.io', 1.5], ['9100002', null, null], ['9100003', 'c@x.io', 4]]);
    const b = await prisma.partnerBroker.findUniqueOrThrow({ where: { id: brokerId } });
    expect(b.status).toBe('OK');
    expect(b.method).toBe('API');
    expect(b.apiKey).toMatch(/^enc:v1:/);
    expect(calls.filter(c => c.url.includes('/api/clients/')).length).toBe(2);
  });

  it('marks the connection failed with the broker’s answer on a bad password', async () => {
    const out = await integ.saveApiConfig(partnerId, brokerId, config, 'wrong');
    expect(out.ok).toBe(false);
    expect(out.error).toContain('401');
    const b = await prisma.partnerBroker.findUniqueOrThrow({ where: { id: brokerId } });
    expect(b.status).toBe('ERROR');
    // The last good list stays.
    expect(await prisma.ibAccount.count({ where: { partnerBrokerId: brokerId, removedAt: null } })).toBe(3);
  });

  it('never follows a next link to another host', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push({ url });
      if (url.endsWith('/api/auth/')) return new Response(JSON.stringify({ token: 'tok-123' }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ client_account: 9100009 }], next: 'https://169.254.169.254/latest' }), { status: 200 });
    }) as typeof fetch;
    calls.length = 0;
    const out = await integ.saveApiConfig(partnerId, brokerId, config, 'right-password');
    expect(out).toEqual({ ok: true, accounts: 1 });
    expect(calls.some(c => c.url.includes('169.254'))).toBe(false);
  });
});
