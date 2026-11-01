// Notification inbox (C6.5) and per-group preferences (C6.6), against the local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliveryAllowed, notificationGroupOf, notificationGroups, inboxQuerySchema } from '@tradinjournal/contracts';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

describe('notification groups', () => {
  it('puts every known kind in the right group and unknown kinds in System', () => {
    expect(notificationGroupOf('copy.rejected')).toBe('trades');
    expect(notificationGroupOf('copy.open_trades')).toBe('trades');
    expect(notificationGroupOf('copy.loss_limit')).toBe('risk');
    expect(notificationGroupOf('exchange.invalid')).toBe('risk');
    expect(notificationGroupOf('exchange.something_new')).toBe('risk');
    expect(notificationGroupOf('strategy_signal')).toBe('ai');
    expect(notificationGroupOf('event_reminder')).toBe('news');
    expect(notificationGroupOf('price_alert')).toBe('news');
    expect(notificationGroupOf('copy.leader_approved')).toBe('system');
    expect(notificationGroupOf('copy.leader_applied')).toBe('system');
    expect(notificationGroupOf('totally_new')).toBe('system');
  });

  it('lets a group override switch a channel off but never on', () => {
    expect(deliveryAllowed('copy.loss_limit', 'email', true, {})).toBe(true);
    expect(deliveryAllowed('copy.loss_limit', 'email', true, { risk: { email: false } })).toBe(false);
    expect(deliveryAllowed('copy.loss_limit', 'push', true, { risk: { email: false } })).toBe(true);
    // Global off wins over a group on.
    expect(deliveryAllowed('copy.loss_limit', 'email', false, { risk: { email: true } })).toBe(false);
    // Garbage in the column fails open to the global switch, not closed.
    expect(deliveryAllowed('copy.loss_limit', 'email', true, 'nonsense')).toBe(true);
    expect(deliveryAllowed('copy.loss_limit', 'email', true, null)).toBe(true);
  });
});

describe.skipIf(!local)('notification inbox', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../notifications.service.js');
  const tag = `inbx${Date.now()}`;
  let me = '';
  let other = '';
  const q = (over: Record<string, unknown> = {}) => inboxQuerySchema.parse(over);
  const t0 = Date.now() - 3600_000;

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../notifications.service.js');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    other = (await prisma.user.create({ data: { name: 'other', email: `${tag}-o@trading.test` } })).id;
    const kinds = ['copy.rejected', 'copy.rejected', 'copy.loss_limit', 'exchange.invalid', 'strategy_signal', 'event_reminder', 'price_alert', 'copy.leader_approved', 'mystery'];
    // Distinct, increasing timestamps so the order is deterministic.
    await prisma.notification.createMany({ data: kinds.map((kind, i) => ({ userId: me, kind, title: `${tag} ${i} ${kind}`, createdAt: new Date(t0 + i * 1000) })) });
    await prisma.notification.create({ data: { userId: other, kind: 'copy.rejected', title: `${tag} other` } });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('counts unread and total per group, only for this user', async () => {
    const r = await svc.listInbox(me, q());
    expect(r.total).toEqual({ trades: 2, risk: 2, ai: 1, news: 2, reports: 0, system: 2 });
    expect(r.unread).toEqual(r.total);
    expect(r.items.map((i) => i.title.split(' ')[1])).toEqual(['8', '7', '6', '5', '4', '3', '2', '1', '0']);
    expect(r.items.every((i) => i.group === notificationGroupOf(i.kind))).toBe(true);
    expect(r.nextCursor).toBeNull();
  });

  it('filters one group in SQL, including System as everything else', async () => {
    for (const g of notificationGroups) {
      const r = await svc.listInbox(me, q({ group: g }));
      expect(r.items.every((i) => i.group === g), g).toBe(true);
      expect(r.items.length, g).toBe(r.total[g]);
    }
    expect((await svc.listInbox(me, q({ group: 'system' }))).items.map((i) => i.kind).sort()).toEqual(['copy.leader_approved', 'mystery']);
  });

  it('pages with a cursor without gaps or repeats', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const r = await svc.listInbox(me, q({ limit: 4, ...(cursor ? { cursor } : {}) }));
      seen.push(...r.items.map((x) => x.id));
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    expect(seen.length).toBe(9);
    expect(new Set(seen).size).toBe(9);
  });

  it('marks one group read, then archives and restores', async () => {
    expect((await svc.inboxAction(me, { action: 'read', group: 'trades' })).updated).toBe(2);
    let r = await svc.listInbox(me, q({ status: 'unread' }));
    expect(r.unread.trades).toBe(0);
    expect(r.unread.risk).toBe(2);
    expect(r.items.some((i) => i.group === 'trades')).toBe(false);

    const ids = (await svc.listInbox(me, q({ group: 'news' }))).items.map((i) => i.id);
    expect((await svc.inboxAction(me, { action: 'archive', ids })).updated).toBe(2);
    r = await svc.listInbox(me, q());
    expect(r.total.news).toBe(0);
    expect(r.unread.news).toBe(0);
    expect(r.items.length).toBe(7);
    const arch = await svc.listInbox(me, q({ status: 'archived' }));
    expect(arch.items.map((i) => i.id).sort()).toEqual([...ids].sort());
    expect(arch.items.every((i) => i.archived && !i.read)).toBe(true);
    // The bell ignores archived ones too.
    expect((await svc.listNotifications(me)).items.some((i) => ids.includes(i.id))).toBe(false);

    expect((await svc.inboxAction(me, { action: 'unarchive', ids })).updated).toBe(2);
    expect((await svc.listInbox(me, q())).total.news).toBe(2);
  });

  it("can't touch another user's notifications by id", async () => {
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: other } });
    expect((await svc.inboxAction(me, { action: 'archive', ids: [theirs.id] })).updated).toBe(0);
    expect((await svc.inboxAction(me, { action: 'read', ids: [theirs.id] })).updated).toBe(0);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(after.archivedAt).toBeNull();
    expect(after.readAt).toBeNull();
  });

  it('archives everything with no ids, and read-all leaves other users alone', async () => {
    await svc.inboxAction(me, { action: 'read' });
    expect(Object.values((await svc.listInbox(me, q())).unread).every((n) => n === 0)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: other, readAt: null } })).toBe(1);
    await svc.inboxAction(me, { action: 'archive' });
    expect((await svc.listInbox(me, q())).items.length).toBe(0);
    expect((await svc.listInbox(me, q({ status: 'archived' }))).items.length).toBe(9);
  });

  it('merges per-group preferences instead of replacing them', async () => {
    expect((await svc.getPreferences(me)).groups).toEqual({});
    await svc.setPreferences(me, { groups: { news: { push: false } } });
    await svc.setPreferences(me, { groups: { risk: { email: false } } });
    await svc.setPreferences(me, { groups: { news: { email: false } } });
    expect((await svc.getPreferences(me)).groups).toEqual({ news: { push: false, email: false }, risk: { email: false } });
    // Other fields stay put.
    await svc.setPreferences(me, { push: true });
    expect((await svc.getPreferences(me)).groups.risk).toEqual({ email: false });
  });
});
