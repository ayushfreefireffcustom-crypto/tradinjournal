// Telegram over HTTP: the webhook exists only with a bot configured and needs
// the secret header; the settings routes need sign-in. Real app, local test DB.
// The only webhook update sent is one the bot ignores, so nothing calls Telegram.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `tghttp${Date.now()}`;
const SECRET = 'test-webhook-secret-0123456789';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (r: Response) => (await r.json()) as { data: any };

async function serve(telegram: boolean) {
  vi.resetModules();
  Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
  for (const [k, v] of Object.entries({ TELEGRAM_BOT_TOKEN: '123:fake', TELEGRAM_BOT_USERNAME: 'TradelogsTestBot', TELEGRAM_WEBHOOK_SECRET: SECRET })) {
    if (telegram) process.env[k] = v;
    else delete process.env[k];
  }
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

describe.skipIf(!local)('Telegram over HTTP', () => {
  let prisma: typeof import('@tradinjournal/db').prisma | null = null;
  afterAll(async () => {
    for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET']) delete process.env[k];
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  async function signIn(email: string) {
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const u = await prisma!.user.create({ data: { email, name: 'tg', emailVerified: true } });
    await prisma!.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Telegram-http-pass-123') } });
    const r = await auth.api.signInEmail({ body: { email, password: 'Telegram-http-pass-123' }, returnHeaders: true });
    return r.headers.get('set-cookie')!.split(';')[0]!;
  }
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';

  it('has no webhook and offers nothing when no bot is configured', async () => {
    const s = await serve(false);
    try {
      const cookie = await signIn(`${tag}-off@trading.test`);
      const hook = await fetch(`${s.base}/api/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET }, body: '{}' });
      expect(hook.status).toBe(404);
      const st = await fetch(`${s.base}/api/notifications/telegram`, { headers: { cookie } });
      expect((await body(st)).data).toMatchObject({ available: false, linked: false });
      const link = await fetch(`${s.base}/api/notifications/telegram/link`, { method: 'POST', headers: { cookie, origin: origin() } });
      expect(link.status).toBe(404);
    } finally {
      await s.close();
    }
  });

  it('checks the webhook secret and gives signed-in users a one-time link', async () => {
    const s = await serve(true);
    try {
      const post = (secret: string | null, body: unknown) => fetch(`${s.base}/api/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: JSON.stringify(body) });
      expect((await post(null, {})).status).toBe(401);
      expect((await post('wrong-secret-wrong-secret-00', {})).status).toBe(401);
      // A group-chat message is ignored without replying, so no call leaves the machine.
      expect((await post(SECRET, { message: { text: '/start x', chat: { id: 1, type: 'group' } } })).status).toBe(200);
      expect((await post(SECRET, { update_id: 1 })).status).toBe(200);
      // Malformed JSON is the sender's error, not a server failure.
      expect((await post(SECRET, 'not even an object')).status).toBe(400);

      for (const [m, p] of [['GET', '/api/notifications/telegram'], ['POST', '/api/notifications/telegram/link'], ['DELETE', '/api/notifications/telegram']] as const) {
        expect((await fetch(`${s.base}${p}`, { method: m, headers: { origin: origin() } })).status, `${m} ${p}`).toBe(401);
      }
      const cookie = await signIn(`${tag}-on@trading.test`);
      const link = await fetch(`${s.base}/api/notifications/telegram/link`, { method: 'POST', headers: { cookie, origin: origin() } });
      expect(link.status).toBe(200);
      const { data } = await body(link);
      expect(data.url).toMatch(/^https:\/\/t\.me\/TradelogsTestBot\?start=/);
      expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      // A cross-site page can't make a signed-in browser create one.
      expect((await fetch(`${s.base}/api/notifications/telegram/link`, { method: 'POST', headers: { cookie, origin: 'https://evil.example' } })).status).toBe(403);
      expect((await body(await fetch(`${s.base}/api/notifications/telegram`, { headers: { cookie } }))).data).toMatchObject({ available: true, linked: false });
      expect((await fetch(`${s.base}/api/notifications/telegram`, { method: 'DELETE', headers: { cookie, origin: origin() } })).status).toBe(200);
    } finally {
      await s.close();
    }
  });
});
