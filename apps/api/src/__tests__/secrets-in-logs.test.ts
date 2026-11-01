// Z4: secrets never reach a log line or an error message. The logger masks
// secret-named fields and secret-shaped text, and every credential the process
// decrypts or receives is masked by value. Unit checks first, then the real app
// with an exchange and a broker bridge that carelessly put the raw keys in
// their errors: none of it may come out in the logs or the responses.
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { logger, redact, redactText, registerSecret } from '@tradinjournal/logger';
import type { ApiCredentials, Exchange } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `sec${Date.now()}`;

describe('log redaction', () => {
  it('masks secret-shaped text', () => {
    expect(redactText('Authorization: Bearer abcdefghij0123456789')).toBe('Authorization: Bearer [redacted]');
    expect(redactText('key tl_ab12cd34_ZYXWVUTSRQ0987654321 used')).toBe('key tl_[redacted] used');
    expect(redactText('POST https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage')).toBe('POST https://api.telegram.org/bot[redacted]/sendMessage');
    expect(redactText('POST /api/hooks/tv/Abc123XYZ_def456ghi 200 12 - 3 ms')).toBe('POST /api/hooks/tv/[redacted] 200 12 - 3 ms');
    expect(redactText('stored enc:v1:aGVsbG8.d29ybGQ.Zm9vYmFy here')).toBe('stored enc:v1:[redacted] here');
    expect(redactText('connect postgresql://app:Sup3rS3cret@db.example.com:5432/x failed')).toBe('connect postgresql://app:[redacted]@db.example.com:5432/x failed');
    expect(redactText('GET /verify?token=abcdef123456&next=/home')).toBe('GET /verify?token=[redacted]&next=/home');
    expect(redactText('anthropic sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV and groq gsk_ABCDEFGHIJKLMNOPQRSTUVWX')).toBe('anthropic sk-ant-[redacted] and groq gsk_[redacted]');
    // Prisma errors print their arguments.
    const prismaMsg = 'Invalid `prisma.brokerAccount.create()` invocation:\n{\n  data: {\n    password: "hunter2hunter2",\n    apiKeyEnc: "enc:v1:a.b.c",\n    server: "Demo-1"\n  }\n}';
    const out = redactText(prismaMsg);
    expect(out).not.toContain('hunter2hunter2');
    expect(out).toContain('server: "Demo-1"');
    expect(redactText('{"apiSecret":"x9y8z7w6","symbol":"BTCUSD"}')).toBe('{"apiSecret":"[redacted]","symbol":"BTCUSD"}');
  });

  it('masks secret-named fields at any depth, keeps the rest', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(redact({ userId: 'u1', password: 'p', headers: { authorization: 'Bearer x', cookie: 'sid=1', accept: 'json' }, creds: { apiKey: 'k', apiSecret: 's' }, list: [{ token: 't', symbol: 'BTCUSD' }], circular })).toEqual({
      userId: 'u1', password: '[redacted]', headers: { authorization: '[redacted]', cookie: '[redacted]', accept: 'json' }, creds: '[redacted]', list: [{ token: '[redacted]', symbol: 'BTCUSD' }], circular: { a: 1, self: '[circular]' },
    });
    expect(redact({ password: null, token: '' })).toEqual({ password: null, token: '' }); // nothing to hide
  });

  it('masks values it was told about, wherever they appear', () => {
    const k = `K-${randomBytes(6).toString('hex')}`;
    const s = randomBytes(18).toString('base64url');
    registerSecret(k, s, 'short'); // 'short' is under 8 characters: ignored
    expect(redactText(`fetch failed for ${k} with ${s} (short)`)).toBe('fetch failed for [redacted] with [redacted] (short)');
    const e = new Error(`signature mismatch for secret ${s}`);
    const r = redact(e) as { message: string; stack: string };
    expect(r.message).toBe('signature mismatch for secret [redacted]');
    expect(r.stack).not.toContain(s);
  });

  it('applies to everything the logger writes', () => {
    const lines: string[] = [];
    const tap = (info: Record<string | symbol, unknown>) => lines.push(String(info[Symbol.for('message')]));
    logger.on('data', tap);
    const s = `S-${randomBytes(10).toString('hex')}`;
    registerSecret(s);
    logger.warn(`exchange said: bad secret ${s}`, { req: { headers: { authorization: 'Bearer abcdefghijklmnop' } }, err: new Error(`boom ${s}`) });
    logger.error(new Error(`unexpected ${s}`));
    logger.off('data', tap);
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(l).not.toContain(s);
      expect(l).not.toContain('abcdefghijklmnop');
    }
  });
});

