import { describe, expect, it } from 'vitest';
import {
  afterExit, atr, classifyTrend, coachFor, eventDayStats, eventKind, eventReaction, eventShort, learnedPointValue, marketKey,
  minSizeHint, money, pickReviewKind, planError, rUnit, sameMarket, sizePosition, specPointValueUsd, symbolSpec, verdict,
  type Bar, type CalEvent, type ChartTrade,
} from './trade-math';

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 12, 13, 30); // CPI, Thu 12 Nov 13:30 UTC

function trade(p: Partial<ChartTrade> & { id: string }): ChartTrade {
  return {
    source: 'mt5', symbol: 'XAUUSD', side: 'LONG', status: 'CLOSED', openTime: T0 - H, closeTime: T0, entry: 100, exit: 101,
    volume: 1, netPnl: 0, grossPnl: null, stop: null, target: null, note: null, ...p,
  };
}
const ev = (title: string, time: number, currency = 'USD', impact: CalEvent['impact'] = 'HIGH'): CalEvent =>
  ({ id: `${title}${time}`, title, currency, impact, time, actual: null, forecast: null, unit: null });

describe('symbols', () => {
  it('matches broker and exchange names to the chart symbol', () => {
    expect(marketKey('XAUUSD.m')).toBe('XAUUSD');
    expect(marketKey('XAUUSDm')).toBe('XAUUSD');
    expect(marketKey('GOLD')).toBe('XAUUSD');
    expect(sameMarket('BTCUSDT', 'BTC/USDT:USDT')).toBe(true);
    expect(sameMarket('SOLUSDT', 'SOLUSD')).toBe(true);
    expect(sameMarket('NAS100', 'US100')).toBe(true);
    expect(sameMarket('EURUSD', 'GBPUSD')).toBe(false);
  });
  it('knows contract sizes and calendar currencies', () => {
    expect(symbolSpec('XAUUSD')).toMatchObject({ kind: 'metal', contractSize: 100, currencies: ['USD'] });
    expect(symbolSpec('EURUSD')).toMatchObject({ kind: 'fx', contractSize: 100_000, currencies: ['EUR', 'USD'] });
    expect(symbolSpec('US30')).toMatchObject({ kind: 'index', brokerDependent: true, quote: 'USD' });
    expect(symbolSpec('GER40').currencies).toEqual(['EUR']);
    expect(symbolSpec('BTCUSDT')).toMatchObject({ kind: 'crypto', base: 'BTC' });
  });
  it('values a point per lot in USD', () => {
    expect(specPointValueUsd(symbolSpec('XAUUSD'), 4170, null)).toBe(100);
    expect(specPointValueUsd(symbolSpec('EURUSD'), 1.08, null)).toBe(100_000);
    expect(specPointValueUsd(symbolSpec('USDJPY'), 150, null)).toBeCloseTo(666.67, 1);
    expect(specPointValueUsd(symbolSpec('EURGBP'), 0.85, null)).toBeNull();
    expect(specPointValueUsd(symbolSpec('EURGBP'), 0.85, 1.27)).toBeCloseTo(127_000);
  });
  it('learns the point value from the user’s fills', () => {
    const ts = [
      trade({ id: 'a', entry: 18000, exit: 18050, volume: 1, grossPnl: 50 }),
      trade({ id: 'b', side: 'SHORT', entry: 18100, exit: 18080, volume: 2, grossPnl: 40 }),
      trade({ id: 'c', entry: 18000, exit: 18000, volume: 1, grossPnl: 0 }),
    ];
    expect(learnedPointValue(ts)).toBeCloseTo(1);
    expect(learnedPointValue(ts.slice(0, 1))).toBeNull();
  });
});

