import { describe, expect, it } from 'vitest';
import { allocationSlices } from './allocation';

const row = (symbol: string, trades: number, netPnl: number) => ({ symbol, trades, wins: 0, losses: 0, winRate: 0, netPnl, avgPnl: 0 });

describe('allocationSlices', () => {
  it('keeps the five busiest and folds the rest into Others', () => {
    const rows = [row('EURUSD', 4, 10), row('XAUUSD', 9, -50), row('NAS100', 12, 300), row('GBPUSD', 2, 5), row('US30', 7, 20), row('BTCUSD', 3, 40), row('USDJPY', 1, -3)];
    const { total, slices } = allocationSlices(rows);
    expect(total).toBe(38);
    expect(slices.map((s) => s.label)).toEqual(['NAS100', 'XAUUSD', 'US30', 'EURUSD', 'BTCUSD', 'Others (2)']);
    expect(slices.at(-1)).toMatchObject({ trades: 3, netPnl: 2, color: 'var(--series-other)' });
    expect(slices.map((s) => s.color).slice(0, 5)).toEqual([1, 2, 3, 4, 5].map((i) => `var(--series-${i})`));
  });
  it('has no Others slice with five symbols or fewer, and nothing for no trades', () => {
    expect(allocationSlices([row('A', 1, 1), row('B', 1, 1)]).slices.map((s) => s.key)).toEqual(['A', 'B']);
    expect(allocationSlices([])).toEqual({ total: 0, slices: [] });
  });
});
