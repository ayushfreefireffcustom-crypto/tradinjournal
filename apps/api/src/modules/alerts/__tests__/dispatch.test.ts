import { describe, it, expect, vi, beforeEach } from 'vitest';

// dispatchPriceAlerts is the trickiest logic: fire only on a genuine threshold
// cross, exactly once, one price fetch per symbol group. Everything it touches
// is mocked so each case controls the world precisely.
const prisma = {
  priceAlert: { findMany: vi.fn(), update: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
  notificationDelivery: { create: vi.fn() },
  notification: { create: vi.fn() },
};
const getLatestPrice = vi.fn();
const sendPush = vi.fn();

vi.mock('@tradinjournal/db', () => ({ prisma }));
vi.mock('../../market/market.service.js', () => ({ getLatestPrice }));
vi.mock('../../../lib/push.js', () => ({ sendPush }));

const { dispatchPriceAlerts } = await import('../alerts.service.js');

type AlertOv = Partial<{
  id: string; userId: string; symbol: string; accountId: string | null;
  direction: 'above' | 'below'; threshold: number; lastPrice: number | null;
  status: string; recurring: boolean; fireSeq: number;
}>;
function alert(o: AlertOv = {}) {
  return {
    id: o.id ?? 'a1', userId: o.userId ?? 'u1', symbol: o.symbol ?? 'BTCUSDT',
    accountId: o.accountId ?? null, direction: o.direction ?? 'above',
    threshold: o.threshold ?? 70000, lastPrice: o.lastPrice ?? null,
    status: o.status ?? 'active', recurring: o.recurring ?? false, fireSeq: o.fireSeq ?? 0,
  };
}
function pref(o: Partial<{ userId: string; inApp: boolean; push: boolean; priceAlerts: boolean }> = {}) {
  return { userId: o.userId ?? 'u1', inApp: o.inApp ?? true, push: o.push ?? false, priceAlerts: o.priceAlerts ?? true };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.notificationPreference.findMany.mockResolvedValue([pref({})]);
  prisma.pushSubscription.findMany.mockResolvedValue([]);
  prisma.notificationDelivery.create.mockResolvedValue({}); // claim succeeds by default
  prisma.notification.create.mockResolvedValue({});
  prisma.priceAlert.update.mockResolvedValue({});
});

describe('dispatchPriceAlerts — cross detection', () => {
  it('fires when price crosses ABOVE the threshold', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ direction: 'above', threshold: 70000, lastPrice: 69000 })]);
    getLatestPrice.mockResolvedValue(71000);

    const res = await dispatchPriceAlerts();

    expect(res.fired).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0]![0].data.kind).toBe('price_alert');
    // one-shot → marked triggered
    expect(prisma.priceAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'triggered' }) }));
  });

  it('fires when price crosses BELOW the threshold', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ direction: 'below', threshold: 70000, lastPrice: 71000 })]);
    getLatestPrice.mockResolvedValue(69000);
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(1);
  });

  it('does NOT fire when already past the threshold at creation (armed)', async () => {
    // "above 70k" created while price is 72k → lastPrice seeded above → no cross.
    prisma.priceAlert.findMany.mockResolvedValue([alert({ direction: 'above', threshold: 70000, lastPrice: 72000 })]);
    getLatestPrice.mockResolvedValue(73000);
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does NOT fire on the same side (no cross)', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ direction: 'above', threshold: 70000, lastPrice: 68000 })]);
    getLatestPrice.mockResolvedValue(69000); // still below
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(0);
  });

  it('recurring alert re-arms (fireSeq++) instead of triggering', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ recurring: true, threshold: 70000, lastPrice: 69000 })]);
    getLatestPrice.mockResolvedValue(71000);
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(1);
    expect(prisma.priceAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fireSeq: { increment: 1 } }) }));
  });

  it('is idempotent — a claimed delivery does not re-notify', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ threshold: 70000, lastPrice: 69000 })]);
    getLatestPrice.mockResolvedValue(71000);
    prisma.notificationDelivery.create.mockRejectedValue(new Error('unique')); // already delivered
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('respects the priceAlerts preference (off → no delivery)', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ threshold: 70000, lastPrice: 69000 })]);
    prisma.notificationPreference.findMany.mockResolvedValue([pref({ priceAlerts: false })]);
    getLatestPrice.mockResolvedValue(71000);
    const res = await dispatchPriceAlerts();
    expect(res.fired).toBe(0);
  });

  it('fetches the price ONCE per (symbol, account) group', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([
      alert({ id: 'a1', threshold: 70000, lastPrice: 69000 }),
      alert({ id: 'a2', threshold: 71000, lastPrice: 69000 }),
    ]);
    getLatestPrice.mockResolvedValue(69500);
    await dispatchPriceAlerts();
    expect(getLatestPrice).toHaveBeenCalledTimes(1); // 2 alerts, same symbol → 1 fetch
  });

  it('skips a group when the price is unavailable/stale (null)', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([alert({ threshold: 70000, lastPrice: 69000 })]);
    getLatestPrice.mockResolvedValue(null);
    const res = await dispatchPriceAlerts();
    expect(res.checked).toBe(0);
    expect(res.fired).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
