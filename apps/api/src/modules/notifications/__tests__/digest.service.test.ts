import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventImpact } from '@tradinjournal/contracts';

// The daily digest compiles each opted-in user's upcoming events into ONE email
// and is idempotent per user per day. Everything it touches is mocked.

const prisma = {
  notificationPreference: { findMany: vi.fn() },
  economicEvent: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  eventWatch: { findMany: vi.fn() },
  priceAlert: { findMany: vi.fn() },
  notificationDelivery: { create: vi.fn() },
};
const sendEmail = vi.fn();

vi.mock('@tradinjournal/db', () => ({ prisma }));
vi.mock('@tradinjournal/config', () => ({ env: { APP_URL: 'https://app.example.com' } }));
vi.mock('../../../lib/email/client.js', () => ({ sendEmail }));

const { sendDailyDigests } = await import('../digest.service.js');

function event(p: { id?: string; impact?: EventImpact; currency?: string; inHours?: number }) {
  return {
    id: p.id ?? 'e1',
    title: 'Non Farm Payrolls',
    currency: p.currency ?? 'USD',
    country: 'US',
    category: null,
    impact: p.impact ?? 'HIGH',
    eventTime: new Date(Date.now() + (p.inHours ?? 3) * 3600_000),
    forecast: '200K',
    previous: '180K',
  };
}
function pref(p: Partial<{ userId: string; minImpact: EventImpact; currencies: string[]; categories: string[] }>) {
  return {
    userId: p.userId ?? 'u1',
    email: true,
    minImpact: p.minImpact ?? 'HIGH',
    currencies: p.currencies ?? [],
    categories: p.categories ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  prisma.notificationDelivery.create.mockResolvedValue({});
  prisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Ayush', email: 'a@example.com' }]);
  prisma.eventWatch.findMany.mockResolvedValue([]);
  prisma.priceAlert.findMany.mockResolvedValue([]);
});

describe('sendDailyDigests', () => {
  it('sends ONE digest email to an opted-in user with relevant events', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    prisma.economicEvent.findMany.mockResolvedValue([event({ impact: 'HIGH' })]);
    const out = await sendDailyDigests();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toBe('a@example.com');
    expect(out.sent).toBe(1);
  });

  it('skips users whose events do not meet their minImpact', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ minImpact: 'HIGH' })]);
    prisma.economicEvent.findMany.mockResolvedValue([event({ impact: 'MEDIUM' })]); // below HIGH
    const out = await sendDailyDigests();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it('still includes an explicitly-watched event below the impact threshold', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ minImpact: 'HIGH' })]);
    prisma.economicEvent.findMany.mockResolvedValue([event({ id: 'e9', impact: 'LOW' })]);
    prisma.eventWatch.findMany.mockResolvedValue([{ eventId: 'e9', userId: 'u1' }]);
    const out = await sendDailyDigests();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(out.sent).toBe(1);
  });

  it('is idempotent — no second digest the same day (ledger claim fails)', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
    prisma.economicEvent.findMany.mockResolvedValue([event({ impact: 'HIGH' })]);
    prisma.notificationDelivery.create.mockRejectedValue(new Error('unique violation'));
    const out = await sendDailyDigests();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it('sends nothing when no users have email on', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    const out = await sendDailyDigests();
    expect(out).toEqual({ users: 0, sent: 0 });
  });
});
