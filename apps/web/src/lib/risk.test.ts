import { describe, expect, it } from 'vitest';
import { cagrPct, dailyCloses, dailyReturns, maxDrawdownAbs, recoveryFactor, riskMetrics, sharpe, sortino } from './risk';

// Expected values worked out separately (Python statistics.stdev), not with this code.
const R = [0.01, -0.005, 0.02, 0, 0.01, -0.01, 0.015, 0.005, -0.002, 0.01];

describe('Sharpe and Sortino', () => {
  it('annualise daily returns over 252 trading days', () => {
    expect(sharpe(R)).toBe(8.93);
    expect(sortino(R)).toBe(23.43);
  });
  it('need ten returns and some variation', () => {
    expect(sharpe(R.slice(0, 9))).toBeNull();
    expect(sortino(R.slice(0, 9))).toBeNull();
    expect(sharpe(Array(12).fill(0.01))).toBeNull(); // no spread
    expect(sortino(R.map(Math.abs))).toBeNull(); // no losing day
  });
});

describe('CAGR', () => {
  it('compounds over the real span', () => {
    expect(cagrPct(10_000, 11_000, '2026-01-01T00:00:00Z', '2026-07-02T12:00:00Z')).toBe(21);
  });
  it('is not annualised from a short span or broken equity', () => {
    expect(cagrPct(10_000, 11_000, '2026-01-01T00:00:00Z', '2026-03-15T00:00:00Z')).toBeNull(); // 73 days
    expect(cagrPct(0, 11_000, '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z')).toBeNull();
    expect(cagrPct(10_000, -5, '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z')).toBeNull();
  });
});

describe('drawdown and recovery', () => {
  const curve = [
    { time: '', equity: 10_000 },
    { time: '2026-03-02T10:00:00Z', equity: 10_500 },
    { time: '2026-03-02T15:00:00Z', equity: 10_200 },
    { time: '2026-03-03T11:00:00Z', equity: 9_900 },
    { time: '2026-03-05T09:00:00Z', equity: 11_000 },
  ];
  it('measures the fall from the running peak in money', () => {
    expect(maxDrawdownAbs(curve, 10_000)).toBe(600);
    expect(recoveryFactor(1_000, 600)).toBe(1.67);
    expect(recoveryFactor(1_000, 0)).toBeNull();
  });
  it('keeps the last equity of each day and returns day on day', () => {
    expect(dailyCloses(curve)).toEqual([{ day: '2026-03-02', equity: 10_200 }, { day: '2026-03-03', equity: 9_900 }, { day: '2026-03-05', equity: 11_000 }]);
    const r = dailyReturns(10_000, [10_200, 9_900, 11_000]);
    expect(r.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0.02, -0.029412, 0.111111]);
  });
  it('shows only what the history supports', () => {
    const m = riskMetrics(curve, 10_000, 1_000);
    expect(m).toEqual({ sharpe: null, sortino: null, cagrPct: null, recoveryFactor: 1.67, tradingDays: 3 });
  });
  it('fills in with enough history', () => {
    let eq = 10_000;
    const long = [{ time: '', equity: eq }, ...R.concat(R, R).map((r, i) => { eq *= 1 + r; return { time: new Date(Date.UTC(2026, 0, 2 + i * 4, 15)).toISOString(), equity: eq }; })];
    const m = riskMetrics(long, 10_000, eq - 10_000);
    expect(m.tradingDays).toBe(30);
    expect(m.sharpe).toBeGreaterThan(5);
    expect(m.sortino).toBeGreaterThan(m.sharpe!);
    expect(m.cagrPct).toBeGreaterThan(0);
    expect(m.recoveryFactor).toBeGreaterThan(1);
  });
});