describe.skipIf(!local)('secrets over the real app', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  const lines: string[] = [];
  const tap = (info: Record<string | symbol, unknown>) => lines.push(String(info[Symbol.for('message')]));
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const me = { id: '', email: `${tag}@trading.test`, cookie: '' };
  const PASS = 'Secrets-test-12345';
  // Fresh random values, so a hit can only come from this run.
  const S = { key1: `DK${randomBytes(8).toString('hex')}`, secret1: randomBytes(24).toString('base64url'), key2: `DK${randomBytes(8).toString('hex')}`, secret2: randomBytes(24).toString('base64url'), investor: `Inv-${randomBytes(8).toString('hex')}`, wrongPassword: `Wrong-${randomBytes(8).toString('hex')}` };
  const responses: string[] = [];
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie: me.cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    responses.push(text);
    return { status: r.status, text, json: (() => { try { return JSON.parse(text) as { data: Record<string, unknown> }; } catch { return null; } })() };
  };

  // An exchange whose errors carry the raw credentials (the worst a library could do).
  const careless = (): Exchange => ({
    id: 'DELTA_INDIA', env: 'testnet',
    async verify(c: ApiCredentials) { if (c.apiKey === S.key1) throw new Error(`verify failed: api-key ${c.apiKey} secret ${c.apiSecret}`); return { ok: true, canTrade: true, equityUsd: 1000, availableUsd: 1000, baseCurrency: 'USD', accountRef: `${tag}-acct` }; },
    async getAccount(c: ApiCredentials) { throw new Error(`GET /v2/wallet/balances failed with headers {"api-key":"${c.apiKey}"} using ${c.apiSecret}`); },
    async getPositions(c: ApiCredentials) { throw new Error(`positions: ${c.apiSecret}`); },
    async getOpenOrders(c: ApiCredentials) { throw new Error(`open orders for ${c.apiKey}`); },
  } as unknown as Exchange);

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: 'true', PLATFORM_ACCESS_ENABLED: 'false', PLANS_ENABLED: 'false', CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
    vi.doMock('../lib/email/client.js', () => ({ sendEmail: async () => undefined }));
    vi.doMock('@tradinjournal/exchange', async (orig) => ({ ...(await orig<typeof import('@tradinjournal/exchange')>()), adapterFor: () => careless() }));
    // The MT5 bridge, equally careless about the investor password.
    vi.doMock('../lib/broker-connector.js', async (orig) => ({ ...(await orig<typeof import('../lib/broker-connector.js')>()), verifyAccount: async (c: { password: string }) => { throw new Error(`bridge refused login with password ${c.password}`); } }));
    // The app's modules import their own copy of the logger after the reset.
    const lg = await import('@tradinjournal/logger');
    lg.logger.on('data', tap);
    const { createApp } = await import('../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const row = await prisma.user.create({ data: { email: me.email, name: 'Sec', emailVerified: true } });
    await prisma.account.create({ data: { userId: row.id, accountId: row.id, providerId: 'credential', password: await hashPassword(PASS) } });
    me.id = row.id;
    const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: me.email, password: PASS }) });
    me.cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]!).join('; ');
  }, 120_000);

  afterAll(async () => {
    const lg = await import('@tradinjournal/logger');
    lg.logger.off('data', tap);
    await prisma?.user.deleteMany({ where: { id: me.id } });
    await close();
    await prisma?.$disconnect();
  });

  it('keeps exchange keys, broker passwords and tokens out of logs and responses', async () => {
    // A failed connect whose error names the key and secret.
    const bad = await call('POST', '/api/exchanges', { exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'Bad', apiKey: S.key1, apiSecret: S.secret1 });
    expect(bad.status).toBe(500);
    expect(bad.json).toMatchObject({ error: { code: 'INTERNAL', message: 'Internal server error' } });
    // A good one, then calls whose errors carry the decrypted credentials.
    const good = await call('POST', '/api/exchanges', { exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'Good', apiKey: S.key2, apiSecret: S.secret2 });
    expect(good.status).toBe(201);
    const id = good.json!.data.id as string;
    expect(good.text).not.toContain(S.key2.slice(0, -4)); // only the last 4 are ever shown
    await call('GET', `/api/exchanges/${id}/equity`);
    await call('GET', '/api/trading/overview');
    await call('POST', `/api/exchanges/${id}/test`);
    // A broker login the bridge refuses, quoting the password.
    await call('POST', '/api/accounts', { mt5Login: 12345678, password: S.investor, server: 'Demo-Server' });
    // A wrong sign-in password.
    await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: me.email, password: S.wrongPassword }) });
    // A TradingView alert: its URL token is a credential too.
    const hookToken = `${tag}TvToken${randomBytes(6).toString('hex')}`;
    await prisma.tradingWebhook.create({ data: { userId: me.id, connectionId: id, token: hookToken, secretHash: 'x'.repeat(64), secretLast4: '0000' } });
    await fetch(`${base}/api/hooks/tv/${hookToken}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong-secret-value', action: 'buy' }) });
    // An API key, used and misused.
    const k = await call('POST', '/api/trading/api-keys', { name: 'Sec', scope: 'read' });
    const apiKey = k.json!.data.key as string;
    await call('GET', '/api/v1/accounts', undefined, { authorization: `Bearer ${apiKey}` });
    await call('GET', '/api/v1/positions', undefined, { authorization: `Bearer ${apiKey}` });
    await call('GET', '/api/v1/accounts', undefined, { authorization: `Bearer ${apiKey.slice(0, -2)}xx` });

    expect(lines.length).toBeGreaterThan(10);
    const logs = lines.join('\n');
    // The careless errors did reach the logs, masked.
    expect(logs).toContain('verify failed: api-key [redacted] secret [redacted]');
    expect(logs).toMatch(/\/api\/hooks\/tv\/\[redacted\]/);
    for (const [name, v] of Object.entries({ ...S, hookToken, apiKey, apiKeySecretPart: apiKey.split('_').pop()! })) {
      expect(logs.includes(v), `${name} in the logs`).toBe(false);
      expect(responses.some((r) => r.includes(v) && !(name === 'apiKey' || name === 'apiKeySecretPart')), `${name} in a response`).toBe(false);
    }
    // At rest: the exchange keys are encrypted, never stored as given.
    const stored = await prisma.exchangeConnection.findUniqueOrThrow({ where: { id } });
    expect(stored.apiKeyEnc.startsWith('enc:v1:')).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(S.secret2);
    // And the alert log keeps the payload without its secret.
    const ev = await prisma.tradingWebhookEvent.findFirst({ where: { webhook: { userId: me.id } } });
    expect(JSON.stringify(ev?.payload ?? {})).not.toContain('wrong-secret-value');
  }, 120_000);
});
