// POST /api/hooks/tv/:token over HTTP: real app, local test DB. No exchange
// call happens: every request here is refused before an order is built.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `tvhttp${Date.now()}`;

async function serve(on: boolean) {
  vi.resetModules();
  Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: on ? 'true' : 'false' });
  delete process.env.TRADINGVIEW_IP_ALLOWLIST; // TradingView's real IPs
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

describe.skipIf(!local)('TradingView hook endpoint over HTTP', () => {
  let prisma: typeof import('@tradinjournal/db').prisma | null = null;
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('does not exist while trading is off', async () => {
    const s = await serve(false);
    try {
      expect((await fetch(`${s.base}/api/hooks/tv/abcdefghijklmnop`, { method: 'POST', body: '{}' })).status).toBe(404);
    } finally {
      await s.close();
    }
  });

  it('checks the token, reads text bodies, and takes the IP from the last proxy hop', async () => {
    const s = await serve(true);
    try {
      ({ prisma } = await import('@tradinjournal/db'));
      const { encryptWithKey } = await import('@tradinjournal/secrets');
      const { setupWebhook } = await import('../webhook.service.js');
      const u = await prisma.user.create({ data: { name: 'tv', email: `${tag}@trading.test` } });
      const key = Buffer.alloc(32, 1);
      const c = await prisma.exchangeConnection.create({ data: { userId: u.id, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'TV', apiKeyEnc: encryptWithKey('k', key), apiSecretEnc: encryptWithKey('s', key), keyLast4: 'abcd', keyFingerprint: `${tag}-c`, canTrade: true } });
      const w = await setupWebhook(u.id, { connectionId: c.id });
      const url = `${s.base}/api/hooks/tv/${w.url.split('/').pop()}`;
      const post = (body: string, headers: Record<string, string>) => fetch(url, { method: 'POST', headers, body });

      expect((await fetch(`${s.base}/api/hooks/tv/bad!token`, { method: 'POST', body: '{}' })).status).toBe(404);
      expect((await fetch(`${s.base}/api/hooks/tv/unknowntoken123456`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404);

      // A forged first hop doesn't help: the last hop (added by our proxy) is the one checked.
      const forged = await post(JSON.stringify({ secret: 'x' }), { 'content-type': 'application/json', 'x-forwarded-for': '52.89.214.238, 9.9.9.9' });
      expect(forged.status).toBe(403);
      // From TradingView's address, in plain text: gets past the IP check to the secret check.
      const plain = await post(JSON.stringify({ secret: 'wrong', action: 'buy', symbol: 'BTCUSD', qty: 1 }), { 'content-type': 'text/plain; charset=utf-8', 'x-forwarded-for': '9.9.9.9, 52.89.214.238' });
      expect(plain.status).toBe(401);
      expect(await plain.json()).toMatchObject({ ok: false, status: 'rejected' });
      // Garbage text is a clean 400, not a server error.
      expect((await post('hello', { 'content-type': 'text/plain', 'x-forwarded-for': '52.89.214.238' })).status).toBe(400);
      // Too big for the endpoint.
      expect((await post('x'.repeat(20_000), { 'content-type': 'text/plain', 'x-forwarded-for': '52.89.214.238' })).status).toBe(413);

      const log = await prisma.tradingWebhookEvent.findMany({ where: { webhookId: (await prisma.tradingWebhook.findUniqueOrThrow({ where: { userId: u.id } })).id }, orderBy: { receivedAt: 'asc' } });
      expect(log.map((e) => [e.status, e.ip])).toEqual([['rejected', '9.9.9.9'], ['rejected', '52.89.214.238'], ['rejected', '52.89.214.238']]);
    } finally {
      await s.close();
    }
  });
});
