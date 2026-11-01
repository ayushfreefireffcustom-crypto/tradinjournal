// Telegram alerts (C6.2): linking through the webhook and delivery, against the
// local test DB with a fake Telegram. Nothing here talks to Telegram.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTelegramSend, tgEscape } from '../../../lib/telegram.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

describe('Telegram client', () => {
  const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('maps Telegram replies to sent / gone / failed', async () => {
    expect(await makeTelegramSend('t', fakeFetch(200, { ok: true }))('1', 'x')).toBe('sent');
    expect(await makeTelegramSend('t', fakeFetch(403, { description: 'Forbidden: bot was blocked by the user' }))('1', 'x')).toBe('gone');
    expect(await makeTelegramSend('t', fakeFetch(400, { description: 'Bad Request: chat not found' }))('1', 'x')).toBe('gone');
    expect(await makeTelegramSend('t', fakeFetch(400, { description: "Bad Request: can't parse entities" }))('1', 'x')).toBe('failed');
    expect(await makeTelegramSend('t', fakeFetch(429, { description: 'Too Many Requests' }))('1', 'x')).toBe('failed');
    expect(await makeTelegramSend('t', (async () => { throw new Error('net'); }) as unknown as typeof fetch)('1', 'x')).toBe('failed');
  });

  it('sends HTML with previews off to the bot URL', async () => {
    let seen: { url: string; body: Record<string, unknown> } | null = null;
    const f = (async (url: string, init: { body: string }) => { seen = { url, body: JSON.parse(init.body) }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await makeTelegramSend('TOKEN', f)('42', '<b>hi</b>');
    expect(seen!.url).toBe('https://api.telegram.org/botTOKEN/sendMessage');
    expect(seen!.body).toMatchObject({ chat_id: '42', text: '<b>hi</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  it('escapes the three characters Telegram HTML needs', () => {
    expect(tgEscape('a<b>&c "d"')).toBe('a&lt;b&gt;&amp;c "d"');
  });
});

describe.skipIf(!local)('Telegram linking and delivery', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../telegram.service.js');
  const tag = `tg${Date.now()}`;
  const sent: Array<{ chatId: string; text: string }> = [];
  let result: 'sent' | 'gone' | 'failed' = 'sent';
  const deps = { send: async (chatId: string, text: string) => (sent.push({ chatId, text }), result), botUsername: 'TradelogsTestBot' };
  const off = { send: null, botUsername: null };
  const ids: Record<string, string> = {};
  const chatA = `${Date.now()}1`;
  const chatB = `${Date.now()}2`;
  const msg = (chatId: string, text: string, type = 'private') => ({ message: { text, chat: { id: chatId, type }, from: { username: 'trader_x' } } });
  const codeFrom = (url: string) => new URL(url).searchParams.get('start')!;
  const mine = () => sent.filter((s) => s.chatId === chatA || s.chatId === chatB);

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../telegram.service.js');
    for (const n of ['a', 'b']) ids[n] = (await prisma.user.create({ data: { name: n, email: `${tag}-${n}@trading.test` } })).id;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('is hidden and refuses links when no bot is configured', async () => {
    expect(await svc.telegramStatus(ids.a!, off)).toEqual({ available: false, linked: false, username: null, linkedAt: null });
    expect(await svc.createTelegramLink(ids.a!, new Date(), off)).toBeNull();
    expect(await svc.dispatchTelegram(new Date(), off)).toEqual({ sent: 0, dropped: 0 });
  });

  it('links a chat with /start <code>, once, and only before the code expires', async () => {
    const now = new Date();
    const link = (await svc.createTelegramLink(ids.a!, now, deps))!;
    expect(link.url).toMatch(/^https:\/\/t\.me\/TradelogsTestBot\?start=[A-Za-z0-9_-]{20,}$/);
    // A second request replaces the first code.
    const link2 = (await svc.createTelegramLink(ids.a!, now, deps))!;
    expect(await svc.handleTelegramUpdate(msg(chatA, `/start ${codeFrom(link.url)}`), now, deps)).toBe('expired');
    expect(await svc.handleTelegramUpdate(msg(chatA, `/start ${codeFrom(link2.url)}`), now, deps)).toBe('linked');
    expect(await svc.telegramStatus(ids.a!, deps)).toMatchObject({ available: true, linked: true, username: 'trader_x' });
    // Used codes don't work twice.
    expect(await svc.handleTelegramUpdate(msg(chatB, `/start ${codeFrom(link2.url)}`), now, deps)).toBe('expired');
    // Expired codes don't work.
    const late = (await svc.createTelegramLink(ids.b!, now, deps))!;
    expect(await svc.handleTelegramUpdate(msg(chatB, `/start ${codeFrom(late.url)}`), new Date(now.getTime() + 16 * 60_000), deps)).toBe('expired');
    expect((await svc.telegramStatus(ids.b!, deps)).linked).toBe(false);
    expect(mine().some((s) => s.chatId === chatA && s.text.includes('Connected'))).toBe(true);
  });

  it('ignores group chats and replies with help to anything else', async () => {
    const link = (await svc.createTelegramLink(ids.b!, new Date(), deps))!;
    expect(await svc.handleTelegramUpdate(msg(chatB, `/start ${codeFrom(link.url)}`, 'group'), new Date(), deps)).toBe('ignored');
    expect((await svc.telegramStatus(ids.b!, deps)).linked).toBe(false);
    expect(await svc.handleTelegramUpdate(msg(chatB, 'hello'), new Date(), deps)).toBe('help');
    expect(await svc.handleTelegramUpdate({}, new Date(), deps)).toBe('ignored');
  });

  it('moves a chat to whoever links it last, keeping one chat per user', async () => {
    const link = (await svc.createTelegramLink(ids.b!, new Date(), deps))!;
    expect(await svc.handleTelegramUpdate(msg(chatA, `/start ${codeFrom(link.url)}`), new Date(), deps)).toBe('linked');
    expect((await svc.telegramStatus(ids.a!, deps)).linked).toBe(false);
    expect((await svc.telegramStatus(ids.b!, deps)).linked).toBe(true);
    // Back to A for the delivery tests.
    const back = (await svc.createTelegramLink(ids.a!, new Date(), deps))!;
    await svc.handleTelegramUpdate(msg(chatA, `/start ${codeFrom(back.url)}`), new Date(), deps);
    expect(await prisma.telegramLink.count({ where: { userId: { in: [ids.a!, ids.b!] } } })).toBe(1);
  });

  it('delivers new notifications once, respects the group switch, and skips the backlog', async () => {
    const linkedAt = (await prisma.telegramLink.findUniqueOrThrow({ where: { userId: ids.a! } })).linkedAt;
    await prisma.notification.create({ data: { userId: ids.a!, kind: 'copy.loss_limit', title: `${tag} before`, createdAt: new Date(linkedAt.getTime() - 60_000) } });
    await prisma.notification.create({ data: { userId: ids.a!, kind: 'copy.loss_limit', title: `${tag} risk <now>`, body: 'Limit & stop', href: '/copy/following/x' } });
    await prisma.notification.create({ data: { userId: ids.a!, kind: 'event_reminder', title: `${tag} news` } });
    await prisma.notification.create({ data: { userId: ids.a!, kind: 'copy.rejected', title: `${tag} archived`, archivedAt: new Date() } });
    await prisma.notificationPreference.create({ data: { userId: ids.a!, groups: { news: { telegram: false } } } });
    sent.length = 0;
    expect((await svc.dispatchTelegram(new Date(), deps)).sent).toBe(1);
    expect(mine().map((s) => s.chatId)).toEqual([chatA]);
    expect(mine()[0]!.text).toContain(`<b>${tag} risk &lt;now&gt;</b>\nLimit &amp; stop`);
    expect(mine()[0]!.text).toMatch(/<a href="https?:\/\/[^"]+\/copy\/following\/x">Open in TRADElogs<\/a>$/);
    // Again: nothing new.
    await svc.dispatchTelegram(new Date(), deps);
    expect(mine().length).toBe(1);
  });

  it('drops the link when the user blocked the bot', async () => {
    await prisma.notification.create({ data: { userId: ids.a!, kind: 'exchange.invalid', title: `${tag} key` } });
    result = 'gone';
    expect(await svc.dispatchTelegram(new Date(), deps)).toMatchObject({ dropped: 1 });
    expect((await svc.telegramStatus(ids.a!, deps)).linked).toBe(false);
    result = 'sent';
  });

  it('/stop disconnects the chat', async () => {
    const link = (await svc.createTelegramLink(ids.a!, new Date(), deps))!;
    await svc.handleTelegramUpdate(msg(chatA, `/start ${codeFrom(link.url)}`), new Date(), deps);
    expect(await svc.handleTelegramUpdate(msg(chatA, '/stop'), new Date(), deps)).toBe('stopped');
    expect((await svc.telegramStatus(ids.a!, deps)).linked).toBe(false);
  });

  it('checks the webhook secret in constant time and rejects anything else', () => {
    const secret = 'a-long-webhook-secret-123';
    expect(svc.webhookSecretOk(secret, secret)).toBe(true);
    expect(svc.webhookSecretOk('a-long-webhook-secret-124', secret)).toBe(false);
    expect(svc.webhookSecretOk('short', secret)).toBe(false);
    expect(svc.webhookSecretOk(undefined, secret)).toBe(false);
    expect(svc.webhookSecretOk(secret, undefined)).toBe(false);
  });
});
