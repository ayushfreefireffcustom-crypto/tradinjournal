// Exchange connections against a disposable Postgres with a fake exchange.
// Skipped unless TRADING_TEST_DB points at a local database:
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeError, type Exchange, type VerifyResult } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const KEY = Buffer.from('ab'.repeat(32), 'hex');

describe.skipIf(!local)('exchange connections (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../exchanges.service.js');
  const tag = `xit${Date.now()}`;
  let alice = { id: '', email: '' };
  let bob = { id: '', email: '' };
  let verifyImpl: () => Promise<VerifyResult>;
  const audits: string[] = [];

  const fakeAdapter = { verify: () => verifyImpl(), getAccount: async () => ({ equityUsd: 1234, availableUsd: 1000, baseCurrency: 'USD' }) } as unknown as Exchange;
  const deps = () => ({ adapterFor: () => fakeAdapter, key: () => KEY, audit: async (a: string) => void audits.push(a) });
  const ok = (accountRef?: string): VerifyResult => ({ ok: true, canTrade: true, equityUsd: 100, availableUsd: 100, baseCurrency: 'USD', accountRef });
  const input = (apiKey: string) => ({ exchange: 'DELTA_INDIA' as const, environment: 'TESTNET' as const, apiKey, apiSecret: `secret-${apiKey}` });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../exchanges.service.js');
    const a = await prisma.user.create({ data: { name: 'IT Alice', email: `${tag}-a@trading.test` } });
    const b = await prisma.user.create({ data: { name: 'IT Bob', email: `${tag}-b@trading.test` } });
    alice = { id: a.id, email: a.email };
    bob = { id: b.id, email: b.email };
  });

  beforeEach(() => {
    verifyImpl = async () => ok();
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('connects, encrypts the key and never returns it', async () => {
    const dto = await svc.connectExchange(alice, input(`${tag}KEYAAAA1`), deps());
    expect(dto).toMatchObject({ exchange: 'DELTA_INDIA', environment: 'TESTNET', keyLast4: 'AAA1', status: 'ACTIVE', canTrade: true, isLeader: false, activeFollows: 0 });
    expect(JSON.stringify(dto)).not.toContain('secret-');
    const row = await prisma.exchangeConnection.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.apiKeyEnc.startsWith('enc:v1:')).toBe(true);
    expect(row.apiSecretEnc).not.toContain('secret-');
    expect(svc.credsOf(row, KEY)).toMatchObject({ apiKey: `${tag}KEYAAAA1`, apiSecret: `secret-${tag}KEYAAAA1` });
    expect(audits).toContain('exchange.connect');
  });

  it('refuses the same key twice, for the same or another user, before calling the exchange', async () => {
    let called = 0;
    verifyImpl = async () => {
      called++;
      return ok();
    };
    await expect(svc.connectExchange(alice, input(`${tag}KEYAAAA1`), deps())).rejects.toThrow(/already connected this API key/);
    await expect(svc.connectExchange(bob, input(`${tag}KEYAAAA1`), deps())).rejects.toThrow(/another TRADElogs account/);
    expect(called).toBe(0);
  });

  it('refuses the same exchange account through a different key', async () => {
    verifyImpl = async () => ok(`${tag}-acct-1`);
    await svc.connectExchange(alice, input(`${tag}KEYBBBB2`), deps());
    await expect(svc.connectExchange(bob, input(`${tag}KEYCCCC3`), deps())).rejects.toThrow(/exchange account is already connected/);
  });

  it('turns exchange rejections into user-fixable errors and saves nothing', async () => {
    verifyImpl = async () => {
      throw new ExchangeError('IP_NOT_WHITELISTED', "This server's IP isn't on the API key's whitelist.", 401);
    };
    const before = await prisma.exchangeConnection.count({ where: { userId: bob.id } });
    await expect(svc.connectExchange(bob, input(`${tag}KEYDDDD4`), deps())).rejects.toMatchObject({ statusCode: 422, code: 'EXCHANGE_IP_NOT_WHITELISTED' });
    expect(await prisma.exchangeConnection.count({ where: { userId: bob.id } })).toBe(before);
  });

  it('refuses read-only keys', async () => {
    verifyImpl = async () => ({ ...ok(), canTrade: false });
    await expect(svc.connectExchange(bob, input(`${tag}KEYEEEE5`), deps())).rejects.toThrow(/cannot trade/);
  });

  it("hides other users' connections (404, not 403)", async () => {
    const [mine] = await svc.listConnections(alice.id);
    expect(mine).toBeDefined();
    await expect(svc.renameConnection(bob.id, mine!.id, 'pwned')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.testConnection(bob.id, mine!.id, deps())).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.connectionEquity(bob.id, mine!.id, deps())).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.removeConnection(bob, mine!.id, deps())).rejects.toMatchObject({ statusCode: 404 });
    expect((await svc.listConnections(bob.id)).some((c) => c.id === mine!.id)).toBe(false);
  });

  it('marks a connection INVALID when the exchange later rejects the key', async () => {
    const [mine] = await svc.listConnections(alice.id);
    verifyImpl = async () => {
      throw new ExchangeError('AUTH', 'The API key is invalid.', 401);
    };
    expect(await svc.testConnection(alice.id, mine!.id, deps())).toMatchObject({ status: 'INVALID', lastError: 'The API key is invalid.' });
    verifyImpl = async () => ok();
    expect(await svc.testConnection(alice.id, mine!.id, deps())).toMatchObject({ status: 'ACTIVE', lastError: null });
  });

  it('blocks removal while the account is a leader or has running follows, then wipes secrets', async () => {
    const [mine] = await svc.listConnections(alice.id);
    const leader = await prisma.copyLeader.create({ data: { userId: alice.id, connectionId: mine!.id, displayName: 'IT', status: 'VERIFIED' } });
    await expect(svc.removeConnection(alice, mine!.id, deps())).rejects.toThrow(/leader account/);
    await prisma.copyLeader.delete({ where: { id: leader.id } });

    const other = await prisma.copyLeader.create({
      data: { user: { connect: { id: bob.id } }, displayName: 'IT Bob', status: 'VERIFIED', connection: { create: { user: { connect: { id: bob.id } }, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'b', apiKeyEnc: 'x', apiSecretEnc: 'x', keyLast4: 'x', keyFingerprint: `${tag}-b` } } },
    });
    const follow = await prisma.copyFollow.create({ data: { userId: alice.id, leaderId: other.id, connectionId: mine!.id } });
    await expect(svc.removeConnection(alice, mine!.id, deps())).rejects.toThrow(/Copy trading is running on this account \(1 follow\)/);
    await prisma.copyFollow.update({ where: { id: follow.id }, data: { status: 'STOPPED' } });

    await svc.removeConnection(alice, mine!.id, deps());
    const row = await prisma.exchangeConnection.findUniqueOrThrow({ where: { id: mine!.id } });
    expect(row).toMatchObject({ status: 'REVOKED', apiKeyEnc: '', apiSecretEnc: '' });
    expect((await svc.listConnections(alice.id)).some((c) => c.id === mine!.id)).toBe(false);
    // The removed key can be connected again.
    await expect(svc.connectExchange(alice, input(`${tag}KEYAAAA1`), deps())).resolves.toMatchObject({ keyLast4: 'AAA1' });
  });

  it('enforces the per-user limit', async () => {
    const { env } = await import('@tradinjournal/config');
    const have = await prisma.exchangeConnection.count({ where: { userId: alice.id, status: { not: 'REVOKED' } } });
    for (let i = have; i < env.EXCHANGE_MAX_CONNECTIONS; i++) {
      await svc.connectExchange(alice, input(`${tag}KEYLIM${String(i).padStart(2, '0')}`), deps());
    }
    await expect(svc.connectExchange(alice, input(`${tag}KEYLIMXX`), deps())).rejects.toThrow(new RegExp(`up to ${env.EXCHANGE_MAX_CONNECTIONS}`));
  });

  it('returns equity from the exchange for an active connection', async () => {
    const [mine] = await svc.listConnections(alice.id);
    expect(await svc.connectionEquity(alice.id, mine!.id, deps())).toEqual({ equityUsd: 1234, availableUsd: 1000, baseCurrency: 'USD' });
  });
});
