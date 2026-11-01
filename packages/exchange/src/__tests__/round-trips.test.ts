import { describe, expect, it } from 'vitest';
import { closedTrades, type TradeFill } from '../round-trips.js';

const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
const f = (side: 'BUY' | 'SELL', qty: number, price: number, positionAfter: number | null, n: number, symbol = 'BTCUSD'): TradeFill => ({ symbol, side, qty, price, positionAfter, ts: t(n) });

describe('closedTrades details', () => {
  it('records side, peak size, average entry and exit, and open/close times', () => {
    const [tr] = closedTrades([
      f('BUY', 2, 100, 2, 1),
      f('BUY', 2, 200, 4, 2), // avg 150, peak 4
      f('SELL', 1, 300, 3, 3),
      f('SELL', 3, 100, 0, 4), // exits: (300 + 3×100) / 4 = 150
    ], () => 1);
    expect(tr).toEqual({ symbol: 'BTCUSD', side: 'LONG', qty: 4, avgEntry: 150, avgExit: 150, pnlUsd: 150 - 150 - 0 + 0, openedAt: t(1), closedAt: t(4) });
  });

  it('closes the old side and opens the new one on a flip', () => {
    const trips = closedTrades([
      f('SELL', 3, 50, -3, 1),
      f('BUY', 5, 40, 2, 2), // short 3 @50 closed at 40 (+30); long 2 @40 opens
      f('SELL', 2, 45, 0, 3), // +10
    ], () => 1);
    expect(trips).toEqual([
      { symbol: 'BTCUSD', side: 'SHORT', qty: 3, avgEntry: 50, avgExit: 40, pnlUsd: 30, openedAt: t(1), closedAt: t(2) },
      { symbol: 'BTCUSD', side: 'LONG', qty: 2, avgEntry: 40, avgExit: 45, pnlUsd: 10, openedAt: t(2), closedAt: t(3) },
    ]);
  });

  it('keeps symbols apart and applies each multiplier', () => {
    const trips = closedTrades([
      f('BUY', 10, 60000, 10, 1, 'BTCUSD'),
      f('SELL', 4, 3000, -4, 2, 'ETHUSD'),
      f('SELL', 10, 61000, 0, 3, 'BTCUSD'),
      f('BUY', 4, 2900, 0, 4, 'ETHUSD'),
    ], (s) => (s === 'BTCUSD' ? 0.001 : 0.01));
    expect(trips.map((x) => [x.symbol, x.side, Math.round(x.pnlUsd * 100) / 100])).toEqual([['BTCUSD', 'LONG', 10], ['ETHUSD', 'SHORT', 4]]);
  });
});
