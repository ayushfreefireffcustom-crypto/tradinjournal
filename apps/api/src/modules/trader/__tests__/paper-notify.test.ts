import { describe, expect, it, vi, beforeEach } from 'vitest';

const { claimDelivery, sendEmail, findPref, findUser, create } = vi.hoisted(() => ({
  claimDelivery: vi.fn(async () => true),
  sendEmail: vi.fn(async () => undefined),
  findPref: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(async () => ({})),
}));

vi.mock('../../../lib/notifications/claim.js', () => ({ claimDelivery }));
vi.mock('../../../lib/email/client.js', () => ({ sendEmail }));
vi.mock('@tradinjournal/db', () => ({
  prisma: {
    notificationPreference: { findUnique: findPref },
    user: { findUnique: findUser },
    notification: { create },
  },
}));

import { notifyPaperEvent, paperAlertEmail } from '../paper.notify.js';

const alert = {
  userId: 'u1',
  positionId: 'p1',
  strategyName: 'EMA cross',
  symbol: 'BTCUSDT',
  side: 'LONG' as const,
  entry: 100,
  stop: 95,
  target: 110,
  timeframe: '1h',
  event: 'open' as const,
};

beforeEach(() => {
  claimDelivery.mockClear().mockResolvedValue(true);
  sendEmail.mockClear();
  create.mockClear();
  findPref.mockReset();
  findUser.mockReset();
});

describe('paper alerts', () => {
  it('keeps the educational footer and never says to buy', () => {
    const mail = paperAlertEmail(alert);
    expect(mail.html).toMatch(/Not financial advice/);
    expect(mail.html.toLowerCase()).not.toMatch(/buy now/);
  });

  it('writes the inbox and skips email when the preference is off', async () => {
    findPref.mockResolvedValue({ email: false });
    await notifyPaperEvent(alert);
    expect(create).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(claimDelivery).toHaveBeenCalledWith('u1', 'strategy:p1:open', 'in_app');
    expect(claimDelivery).not.toHaveBeenCalledWith('u1', 'strategy:p1:open', 'email');
  });

  it('emails only after the preference is on', async () => {
    findPref.mockResolvedValue({ email: true });
    findUser.mockResolvedValue({ email: 'a@example.com' });
    await notifyPaperEvent(alert);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const first = sendEmail.mock.calls[0] as [{ to: string }] | undefined;
    expect(first?.[0].to).toBe('a@example.com');
  });
});
