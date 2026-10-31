// Trading notifications to push and email, against the local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

describe.skipIf(!local)('copy notifications to push and email', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../copy-notify.service.js');
  const tag = `cnot${Date.now()}`;
  const ids: Record<string, string> = {};
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const pushes: Array<{ endpoint: string; title: string; url?: string }> = [];
  let pushResult: 'sent' | 'gone' = 'sent';
  const deps = {
    sendEmail: async (a: { to: string; subject: string; html: string }) => void emails.push(a),
    sendPush: async (t: { endpoint: string }, p: { title: string; url?: string }) => (pushes.push({ endpoint: t.endpoint, ...p }), pushResult),
  } as unknown as import('../copy-notify.service.js').NotifyDeps;
  const note = (userId: string, kind: string, over: Record<string, unknown> = {}) =>
    prisma.notification.create({ data: { userId, kind, title: `${tag} ${kind}`, body: 'Body <b>with</b> html & stuff', href: '/copy/following/x', ...over } });
  // Only this file's notifications count; the shared test DB has others.
  const mine = () => ({ email: emails.filter((e) => e.subject.startsWith(tag)), push: pushes.filter((p) => p.title.startsWith(tag)) });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../copy-notify.service.js');
    for (const [n, email, push] of [['both', true, true], ['email', true, false], ['none', false, false], ['noprefs', null, null]] as const) {
      const u = await prisma.user.create({ data: { name: n, email: `${tag}-${n}@trading.test` } });
      ids[n] = u.id;
      if (email !== null) await prisma.notificationPreference.create({ data: { userId: u.id, email, push } });
    }
    await prisma.pushSubscription.create({ data: { userId: ids.both!, endpoint: `https://push.test/${tag}/1`, p256dh: 'k', auth: 'a' } });
    await prisma.pushSubscription.create({ data: { userId: ids.email!, endpoint: `https://push.test/${tag}/2`, p256dh: 'k', auth: 'a' } });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('sends risk events by push and email to users who turned them on, once', async () => {
    for (const n of ['both', 'email', 'none', 'noprefs']) await note(ids[n]!, 'copy.loss_limit');
    await svc.dispatchCopyNotifications(new Date(), deps);
    const m = mine();
    expect(m.email.map((e) => e.to).sort()).toEqual([`${tag}-both@trading.test`, `${tag}-email@trading.test`]);
    // Push only for the user with push on, even though the other has a subscription.
    expect(m.push.map((p) => p.endpoint)).toEqual([`https://push.test/${tag}/1`]);
    expect(m.push[0]!.url).toBe('/copy/following/x');
    // HTML in the text is escaped, and the link goes to the app.
    expect(m.email[0]!.html).toContain('Body &lt;b&gt;with&lt;/b&gt; html &amp; stuff');
    expect(m.email[0]!.html).toContain('/copy/following/x');
    // A second run (retry, or another API instance) sends nothing more.
    await svc.dispatchCopyNotifications(new Date(), deps);
    expect(mine().email.length).toBe(2);
    expect(mine().push.length).toBe(1);
  });

  it('pushes routine events but emails only the ones that matter', async () => {
    await note(ids.both!, 'copy.leader_resumed');
    await svc.dispatchCopyNotifications(new Date(), deps);
    expect(mine().push.length).toBe(2);
    expect(mine().email.length).toBe(2);
    expect(svc.EMAIL_KINDS.has('copy.leader_resumed')).toBe(false);
    expect(svc.EMAIL_KINDS.has('exchange.invalid')).toBe(true);
  });

  it('ignores non-trading notifications and an old backlog', async () => {
    await note(ids.both!, 'event_reminder');
    await note(ids.both!, 'copy.rejected', { createdAt: new Date(Date.now() - 3 * 3600_000) });
    await svc.dispatchCopyNotifications(new Date(), deps);
    expect(mine().push.length).toBe(2);
    expect(mine().email.length).toBe(2);
  });

  it('drops a push subscription the browser no longer accepts', async () => {
    pushResult = 'gone';
    await note(ids.both!, 'exchange.invalid');
    await svc.dispatchCopyNotifications(new Date(), deps);
    expect(await prisma.pushSubscription.count({ where: { userId: ids.both } })).toBe(0);
    // The email for it still went out.
    expect(mine().email.some((e) => e.subject.endsWith('exchange.invalid'))).toBe(true);
    pushResult = 'sent';
  });
});
