import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventImpact } from '@tradinjournal/contracts';

// The dispatch service is the trickiest new logic: which (user, event) pairs are
// due, across which channels, exactly once. Everything it touches is mocked so
// each case controls the world precisely.

const prisma = {
  economicEvent: { findMany: vi.fn() },
  eventWatch: { findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  notificationDelivery: { create: vi.fn() },
  notification: { create: vi.fn() },
};
const sendEmail = vi.fn();
const sendPush = vi.fn();

vi.mock('@tradinjournal/db', () => ({ prisma }));
vi.mock('@tradinjournal/config', () => ({ env: { APP_URL: 'https://app.example.com' } }));
vi.mock('../../../lib/email/client.js', () => ({ sendEmail }));
vi.mock('../../../lib/push.js', () => ({ sendPush }));

const { dispatchReminders } = await import('../dispatch.service.js');

function event(p: { id?: string; impact?: EventImpact; currency?: string; category?: string | null; inMinutes?: number }) {
  return {
    id: p.id ?? 'e1',
    title: 'Non-Farm Payrolls',
    currency: p.currency ?? 'USD',
    country: 'US',
    category: p.category ?? null,
    impact: p.impact ?? 'HIGH',
    eventTime: new Date(Date.now() + (p.inMinutes ?? 10) * 60_000),
    forecast: '160K',
    previous: '206K',
  };
}
function pref(p: Partial<{ userId: string; inApp: boolean; email: boolean; push: boolean; minImpact: EventImpact; currencies: string[]; categories: string[]; leadMinutes: number }>) {
  return {
    userId: p.userId ?? 'u1', inApp: p.inApp ?? true, email: p.email ?? false, push: p.push ?? false,
    minImpact: p.minImpact ?? 'HIGH', currencies: p.currencies ?? [], categories: p.categories ?? [],
    leadMinutes: p.leadMinutes ?? 15, timezone: 'UTC',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.eventWatch.findMany.mockResolvedValue([]);
  prisma.notificationPreference.findMany.mockResolvedValue([]);
  prisma.user.findMany.mockResolvedValue([]);
  prisma.pushSubscription.findMany.mockResolvedValue([]);
  prisma.notification.create.mockResolvedValue({});
  prisma.notificationDelivery.create.mockResolvedValue({}); // claim succeeds by default
  sendEmail.mockResolvedValue(undefined);
  sendPush.mockResolvedValue('sent');
});

describe('dispatchReminders', () => {
  it('does nothing when there are no upcoming events', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([]);
    const out = await dispatchReminders();
    expect(out).toEqual({ events: 0, delivered: 0 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('delivers an in-app reminder for a matching event inside the lead window', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: 10 })]); // lead 15 → due
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    const out = await dispatchReminders();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(out.delivered).toBe(1);
  });

  it('does NOT deliver before the lead window opens', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: 30 })]); // lead 15 → not due yet
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    const out = await dispatchReminders();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(out.delivered).toBe(0);
  });

  it('respects the minimum-impact threshold', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ impact: 'MEDIUM', inMinutes: 10 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ minImpact: 'HIGH' })]);
    await dispatchReminders();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('respects the currency filter', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ currency: 'USD', inMinutes: 10 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ currencies: ['EUR'] })]);
    await dispatchReminders();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('reminds a WATCHED low-impact event even when it fails the impact filter', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ impact: 'LOW', inMinutes: 10 })]);
    prisma.eventWatch.findMany.mockResolvedValue([{ eventId: 'e1', userId: 'u1' }]);
    // no preference row → defaults (inApp on, lead 15)
    const out = await dispatchReminders();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(out.delivered).toBe(1);
  });

  it('is idempotent — a claimed (event,user,channel) is never delivered twice', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: 10 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    prisma.notificationDelivery.create.mockRejectedValue(new Error('unique violation')); // already delivered
    const out = await dispatchReminders();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(out.delivered).toBe(0);
  });

  it('sends email on the email channel and stamps the ledger per-channel', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: 10 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ inApp: false, email: true })]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Ayush', email: 'a@example.com' }]);
    await dispatchReminders();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toBe('a@example.com');
  });

  it('prunes a dead push endpoint reported gone', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: 10 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ inApp: false, push: true })]);
    prisma.pushSubscription.findMany.mockResolvedValue([{ userId: 'u1', endpoint: 'https://push/x', p256dh: 'p', auth: 'a' }]);
    sendPush.mockResolvedValue('gone');
    await dispatchReminders();
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { endpoint: 'https://push/x' } });
  });

  it('does not remind for an event that already started', async () => {
    prisma.economicEvent.findMany.mockResolvedValue([event({ inMinutes: -5 })]); // in the past
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    await dispatchReminders();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
