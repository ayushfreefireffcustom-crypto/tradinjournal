import { describe, it, expect } from 'vitest';
import type { Deal } from '@tradinjournal/types';
import { reconstructTrades, computeStats } from '../trades.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// This suite targets the reconstruction/stats logic actually wired into the
// live API (apps/api/src/modules/trades/trades.service.ts) — NOT the
// separate, differently-behaved implementation in packages/core, which the
// API does not import or use.

let ticket = 1000;
function nextTicket(): string { return String(ticket++); }

function deal(overrides: Partial<Deal> & Pick<Deal, 'positionId' | 'type' | 'entry' | 'volume' | 'price'>): Deal {
  return {
    dealTicket: nextTicket(),
    orderTicket: nextTicket(),
    symbol: 'EURUSD',
    profit: '0',
    commission: '0',
    swap: '0',
    fee: '0',
    dealTime: '2024-01-15T09:00:00.000Z',
    comment: '',
    ...overrides,
  };
}

// ─── 1. Simple round trips ────────────────────────────────────────────────────

describe('simple long/short round trips', () => {
  it('reconstructs a single BUY entry + SELL exit', () => {
    const trades = reconstructTrades([
      deal({ positionId: '1', type: 'BUY', entry: 'IN', volume: '1.00', price: '1.10000', dealTime: '2024-01-15T09:00:00.000Z' }),
      deal({ positionId: '1', type: 'SELL', entry: 'OUT', volume: '1.00', price: '1.10500', profit: '50', dealTime: '2024-01-15T10:00:00.000Z' }),
    ]);

    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.direction).toBe('LONG');
    expect(t.status).toBe('CLOSED');
    expect(t.volume).toBe(1);
    expect(t.entryPrice).toBeCloseTo(1.1, 5);
    expect(t.exitPrice).toBeCloseTo(1.105, 5);
    expect(t.grossPnl).toBe(50);
    expect(t.netPnl).toBe(50);
    expect(t.durationSecs).toBe(3600);
  });

  it('reconstructs a SELL entry + BUY exit (short)', () => {
    const trades = reconstructTrades([
      deal({ positionId: '2', type: 'SELL', entry: 'IN', volume: '0.5', price: '1.20000' }),
      deal({ positionId: '2', type: 'BUY', entry: 'OUT', volume: '0.5', price: '1.19000', profit: '50' }),
    ]);
    const t = trades[0]!;
    expect(t.direction).toBe('SHORT');
    expect(t.status).toBe('CLOSED');
    expect(t.grossPnl).toBe(50);
  });

  it('includes commission and swap in netPnl', () => {
    const trades = reconstructTrades([
      deal({ positionId: '3', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', commission: '-7' }),
      deal({ positionId: '3', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1050', profit: '50', commission: '-7', swap: '-2' }),
    ]);
    const t = trades[0]!;
    expect(t.grossPnl).toBe(50);
    expect(t.commission).toBe(-14);
    expect(t.swap).toBe(-2);
    expect(t.netPnl).toBe(34);
  });
});

// ─── 2. Scale-in / scale-out / mixed multi-leg ────────────────────────────────

describe('multi-leg positions', () => {
  it('weights average entry across multiple scale-in deals', () => {
    const trades = reconstructTrades([
      deal({ positionId: '4', type: 'BUY', entry: 'IN', volume: '0.5', price: '1.1000' }),
      deal({ positionId: '4', type: 'BUY', entry: 'IN', volume: '0.25', price: '1.1020' }),
      deal({ positionId: '4', type: 'SELL', entry: 'OUT', volume: '0.75', price: '1.1050', profit: '37.50' }),
    ]);
    const t = trades[0]!;
    expect(t.volume).toBeCloseTo(0.75, 8);
    const expectedEntry = (0.5 * 1.1 + 0.25 * 1.102) / 0.75;
    expect(t.entryPrice).toBeCloseTo(expectedEntry, 8);
    expect(t.grossPnl).toBe(37.5);
    expect(t.status).toBe('CLOSED');
  });

  it('weights average exit across multiple scale-out (partial close) deals', () => {
    const trades = reconstructTrades([
      deal({ positionId: '5', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '5', type: 'SELL', entry: 'OUT', volume: '0.5', price: '1.1040', profit: '20' }),
      deal({ positionId: '5', type: 'SELL', entry: 'OUT', volume: '0.5', price: '1.1060', profit: '30' }),
    ]);
    const t = trades[0]!;
    expect(t.volume).toBe(1);
    expect(t.grossPnl).toBe(50);
    expect(t.exitPrice).toBeCloseTo(1.105, 8);
    expect(t.status).toBe('CLOSED');
  });

  it('stays OPEN when total exit volume is less than total entry volume', () => {
    const trades = reconstructTrades([
      deal({ positionId: '6', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '6', type: 'SELL', entry: 'OUT', volume: '0.5', price: '1.1040', profit: '20' }),
    ]);
    const t = trades[0]!;
    expect(t.status).toBe('OPEN');
    expect(t.closeTime).not.toBeNull();
    expect(t.durationSecs).not.toBeNull();
  });

  it('has no exit at all for a fully open position (exitPrice/closeTime/durationSecs null)', () => {
    const trades = reconstructTrades([
      deal({ positionId: '7', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
    ]);
    const t = trades[0]!;
    expect(t.status).toBe('OPEN');
    expect(t.exitPrice).toBeNull();
    expect(t.closeTime).toBeNull();
    expect(t.durationSecs).toBeNull();
  });

  it('handles five interleaved scale-in AND scale-out legs (realistic messy history)', () => {
    const trades = reconstructTrades([
      deal({ positionId: '8', type: 'BUY', entry: 'IN',  volume: '0.30', price: '2350.000', dealTime: '2024-02-01T08:00:00.000Z' }),
      deal({ positionId: '8', type: 'BUY', entry: 'IN',  volume: '0.20', price: '2352.500', dealTime: '2024-02-01T08:10:00.000Z' }),
      deal({ positionId: '8', type: 'SELL', entry: 'OUT', volume: '0.10', price: '2360.000', profit: '10.00', dealTime: '2024-02-01T09:00:00.000Z' }),
      deal({ positionId: '8', type: 'BUY', entry: 'IN',  volume: '0.15', price: '2355.000', dealTime: '2024-02-01T09:30:00.000Z' }),
      deal({ positionId: '8', type: 'SELL', entry: 'OUT', volume: '0.55', price: '2365.000', profit: '55.00', dealTime: '2024-02-01T10:00:00.000Z' }),
    ]);
    const t = trades[0]!;
    const totalIn = 0.3 + 0.2 + 0.15;
    expect(t.volume).toBeCloseTo(totalIn, 8);
    const expectedEntry = (0.3 * 2350 + 0.2 * 2352.5 + 0.15 * 2355) / totalIn;
    expect(t.entryPrice).toBeCloseTo(expectedEntry, 6);
    const totalOut = 0.1 + 0.55;
    const expectedExit = (0.1 * 2360 + 0.55 * 2365) / totalOut;
    expect(t.exitPrice).toBeCloseTo(expectedExit, 6);
    expect(t.grossPnl).toBeCloseTo(65, 8);
    expect(t.status).toBe('CLOSED'); // 0.65 in vs 0.65 out
    expect(t.openTime).toBe('2024-02-01T08:00:00.000Z');
    expect(t.closeTime).toBe('2024-02-01T10:00:00.000Z');
  });
});

// ─── 3. Swap/commission accumulation over many deals ─────────────────────────

describe('swap and commission accumulation', () => {
  it('sums swap correctly across many small overnight rollovers', () => {
    const swaps = Array.from({ length: 10 }, () => '-0.37');
    const deals: Deal[] = [
      deal({ positionId: '9', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      // MT5 sometimes reports rollover swap adjustments against the closing deal;
      // simulate 10 separate exit legs each carrying a slice of swap.
      ...swaps.map((s, i) =>
        deal({ positionId: '9', type: 'SELL', entry: 'OUT', volume: '0.1', price: '1.1010', profit: '1.00', swap: s, dealTime: `2024-01-${16 + i}T09:00:00.000Z` })),
    ];
    const t = reconstructTrades(deals)[0]!;
    expect(t.swap).toBeCloseTo(-3.7, 8);
    expect(t.grossPnl).toBeCloseTo(10, 8);
    expect(t.netPnl).toBeCloseTo(6.3, 8);
  });
});

// ─── 4. Floating point precision stress ───────────────────────────────────────

describe('floating point precision', () => {
  it('sums twenty 0.01-lot partial fills without cent-level drift', () => {
    const deals: Deal[] = [];
    for (let i = 0; i < 20; i++) {
      deals.push(deal({ positionId: '10', type: 'BUY', entry: 'IN', volume: '0.01', price: '1.10000', dealTime: `2024-03-01T0${i % 9}:00:00.000Z` }));
    }
    deals.push(deal({ positionId: '10', type: 'SELL', entry: 'OUT', volume: '0.20', price: '1.10500', profit: '10.00', dealTime: '2024-03-01T12:00:00.000Z' }));

    const t = reconstructTrades(deals)[0]!;
    expect(t.volume).toBeCloseTo(0.2, 6);
    expect(t.entryPrice).toBeCloseTo(1.1, 6);
    expect(t.grossPnl).toBe(10);
  });

  it('sums many small commission deductions to the cent', () => {
    const deals: Deal[] = [
      deal({ positionId: '11', type: 'BUY', entry: 'IN', volume: '3.0', price: '1.1000' }),
    ];
    for (let i = 0; i < 30; i++) {
      deals.push(deal({ positionId: '11', type: 'SELL', entry: 'OUT', volume: '0.1', price: '1.1010', profit: '1.00', commission: '-0.07', dealTime: `2024-03-02T${String(i % 23).padStart(2, '0')}:00:00.000Z` }));
    }
    const t = reconstructTrades(deals)[0]!;
    expect(t.commission).toBeCloseTo(-2.1, 8); // 30 * -0.07
    expect(t.grossPnl).toBeCloseTo(30, 8);
    expect(t.netPnl).toBeCloseTo(27.9, 8);
  });
});

// ─── 5. Reversal (INOUT) and close-by (OUT_BY) deals ─────────────────────────

describe('INOUT reversal handling (documents actual live behavior)', () => {
  it('treats an INOUT deal purely as a position-closing exit under its own positionId', () => {
    // Live trades.service.ts buckets INOUT into `outDeals` alongside OUT/OUT_BY —
    // unlike packages/core, it does NOT split the deal into a synthetic
    // close-leg + reopen-leg. This is only correct if the broker assigns a
    // NEW positionId to the reversed (reopened) leg, which real MT5 does.
    const trades = reconstructTrades([
      deal({ positionId: '12', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-04-01T09:00:00.000Z' }),
      deal({ positionId: '12', type: 'SELL', entry: 'INOUT', volume: '1.0', price: '1.1050', profit: '50', dealTime: '2024-04-01T10:00:00.000Z' }),
    ]);
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.status).toBe('CLOSED');
    expect(t.grossPnl).toBe(50);
    expect(t.exitPrice).toBeCloseTo(1.105, 8);
  });

  it('produces two independent trades when the broker assigns a new positionId to the reversed leg', () => {
    const trades = reconstructTrades([
      deal({ positionId: '12', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-04-01T09:00:00.000Z' }),
      deal({ positionId: '12', type: 'SELL', entry: 'INOUT', volume: '1.5', price: '1.1050', profit: '50', dealTime: '2024-04-01T10:00:00.000Z' }),
      // reversed 0.5 lot SHORT leg opens under a brand new positionId, as real MT5 does
      deal({ positionId: '13', type: 'SELL', entry: 'IN', volume: '0.5', price: '1.1050', dealTime: '2024-04-01T10:00:00.000Z' }),
      deal({ positionId: '13', type: 'BUY', entry: 'OUT', volume: '0.5', price: '1.1030', profit: '10', dealTime: '2024-04-01T11:00:00.000Z' }),
    ]);
    expect(trades).toHaveLength(2);
    const closed = trades.find(t => t.positionId === '12')!;
    const reversed = trades.find(t => t.positionId === '13')!;
    expect(closed.direction).toBe('LONG');
    expect(closed.grossPnl).toBe(50);
    expect(reversed.direction).toBe('SHORT');
    expect(reversed.grossPnl).toBe(10);
  });

  it('treats OUT_BY (hedged close-by) the same as a normal exit', () => {
    const trades = reconstructTrades([
      deal({ positionId: '14', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '14', type: 'SELL', entry: 'OUT_BY', volume: '1.0', price: '1.1030', profit: '30' }),
    ]);
    const t = trades[0]!;
    expect(t.status).toBe('CLOSED');
    expect(t.grossPnl).toBe(30);
  });
});

// ─── 6. Hedging: same symbol, simultaneous opposite positions ────────────────

describe('hedging accounts', () => {
  it('keeps two simultaneously open opposite-direction positions on the same symbol independent', () => {
    const trades = reconstructTrades([
      deal({ positionId: '20', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-01-15T09:00:00.000Z' }),
      deal({ positionId: '21', type: 'SELL', entry: 'IN', volume: '0.5', price: '1.1050', dealTime: '2024-01-15T09:30:00.000Z' }),
      deal({ positionId: '20', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1080', profit: '80', dealTime: '2024-01-15T10:00:00.000Z' }),
      deal({ positionId: '21', type: 'BUY', entry: 'OUT', volume: '0.5', price: '1.1000', profit: '25', dealTime: '2024-01-15T11:00:00.000Z' }),
    ]);
    expect(trades).toHaveLength(2);
    const long = trades.find(t => t.positionId === '20')!;
    const short = trades.find(t => t.positionId === '21')!;
    expect(long.direction).toBe('LONG');
    expect(long.grossPnl).toBe(80);
    expect(short.direction).toBe('SHORT');
    expect(short.grossPnl).toBe(25);
  });
});

// ─── 7. Filtering: balance events and orphaned/zero positionId deals ─────────

describe('filtering non-trading deals', () => {
  it('excludes BALANCE deals entirely from reconstructed trades', () => {
    const trades = reconstructTrades([
      deal({ positionId: '0', type: 'BALANCE', entry: 'IN', volume: '0', price: '0', profit: '10000', comment: 'Deposit' }),
      deal({ positionId: '30', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '30', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1050', profit: '50' }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.positionId).toBe('30');
  });

  it('excludes deals with positionId "0" (orphaned/non-position deals)', () => {
    const trades = reconstructTrades([
      deal({ positionId: '0', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
    ]);
    expect(trades).toHaveLength(0);
  });

  it('skips a position that has only exit deals and no entry', () => {
    const trades = reconstructTrades([
      deal({ positionId: '31', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1050', profit: '50' }),
    ]);
    expect(trades).toHaveLength(0);
  });
});

// ─── 8. computeStats ──────────────────────────────────────────────────────────

describe('computeStats', () => {
  it('returns all-zero/empty stats for no trades', () => {
    const s = computeStats([], 10000);
    expect(s.totalTrades).toBe(0);
    expect(s.netPnl).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.equityCurve).toHaveLength(1);
    expect(s.equityCurve[0]!.equity).toBe(10000);
    expect(s.bySymbol).toHaveLength(0);
    expect(s.byDay).toHaveLength(0);
  });

  it('classifies a breakeven trade (netPnl === 0) as a loss, not a win', () => {
    const trades = reconstructTrades([
      deal({ positionId: '40', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '40', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1000', profit: '0' }),
    ]);
    const s = computeStats(trades, 10000);
    expect(s.totalWins).toBe(0);
    expect(s.totalLosses).toBe(1);
    expect(s.winRate).toBe(0);
  });

  it('sets profitFactor to 999 sentinel when there are wins and zero losses', () => {
    const trades = reconstructTrades([
      deal({ positionId: '41', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000' }),
      deal({ positionId: '41', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1050', profit: '50' }),
    ]);
    const s = computeStats(trades, 10000);
    expect(s.profitFactor).toBe(999);
  });

  it('computes equity curve and max drawdown correctly across an up-down-up sequence', () => {
    const trades = reconstructTrades([
      deal({ positionId: '50', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-05-01T09:00:00.000Z' }),
      deal({ positionId: '50', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1100', profit: '100', dealTime: '2024-05-01T10:00:00.000Z' }),

      deal({ positionId: '51', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1100', dealTime: '2024-05-02T09:00:00.000Z' }),
      deal({ positionId: '51', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.0900', profit: '-200', dealTime: '2024-05-02T10:00:00.000Z' }),

      deal({ positionId: '52', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.0900', dealTime: '2024-05-03T09:00:00.000Z' }),
      deal({ positionId: '52', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1000', profit: '100', dealTime: '2024-05-03T10:00:00.000Z' }),
    ]);
    const s = computeStats(trades, 1000);
    // equity path: 1000 -> 1100 (peak) -> 900 -> 1000
    expect(s.currentEquity).toBe(1000);
    expect(s.maxDrawdownPct).toBeCloseTo((1100 - 900) / 1100, 8);
    expect(s.equityCurve.map(p => p.equity)).toEqual([1000, 1100, 900, 1000]);
  });

  it('buckets trades by day-of-week using closeTime and only includes days with trades', () => {
    const trades = reconstructTrades([
      // 2024-06-03 is a Monday
      deal({ positionId: '60', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-06-03T09:00:00.000Z' }),
      deal({ positionId: '60', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1050', profit: '50', dealTime: '2024-06-03T10:00:00.000Z' }),
      // 2024-06-05 is a Wednesday
      deal({ positionId: '61', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-06-05T09:00:00.000Z' }),
      deal({ positionId: '61', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.0950', profit: '-50', dealTime: '2024-06-05T10:00:00.000Z' }),
    ]);
    const s = computeStats(trades, 1000);
    expect(s.byDay.map(d => d.day).sort()).toEqual(['Mon', 'Wed']);
    expect(s.byDay.find(d => d.day === 'Mon')!.netPnl).toBe(50);
    expect(s.byDay.find(d => d.day === 'Wed')!.netPnl).toBe(-50);
  });

  it('sorts bySymbol by absolute netPnl descending', () => {
    const trades = reconstructTrades([
      deal({ positionId: '70', symbol: 'EURUSD', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-07-01T09:00:00.000Z' }),
      deal({ positionId: '70', symbol: 'EURUSD', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1010', profit: '10', dealTime: '2024-07-01T10:00:00.000Z' }),
      deal({ positionId: '71', symbol: 'XAUUSD', type: 'BUY', entry: 'IN', volume: '1.0', price: '2300', dealTime: '2024-07-02T09:00:00.000Z' }),
      deal({ positionId: '71', symbol: 'XAUUSD', type: 'SELL', entry: 'OUT', volume: '1.0', price: '2250', profit: '-50', dealTime: '2024-07-02T10:00:00.000Z' }),
    ]);
    const s = computeStats(trades, 1000);
    expect(s.bySymbol.map(x => x.symbol)).toEqual(['XAUUSD', 'EURUSD']);
  });

  it('averages durationSecs only across closed trades that have one', () => {
    const trades = reconstructTrades([
      deal({ positionId: '80', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-08-01T09:00:00.000Z' }),
      deal({ positionId: '80', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1010', profit: '10', dealTime: '2024-08-01T10:00:00.000Z' }), // 1h
      deal({ positionId: '81', type: 'BUY', entry: 'IN', volume: '1.0', price: '1.1000', dealTime: '2024-08-02T09:00:00.000Z' }),
      deal({ positionId: '81', type: 'SELL', entry: 'OUT', volume: '1.0', price: '1.1010', profit: '10', dealTime: '2024-08-02T11:00:00.000Z' }), // 2h
    ]);
    const s = computeStats(trades, 1000);
    expect(s.avgDurationSecs).toBe(((1 * 3600) + (2 * 3600)) / 2);
  });
});