describe('risk ruler', () => {
  it('sizes gold like the approved design: $34,308 at 0.5%, 12 points → 0.14 lot', () => {
    const s = sizePosition({ balance: 34308, risk: { mode: 'pct', pct: 0.5 }, entry: 4170, stop: 4158, target: 4205, pointValue: 100, lotStep: 0.01, minLot: 0.01 })!;
    expect(s.lots).toBe(0.14);
    expect(Math.round(s.riskMoney)).toBe(168);
    expect(Math.round(s.rewardMoney!)).toBe(490);
    expect(s.r).toBeCloseTo(2.92, 2);
  });
  it('sizes FX majors and USD-base pairs', () => {
    // EURUSD, $10,000 at 1%, 20 pips → $100 / (0.0020 × 100,000) = 0.5 lot
    expect(sizePosition({ balance: 10000, risk: { mode: 'pct', pct: 1 }, entry: 1.08, stop: 1.078, target: null, pointValue: 100_000, lotStep: 0.01, minLot: 0.01 })!.lots).toBe(0.5);
    // USDJPY at 150, $100 risk, 50 pips (0.50) → pv 666.67 → 0.3 lot
    const pv = specPointValueUsd(symbolSpec('USDJPY'), 150, null)!;
    expect(sizePosition({ balance: null, risk: { mode: 'usd', usd: 100 }, entry: 150, stop: 149.5, target: null, pointValue: pv, lotStep: 0.01, minLot: 0.01 })!.lots).toBe(0.3);
  });
  it('sizes crypto in coins and flags a size below the minimum', () => {
    const s = sizePosition({ balance: 5000, risk: { mode: 'pct', pct: 0.25 }, entry: 96000, stop: 94000, target: 100000, pointValue: 1, lotStep: 0.001, minLot: 0.001 })!;
    expect(s.lots).toBe(0.006);
    const tiny = sizePosition({ balance: 100, risk: { mode: 'pct', pct: 0.25 }, entry: 96000, stop: 94000, target: null, pointValue: 1, lotStep: 0.001, minLot: 0.001 })!;
    expect(tiny.belowMin).toBe(true);
  });
  it('says what the smallest size would risk, as a plain note', () => {
    // $55.64 at 0.25%, BTC 65,730 → 65,000: 0.01 lot risks $7.30, 13% of the balance.
    const s = sizePosition({ balance: 55.64, risk: { mode: 'pct', pct: 0.25 }, entry: 65730, stop: 65000, target: null, pointValue: 1, lotStep: 0.01, minLot: 0.01 })!;
    expect(s.belowMin).toBe(true);
    expect(s.minRiskMoney).toBeCloseTo(7.3, 6);
    expect(minSizeHint(s, { unit: 'lot', lotDecimals: 2, balance: 55.64 })).toBe('Smallest size 0.01 lot risks $7.30 (13%).');
    expect(minSizeHint(s, { unit: 'lot', lotDecimals: 2, balance: 1000 })).toBe('Smallest size 0.01 lot risks $7.30 (0.7%).');
    expect(minSizeHint(s, { unit: 'lot', lotDecimals: 2, balance: null })).toBe('Smallest size 0.01 lot risks $7.30.');
    const ok = sizePosition({ balance: 5000, risk: { mode: 'pct', pct: 1 }, entry: 65730, stop: 65000, target: null, pointValue: 1, lotStep: 0.01, minLot: 0.01 })!;
    expect(minSizeHint(ok, { unit: 'lot', lotDecimals: 2, balance: 5000 })).toBeNull();
  });
  it('never sizes a plan with the stop on the wrong side', () => {
    expect(planError('LONG', 4170, 4180, null)).toMatch(/below/);
    expect(planError('SHORT', 4170, 4160, null)).toMatch(/above/);
    expect(planError('LONG', 4170, 4158, 4100)).toMatch(/target/);
    expect(planError('LONG', 4170, 4158, 4205)).toBeNull();
    expect(sizePosition({ balance: 1000, risk: { mode: 'pct', pct: 1 }, entry: 1, stop: 1, target: null, pointValue: 1, lotStep: 0.01, minLot: 0.01 })).toBeNull();
  });
});

