import { describe, expect, it } from 'vitest';
import { closedTrades, top3ProfitSharePct, type TradeFill } from '../leader-trades.js';

const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
const f = (symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, positionAfter: number | null, n: number): TradeFill => ({ symbol, side, qty, price, positionAfter, ts: t(n) });
const mult = (s: string) => (s === 'BTCUSD' ? 0.001 : s === 'ETHUSD' ? 0.01 : null);

describe('closedTrades', () => {
  it('rebuilds long and short round trips in USD with the contract multiplier', () => {
    const trades = closedTrades([
      f('BTCUSD', 'BUY', 10, 60000, 10, 1),
      f('BTCUSD', 'SELL', 10, 61000, 0, 2), // +1000 * 10 * 0.001 = +10
      f('ETHUSD', 'SELL', 5, 3000, -5, 3),
      f('ETHUSD', 'BUY', 5, 3100, 0, 4), // -100 * 5 * 0.01 = -5
    ], mult);
    expect(trades.map((x) => [x.symbol, round(x.pnlUsd)])).toEqual([['BTCUSD', 10], ['ETHUSD', -5]]);
    expect(trades[1]!.closedAt).toEqual(t(4));
  });

  it('counts scaling in and partial exits as one trade', () => {
    const trades = closedTrades([
      f('BTCUSD', 'BUY', 1, 100, 1, 1),
      f('BTCUSD', 'BUY', 1, 200, 2, 2), // avg 150
      f('BTCUSD', 'SELL', 1, 250, 1, 3), // +100
      f('BTCUSD', 'SELL', 1, 50, 0, 4), // -100
    ], () => 1);
    expect(trades.map((x) => round(x.pnlUsd))).toEqual([0]);
  });

  it('splits a flip into a closed trade and a new one', () => {
    const trades = closedTrades([
      f('BTCUSD', 'BUY', 2, 100, 2, 1),
      f('BTCUSD', 'SELL', 3, 110, -1, 2), // closes +20, opens short 1 @110
      f('BTCUSD', 'BUY', 1, 100, 0, 3), // +10
    ], () => 1);
    expect(trades.map((x) => round(x.pnlUsd))).toEqual([20, 10]);
  });

  it('skips a position opened before tracking began, then counts the next one', () => {
    const trades = closedTrades([
      // Leader already held 3 long; we only see the exit.
      f('ETHUSD', 'SELL', 3, 3000, 0, 1),
      f('ETHUSD', 'BUY', 1, 3000, 1, 2),
      f('ETHUSD', 'SELL', 1, 3200, 0, 3), // +200 * 0.01 = +2
    ], mult);
    expect(trades.map((x) => round(x.pnlUsd))).toEqual([2]);
  });

  it('skips a partial exit of an old position until it goes flat', () => {
    const trades = closedTrades([
      f('ETHUSD', 'SELL', 1, 3000, 2, 1), // was 3 before we looked
      f('ETHUSD', 'BUY', 1, 2900, 3, 2),
      f('ETHUSD', 'SELL', 3, 3100, 0, 3), // flat: still unknown entry, skipped
      f('ETHUSD', 'SELL', 2, 3000, -2, 4),
      f('ETHUSD', 'BUY', 2, 2900, 0, 5), // +100 * 2 * 0.01 = +2
    ], mult);
    expect(trades.map((x) => round(x.pnlUsd))).toEqual([2]);
  });

  it('works without positionAfter and ignores symbols with no multiplier', () => {
    const trades = closedTrades([
      f('BTCUSD', 'BUY', 1, 100, null, 1),
      f('XYZ', 'BUY', 1, 1, null, 2),
      f('BTCUSD', 'SELL', 1, 90, null, 3),
    ], mult);
    expect(trades.map((x) => [x.symbol, round(x.pnlUsd)])).toEqual([['BTCUSD', -0.01]]);
  });
});

describe('top3ProfitSharePct', () => {
  it('is the share of winning profit from the 3 best trades', () => {
    expect(top3ProfitSharePct([50, 30, 10, 5, 5, -40].map((pnlUsd) => ({ pnlUsd })))).toBeCloseTo(90);
    expect(top3ProfitSharePct([10, 10, 10, 10, 10].map((pnlUsd) => ({ pnlUsd })))).toBeCloseTo(60);
  });

  it('is unknown with under 5 trades or no winners', () => {
    expect(top3ProfitSharePct([10, 20, 30, 40].map((pnlUsd) => ({ pnlUsd })))).toBeNull();
    expect(top3ProfitSharePct([-1, -2, -3, 0, -5].map((pnlUsd) => ({ pnlUsd })))).toBeNull();
  });
});

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
