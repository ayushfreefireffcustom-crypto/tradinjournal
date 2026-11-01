// Indicator alerts (E3) against the local test DB, with injected candles and clock.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `inda${Date.now()}`;
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1); // bar 0 opens here

describe.skipIf(!local)('indicator alerts', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../indicator-alerts.service.js');
  let me = '';
  let closes: number[] = [];
  let now = 0;
  const loads: Array<{ symbol: string; tf: string; limit: number }> = [];
  const deps = {
    // The provider's last bar is the one still forming (opens at `now`'s hour).
    loadCandles: async (symbol: string, tf: string, limit: number) => {
      loads.push({ symbol, tf, limit });
      if (symbol === 'NODATA') return [];
      const formingIdx = Math.floor((now - T0) / H);
      return closes.slice(0, formingIdx + 1).map((c, i) => ({ openTime: T0 + i * H, open: c, high: c + 1, low: c - 1, close: c, volume: 1 })).slice(-limit);
    },
    now: () => now,
  };
  /** Move the clock so `n` bars have closed (bar n is forming). */
  const closedThrough = (n: number) => { now = T0 + n * H + 60_000; };
  const run = () => svc.dispatchIndicatorAlerts(deps, { userIds: [me] });
  const price = { kind: 'indicator' as const, id: 'price', output: 'close' };
  const ema5 = { kind: 'indicator' as const, id: 'ema', output: 'value', params: { length: 5 } };
  const value = (v: number) => ({ kind: 'value' as const, value: v });

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../indicator-alerts.service.js');
    me = (await prisma.user.create({ data: { email: `${tag}@trading.test`, name: 'ind', emailVerified: true } })).id;
  });
  beforeEach(async () => {
    await prisma.indicatorAlert.deleteMany({ where: { userId: me } });
    await prisma.notification.deleteMany({ where: { userId: me } });
    now = T0 + 5 * H; // some bars exist when rules are created
    loads.length = 0;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('fires a cross once, on the closed bar where it happens, and never on the forming bar', async () => {
    closes = [...new Array(20).fill(100), 110, 111, 112];
    const a = await svc.createIndicatorAlert(me, { symbol: 'btcusdt', timeframe: '1h', left: price, operator: 'crosses_above', right: ema5 }, deps);
    expect(a.symbol).toBe('BTCUSDT');
    expect(a.description).toBe('Close crosses above EMA(5)');

    // 20 bars closed; bar 20 (the jump) is still forming → no fire.
    closedThrough(20);
    expect(await run()).toMatchObject({ groups: 1, checked: 1, fired: 0 });
    // Same bar again: not even fetched.
    loads.length = 0;
    expect(await run()).toMatchObject({ checked: 0, fired: 0 });
    expect(loads).toHaveLength(0);

    // The jump bar closes → fires.
    closedThrough(21);
    expect(await run()).toMatchObject({ fired: 1 });
    const n = await prisma.notification.findMany({ where: { userId: me } });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'indicator_alert', title: 'BTCUSDT 1h: Close crosses above EMA(5)', href: '/charts?symbol=BTCUSDT&tf=1h' });
    expect(n[0]!.body).toMatch(/^Close crossed above EMA\(5\) \(now 110\.00 vs 103\.\d\d\)$/);
    const f = await svc.recentFirings(me);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ symbol: 'BTCUSDT', leftValue: 110, barTime: new Date(T0 + 20 * H).toISOString() });

    // Still above next bar: a cross is not repeated.
    closedThrough(22);
    expect(await run()).toMatchObject({ checked: 1, fired: 0 });
    const row = await prisma.indicatorAlert.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ fireSeq: 1, status: 'active', lastLeft: 111 });
    expect(row.lastBarTime!.getTime()).toBe(T0 + 21 * H);
  });

  it('fires a level condition when it becomes true, not on every bar it stays true', async () => {
    closes = [100, 99, 98, 97, 96, 99, 97, 96, 95];
    await svc.createIndicatorAlert(me, { symbol: 'ETHUSDT', timeframe: '1h', left: price, operator: 'lt', right: value(98.5), cooldownSec: 0 }, deps);
    closedThrough(1); // only bar 0 (100) closed: false
    expect(await run()).toMatchObject({ fired: 0 });
    closedThrough(3); // bar 2 (98) closed: became true
    expect(await run()).toMatchObject({ fired: 1 });
    closedThrough(4); // 97: still true → quiet
    expect(await run()).toMatchObject({ fired: 0 });
    closedThrough(6); // 99 false
    expect(await run()).toMatchObject({ fired: 0 });
    closedThrough(7); // 97 true again → fires
    expect(await run()).toMatchObject({ fired: 1 });
    expect(await prisma.notification.count({ where: { userId: me } })).toBe(2);
  });

  it('a rule created while the condition already holds fires on its first bar', async () => {
    closes = [50, 40, 30, 20];
    await svc.createIndicatorAlert(me, { symbol: 'SOLUSDT', timeframe: '1h', left: price, operator: 'lt', right: value(45) }, deps);
    closedThrough(3);
    expect(await run()).toMatchObject({ fired: 1 });
  });

  it('respects the cooldown, and one-shot rules go triggered', async () => {
    closes = [100, 90, 100, 90, 100, 90, 100];
    const r = await svc.createIndicatorAlert(me, { symbol: 'XRPUSDT', timeframe: '1h', left: price, operator: 'crosses_below', right: value(95), cooldownSec: 3 * 3600 }, deps);
    closedThrough(2); expect(await run()).toMatchObject({ fired: 1 }); // 100→90
    closedThrough(4); expect(await run()).toMatchObject({ fired: 0 }); // crosses again 2h later: cooling down
    closedThrough(6); expect(await run()).toMatchObject({ fired: 1 }); // 4h later: allowed

    const once = await svc.createIndicatorAlert(me, { symbol: 'XRPUSDT', timeframe: '1h', left: price, operator: 'lt', right: value(95), recurring: false }, deps);
    closedThrough(2);
    // Fresh rule on an old clock: its first bar is bar 1 (90 < 95).
    expect(await run()).toMatchObject({ fired: 1 });
    expect((await prisma.indicatorAlert.findUniqueOrThrow({ where: { id: once.id } })).status).toBe('triggered');
    // Re-arm.
    expect((await svc.updateIndicatorAlert(me, once.id, { status: 'active' })).status).toBe('active');
    await expect(svc.updateIndicatorAlert('someone-else', r.id, { status: 'paused' })).rejects.toThrow(/not found/i);
  });

  it('fetches once per symbol and timeframe, and paused rules cost nothing', async () => {
    closes = new Array(60).fill(100);
    for (const tf of ['1h', '1h', '1h'] as const) await svc.createIndicatorAlert(me, { symbol: 'BTCUSDT', timeframe: tf, left: { kind: 'indicator', id: 'rsi', output: 'value' }, operator: 'gt', right: value(70) }, deps);
    const p = await svc.createIndicatorAlert(me, { symbol: 'ADAUSDT', timeframe: '1h', left: price, operator: 'gt', right: value(1) }, deps);
    await svc.updateIndicatorAlert(me, p.id, { status: 'paused' });
    loads.length = 0;
    closedThrough(50);
    expect(await run()).toMatchObject({ groups: 1, checked: 3 });
    expect(loads).toEqual([{ symbol: 'BTCUSDT', tf: '1h', limit: 300 }]);
  });

  it('a second worker on the same bar sends nothing twice', async () => {
    closes = [100, 90];
    await svc.createIndicatorAlert(me, { symbol: 'DOTUSDT', timeframe: '1h', left: price, operator: 'lt', right: value(95) }, deps);
    closedThrough(2);
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.fired + b.fired).toBe(1);
    expect(await prisma.notification.count({ where: { userId: me } })).toBe(1);
  });

  it('refuses rules that cannot work, with a reason', async () => {
    const base = { symbol: 'BTCUSDT', timeframe: '1h' as const, operator: 'gt' as const };
    await expect(svc.createIndicatorAlert(me, { ...base, left: { kind: 'indicator', id: 'rsi', output: 'value' }, right: ema5 }, deps)).rejects.toThrow(/same units/);
    await expect(svc.createIndicatorAlert(me, { ...base, left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 400 } }, right: value(1) }, deps)).rejects.toThrow(/at most 1000/);
    await expect(svc.createIndicatorAlert(me, { ...base, symbol: 'NODATA', left: price, right: value(1) }, deps)).rejects.toThrow(/No market data for NODATA/);
    // Provider down: saved anyway.
    const down = { ...deps, loadCandles: async () => { throw new Error('timeout'); } };
    await expect(svc.createIndicatorAlert(me, { ...base, left: price, right: value(1) }, down)).resolves.toMatchObject({ status: 'active' });
  });

  it('previews the current value without saving', async () => {
    closes = [...new Array(30).fill(100), 120];
    closedThrough(30); // the 120 bar is forming: preview ignores it
    const p = await svc.previewIndicatorAlert({ symbol: 'btcusdt', timeframe: '1h', left: price, operator: 'gt', right: value(110) }, deps);
    expect(p).toMatchObject({ symbol: 'BTCUSDT', met: false, left: 100, enoughData: true, bars: 30, description: 'Close is above 110 (now 100.00)' });
    const short = await svc.previewIndicatorAlert({ symbol: 'BTCUSDT', timeframe: '1h', left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 50 } }, operator: 'lt', right: value(30) }, deps);
    expect(short).toMatchObject({ enoughData: false, met: null, left: null });
    expect(await prisma.indicatorAlert.count({ where: { userId: me } })).toBe(0);
  });
});
