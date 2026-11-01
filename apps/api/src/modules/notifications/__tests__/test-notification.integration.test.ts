// Settings › Send a test (QW.15) against the local test DB, with fake push and Telegram.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PushPayload, PushTarget } from '../../../lib/push.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) { process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB; }
const tag = `ntest${Date.now()}`;

describe.skipIf(!local)('test notification', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../test-notification.service.js');
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../test-notification.service.js');
    for (const n of ['linked', 'plain']) ids[n] = (await prisma.user.create({ data: { email: `${tag}-${n}@trading.test`, name: n } })).id;
    await prisma.pushSubscription.createMany({ data: [
      { userId: ids.linked!, endpoint: `https://push.test/${tag}/ok`, p256dh: 'k', auth: 'a' },
      { userId: ids.linked!, endpoint: `https://push.test/${tag}/gone`, p256dh: 'k', auth: 'a' },
      { userId: ids.linked!, endpoint: `https://push.test/${tag}/flaky`, p256dh: 'k', auth: 'a' },
    ] });
    await prisma.telegramLink.create({ data: { userId: ids.linked!, chatId: `${tag}-chat` } });
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('pushes to every device, drops dead ones, and messages the linked chat', async () => {
    const pushed: Array<[string, PushPayload]> = [];
    const chats: Array<[string, string]> = [];
    const r = await svc.sendTestNotification(ids.linked!, {
      pushEnabled: () => true,
      sendPush: async (t: PushTarget, p: PushPayload) => { pushed.push([t.endpoint, p]); return t.endpoint.endsWith('/gone') ? 'gone' : t.endpoint.endsWith('/flaky') ? 'failed' : 'sent'; },
      telegram: async (chat, html) => { chats.push([chat, html]); return 'sent'; },
    });
    expect(r).toEqual({ push: { available: true, devices: 3, sent: 1, failed: 1, removed: 1 }, telegram: 'sent' });
    expect(pushed.every(([, p]) => p.test === true && p.title === 'Test notification')).toBe(true);
    expect(chats).toEqual([[`${tag}-chat`, expect.stringContaining('Test notification')]]);
    // The dead endpoint is gone; the others stay.
    expect((await prisma.pushSubscription.findMany({ where: { userId: ids.linked! } })).map((s) => s.endpoint).sort()).toEqual([`https://push.test/${tag}/flaky`, `https://push.test/${tag}/ok`]);
  });

  it('says plainly what didn’t happen', async () => {
    const noPush = { pushEnabled: () => false, sendPush: async () => { throw new Error('must not send'); }, telegram: null };
    expect(await svc.sendTestNotification(ids.plain!, noPush)).toEqual({ push: { available: false, devices: 0, sent: 0, failed: 0, removed: 0 }, telegram: 'off' });
    const tg = { ...noPush, telegram: async () => 'sent' as const };
    expect((await svc.sendTestNotification(ids.plain!, tg)).telegram).toBe('not_linked');
    const tgDown = { ...noPush, telegram: async () => 'failed' as const };
    expect((await svc.sendTestNotification(ids.linked!, tgDown)).telegram).toBe('failed');
  });
});