describe('R, events and coaching', () => {
  it('uses the average loss as 1R and needs three losers', () => {
    expect(rUnit([trade({ id: 'a', netPnl: -100 }), trade({ id: 'b', netPnl: -200 })])).toBeNull();
    expect(rUnit([trade({ id: 'a', netPnl: -100 }), trade({ id: 'b', netPnl: -200 }), trade({ id: 'c', netPnl: -300 }), trade({ id: 'd', netPnl: 500 })])).toBe(200);
  });
  it('groups event titles into families', () => {
    expect(eventKind('Core CPI m/m')).toBe('CPI');
    expect(eventKind('CPI y/y')).toBe('CPI');
    expect(eventShort('Crude Oil Inventories')).toBe('EIA');
    expect(eventKind('Fed Governor Waller Speaks')).toBe('Fed speech');
    expect(eventShort('Fed Governor Waller Speaks')).toBe('Fed');
    expect(eventKind('Non-Farm Employment Change')).toBe('NFP');
  });
  it('measures the release bar against the ATR before it', () => {
    const bars: Bar[] = Array.from({ length: 20 }, (_, i) => ({ openTime: T0 - (20 - i) * 900_000, open: 100, high: 101, low: 99, close: 100 }));
    bars.push({ openTime: T0, open: 100, high: 100.5, low: 90, close: 92 });
    const r = eventReaction(bars, T0 + 60_000, 900_000)!;
    expect(r.move).toBe(-8);
    expect(r.atrMult).toBeCloseTo(4, 5);
    expect(eventReaction(bars, T0 + 3 * H, 900_000)).toBeNull();
  });
  it('flags a trade opened before CPI and counts history', () => {
    const events = [0, 1, 2, 3].map(d => ev('CPI m/m', T0 - d * 30 * 24 * H));
    const history = [1, 2, 3].map(d => trade({ id: `h${d}`, openTime: T0 - d * 30 * 24 * H - 40 * 60_000, netPnl: d === 3 ? 50 : -80 }));
    const open = trade({ id: 'open', status: 'OPEN', openTime: T0 - 40 * 60_000, closeTime: null, exit: null, netPnl: null });
    const c = coachFor(open, events, history);
    expect(c.flag).toBe('Opened 40 min before CPI');
    expect(c.line).toBe('You lost 2 of 3 trades opened before CPI');
    expect(coachFor(open, events, history.slice(0, 2)).line).toBeNull();
    expect(coachFor({ ...open, symbol: 'GER40' }, events, history).flag).toBeNull(); // EUR index, USD event
  });
  it('splits event-day trades into before and 30m+ after', () => {
    const events = [0, 1, 2, 3].map(d => ev('CPI y/y', T0 - d * 30 * 24 * H));
    const ts: ChartTrade[] = [];
    [0, 1, 2, 3].forEach(d => {
      const t = T0 - d * 30 * 24 * H;
      ts.push(trade({ id: `b${d}`, openTime: t - H, netPnl: d === 0 ? 40 : -100 }));
      ts.push(trade({ id: `a${d}`, openTime: t + H, netPnl: d === 3 ? -100 : 120 }));
    });
    ts.push(trade({ id: 'other-day', openTime: T0 - 5 * 24 * H, netPnl: 999 }));
    const s = eventDayStats(ts, events, 'CPI', 100)!;
    expect(s.n).toBe(8);
    expect(s.before).toEqual({ w: 1, l: 3 });
    expect(s.after).toEqual({ w: 3, l: 1 });
    expect(s.net).toBe(40 - 300 + 360 - 100);
    expect(s.avgR).toBeCloseTo(0, 5);
    expect(s.advice).toBe('Wait 30 min after the print');
    // Without a unit (the charts page: no stops at entry) there's no R, and bars are in money.
    const m = eventDayStats(ts, events, 'CPI', null)!;
    expect(m.avgR).toBeNull();
    expect(m.bars.map(b => b.v)).toContain(-100);
  });
  it('reviews the event that just printed, else the next one', () => {
    const now = T0 + 10 * 60_000;
    expect(pickReviewKind([ev('CPI m/m', T0), ev('Fed Chair Powell Speaks', T0 + 2 * H)], ['USD'], now)!.kind).toBe('CPI');
    expect(pickReviewKind([ev('Fed Chair Powell Speaks', T0 + 2 * H)], ['USD'], now)!.kind).toBe('Fed speech');
    expect(pickReviewKind([ev('ECB rate decision', T0, 'EUR')], ['USD'], now)).toBeNull();
  });
});

describe('replay and trend', () => {
  it('finds what price did after the exit', () => {
    const t = trade({ id: 'r', entry: 4171.5, exit: 4187.5, closeTime: T0, volume: 0.1, netPnl: 160 });
    const bars: Bar[] = [
      { openTime: T0 + 900_000, open: 4188, high: 4199, low: 4185, close: 4195 },
      { openTime: T0 + 1_800_000, open: 4195, high: 4207.4, low: 4190, close: 4200 },
    ];
    const a = afterExit(t, bars, T0 + 6 * H, 100)!;
    expect(a.extra).toBeCloseTo(19.9, 5);
    expect(Math.round(a.leftMoney!)).toBe(199);
    expect(verdict(t, a, n => money(n)).text).toBe('Left $199');
    expect(verdict({ ...t, status: 'OPEN' }, null, n => money(n)).text).toBe('Open');
  });
  it('reads a falling market as Down with a reason', () => {
    const bars: Bar[] = Array.from({ length: 60 }, (_, i) => {
      const p = 200 - i + (i % 3 === 0 ? 1.5 : 0);
      return { openTime: i * 60_000, open: p + 0.5, high: p + 1, low: p - 1, close: p };
    });
    const r = classifyTrend(bars, n => n.toFixed(0))!;
    expect(r.dir).toBe('down');
    expect(r.reason.length).toBeGreaterThan(0);
    expect(classifyTrend(bars.slice(0, 10), String)).toBeNull();
  });
  it('computes ATR and formats money', () => {
    expect(atr([{ openTime: 0, open: 1, high: 2, low: 1, close: 1 }])).toBeNull();
    expect(money(-186)).toBe('−$186');
    expect(money(490, 'USD', true)).toBe('+$490');
    expect(money(12.5, 'EUR')).toBe('€12.50');
  });
});
