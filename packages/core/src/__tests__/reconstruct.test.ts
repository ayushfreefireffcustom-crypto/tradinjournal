import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { reconstructTrades } from '../reconstruction/reconstruct.js';
import type { RawDeal } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let ticketCounter = 1000n;
let positionCounter = 1n;

function nextTicket(): bigint { return ticketCounter++; }
function nextPosition(): bigint { return positionCounter++; }

function deal(
  overrides: Omit<Partial<RawDeal>, 'volume' | 'price'> &
    Pick<RawDeal, 'type' | 'entry'> & { volume: number; price: number },
): RawDeal {
  const { volume, price, ...rest } = overrides;
  return {
    dealTicket: nextTicket(),
    orderTicket: nextTicket(),
    positionId: 1n,
    symbol: 'EURUSD',
    profit: new Decimal(0),
    commission: new Decimal(0),
    swap: new Decimal(0),
    fee: new Decimal(0),
    dealTime: new Date('2024-01-15T10:00:00Z'),
    magic: 0,
    reason: 0,
    ...rest,
    volume: new Decimal(volume),
    price: new Decimal(price),
  };
}

// ─── 1. Simple long trade ─────────────────────────────────────────────────────

describe('simple long trade', () => {
  it('reconstructs a single open + close', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000,
             dealTime: new Date('2024-01-15T09:00:00Z') }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 1.0, price: 1.1050,
             profit: new Decimal(50), dealTime: new Date('2024-01-15T10:00:00Z') }),
    ];

    const { trades } = reconstructTrades(deals);
    expect(trades).toHaveLength(1);

    const t = trades[0]!;
    expect(t.side).toBe('BUY');
    expect(t.status).toBe('CLOSED');
    expect(t.volume.toNumber()).toBe(1.0);
    expect(t.avgEntry.toFixed(4)).toBe('1.1000');
    expect(t.avgExit?.toFixed(4)).toBe('1.1050');
    expect(t.grossPnl.toNumber()).toBe(50);
    expect(t.netPnl.toNumber()).toBe(50);
    expect(t.dealTickets).toHaveLength(2);
  });

  it('includes commission and swap in netPnl', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000,
             commission: new Decimal(-7) }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 1.0, price: 1.1050,
             profit: new Decimal(50), commission: new Decimal(-7), swap: new Decimal(-2) }),
    ];

    const { trades } = reconstructTrades(deals);
    const t = trades[0]!;

    expect(t.grossPnl.toNumber()).toBe(50);
    expect(t.commission.toNumber()).toBe(-14);
    expect(t.swap.toNumber()).toBe(-2);
    expect(t.netPnl.toNumber()).toBe(34);  // 50 - 14 - 2
  });
});

// ─── 2. Simple short trade ────────────────────────────────────────────────────

describe('simple short trade', () => {
  it('reconstructs a SELL entry and BUY exit', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'SELL', entry: 'IN', volume: 0.5, price: 1.2000 }),
      deal({ positionId: pos, type: 'BUY', entry: 'OUT', volume: 0.5, price: 1.1900,
             profit: new Decimal(50) }),
    ];

    const { trades } = reconstructTrades(deals);
    const t = trades[0]!;
    expect(t.side).toBe('SELL');
    expect(t.status).toBe('CLOSED');
    expect(t.grossPnl.toNumber()).toBe(50);
  });
});

// ─── 3. Scale-in (multiple entries) ──────────────────────────────────────────

describe('scale-in', () => {
  it('computes weighted average entry across multiple IN deals', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 0.5, price: 1.1000 }),
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 0.25, price: 1.1020 }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 0.75, price: 1.1050,
             profit: new Decimal(37.50) }),
    ];

    const { trades } = reconstructTrades(deals);
    const t = trades[0]!;

    expect(t.volume.toNumber()).toBe(0.75);
    // avgEntry = (0.5*1.1000 + 0.25*1.1020) / 0.75 = (0.55 + 0.2755) / 0.75 = 0.8255 / 0.75 ≈ 1.10067
    expect(t.avgEntry.toFixed(5)).toBe(
      new Decimal(0.5).times(1.1000).plus(new Decimal(0.25).times(1.1020))
        .div(0.75).toFixed(5)
    );
    expect(t.grossPnl.toNumber()).toBe(37.5);
    expect(t.status).toBe('CLOSED');
  });
});

// ─── 4. Partial close ────────────────────────────────────────────────────────

describe('partial close', () => {
  it('handles two exit deals and sums their profits', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000 }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 0.5, price: 1.1040,
             profit: new Decimal(20) }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 0.5, price: 1.1060,
             profit: new Decimal(30) }),
    ];

    const { trades } = reconstructTrades(deals);
    const t = trades[0]!;

    expect(t.volume.toNumber()).toBe(1.0);
    expect(t.grossPnl.toNumber()).toBe(50);  // 20 + 30
    // avgExit = (0.5*1.1040 + 0.5*1.1060) / 1.0 = 1.1050
    expect(t.avgExit?.toFixed(4)).toBe('1.1050');
    expect(t.status).toBe('CLOSED');
  });

  it('is OPEN when exit volume < entry volume', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000 }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 0.5, price: 1.1040,
             profit: new Decimal(20) }),
    ];

    const { trades } = reconstructTrades(deals);
    expect(trades[0]!.status).toBe('OPEN');
  });
});

// ─── 5. Balance events ────────────────────────────────────────────────────────

describe('balance events', () => {
  it('separates BALANCE deals from trades', () => {
    const pos = nextPosition();
    const deals: RawDeal[] = [
      deal({ positionId: 0n, type: 'BALANCE', entry: 'IN', volume: 0, price: 0,
             profit: new Decimal(10000), comment: 'Deposit' }),
      deal({ positionId: pos, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000 }),
      deal({ positionId: pos, type: 'SELL', entry: 'OUT', volume: 1.0, price: 1.1050,
             profit: new Decimal(50) }),
    ];

    const { trades, balanceEvents } = reconstructTrades(deals);
    expect(trades).toHaveLength(1);
    expect(balanceEvents).toHaveLength(1);
    expect(balanceEvents[0]!.amount.toNumber()).toBe(10000);
  });
});

// ─── 6. Reconciliation formula ────────────────────────────────────────────────

describe('reconciliation', () => {
  it('deposits + Σ netPnl === account balance to the cent', () => {
    const pos1 = nextPosition();
    const pos2 = nextPosition();

    // Starting balance: 10 000 deposit
    // Trade 1: +50.00
    // Trade 2: -30.00
    // Expected final balance: 10 020.00
    const deals: RawDeal[] = [
      deal({ positionId: 0n, type: 'BALANCE', entry: 'IN', volume: 0, price: 0,
             profit: new Decimal('10000.00'), comment: 'Deposit' }),

      deal({ positionId: pos1, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000 }),
      deal({ positionId: pos1, type: 'SELL', entry: 'OUT', volume: 1.0, price: 1.1050,
             profit: new Decimal('50.00'), commission: new Decimal('0.00') }),

      deal({ positionId: pos2, type: 'SELL', entry: 'IN', volume: 0.5, price: 1.2000 }),
      deal({ positionId: pos2, type: 'BUY', entry: 'OUT', volume: 0.5, price: 1.2060,
             profit: new Decimal('-30.00'), commission: new Decimal('0.00') }),
    ];

    const { trades, balanceEvents } = reconstructTrades(deals);

    const totalDeposits = balanceEvents.reduce(
      (sum, e) => sum.plus(e.amount), new Decimal(0)
    );
    const totalNetPnl = trades.reduce(
      (sum, t) => sum.plus(t.netPnl), new Decimal(0)
    );

    const computedBalance = totalDeposits.plus(totalNetPnl);
    const expectedBalance = new Decimal('10020.00');

    expect(computedBalance.toFixed(2)).toBe(expectedBalance.toFixed(2));
  });
});

// ─── 7. Multiple independent positions ────────────────────────────────────────

describe('multiple positions', () => {
  it('reconstructs two separate positions correctly', () => {
    const pos1 = nextPosition();
    const pos2 = nextPosition();

    const deals: RawDeal[] = [
      deal({ positionId: pos1, type: 'BUY', entry: 'IN', volume: 1.0, price: 1.1000,
             dealTime: new Date('2024-01-15T09:00:00Z') }),
      deal({ positionId: pos2, type: 'SELL', entry: 'IN', volume: 0.5, price: 1.1050,
             dealTime: new Date('2024-01-15T09:30:00Z') }),
      deal({ positionId: pos1, type: 'SELL', entry: 'OUT', volume: 1.0, price: 1.1080,
             profit: new Decimal(80), dealTime: new Date('2024-01-15T10:00:00Z') }),
      deal({ positionId: pos2, type: 'BUY', entry: 'OUT', volume: 0.5, price: 1.1000,
             profit: new Decimal(25), dealTime: new Date('2024-01-15T11:00:00Z') }),
    ];

    const { trades } = reconstructTrades(deals);
    expect(trades).toHaveLength(2);
    expect(trades[0]!.positionId).toBe(pos1);
    expect(trades[0]!.side).toBe('BUY');
    expect(trades[0]!.grossPnl.toNumber()).toBe(80);
    expect(trades[1]!.positionId).toBe(pos2);
    expect(trades[1]!.side).toBe('SELL');
    expect(trades[1]!.grossPnl.toNumber()).toBe(25);
  });
});
