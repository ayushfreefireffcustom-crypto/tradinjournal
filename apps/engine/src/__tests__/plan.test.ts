import { describe, expect, it } from 'vitest';
import { planCopy, sizeBaseQty, type PlanInput } from '../plan.js';
import { applyFill } from '../position.js';

const BTC = { contractMultiplier: 0.001, qtyStep: 1, minQty: 1 };

function input(over: Partial<Omit<PlanInput, 'fill'>> & { fill?: Partial<PlanInput['fill']> } = {}): PlanInput {
  const { fill, ...rest } = over;
  return {
    sizingMode: 'MULTIPLIER',
    sizingValue: 1,
    copyReverse: false,
    leaderEquityUsd: 10_000,
    followerEquityUsd: 10_000,
    maxPositionUsd: null,
    followerPosition: 0,
    instrument: BTC,
    residual: 0,
    ...rest,
    fill: { side: 'BUY', qty: 10, price: 70_000, contractMultiplier: 0.001, ...fill },
  };
}

describe('sizeBaseQty', () => {
  const base = { fill: { side: 'BUY' as const, qty: 10, price: 50_000, contractMultiplier: 0.001 }, sizingValue: 1, leaderEquityUsd: 10_000, followerEquityUsd: 2_500 };
  it('scales proportionally to equity', () => {
    expect(sizeBaseQty({ ...base, sizingMode: 'PROPORTIONAL' }, 10).base).toBeCloseTo(0.0025);
  });
  it('multiplies the leader size', () => {
    expect(sizeBaseQty({ ...base, sizingMode: 'MULTIPLIER', sizingValue: 2 }, 10).base).toBeCloseTo(0.02);
  });
  it('spends a fixed notional, split across partial fills', () => {
    expect(sizeBaseQty({ ...base, sizingMode: 'FIXED_NOTIONAL', sizingValue: 500 }, 10).base).toBeCloseTo(0.01);
    expect(sizeBaseQty({ ...base, sizingMode: 'FIXED_NOTIONAL', sizingValue: 500 }, 5).base).toBeCloseTo(0.005);
  });
  it('explains why it is zero', () => {
    expect(sizeBaseQty({ ...base, sizingMode: 'PROPORTIONAL', leaderEquityUsd: 0 }, 10)).toEqual({ base: 0, reason: 'leader equity unknown' });
    expect(sizeBaseQty({ ...base, sizingMode: 'PROPORTIONAL', followerEquityUsd: 0 }, 10).reason).toMatch(/no equity/);
    expect(sizeBaseQty({ ...base, sizingMode: 'MULTIPLIER', sizingValue: 0 }, 10).reason).toMatch(/above zero/);
  });
});

describe('planCopy: opening', () => {
  it('opens the scaled size', () => {
    expect(planCopy(input({ fill: { positionAfter: 10 } }))).toEqual({ legs: [{ kind: 'OPEN', side: 'BUY', qty: 10, reduceOnly: false }], residual: 0 });
  });

  it('opens without position info too', () => {
    expect(planCopy(input()).legs).toEqual([{ kind: 'OPEN', side: 'BUY', qty: 10, reduceOnly: false }]);
  });

  it('reverses the side when copying in reverse', () => {
    expect(planCopy(input({ copyReverse: true, fill: { positionAfter: 10 } })).legs[0]).toMatchObject({ kind: 'OPEN', side: 'SELL' });
  });

  it('carries small sizes instead of dropping them (G3)', () => {
    let residual = 0;
    let sent = 0;
    let pos = 0;
    // Leader adds 1 contract five times; follower is a third of the size.
    for (let i = 1; i <= 5; i++) {
      const p = planCopy(input({ sizingValue: 1 / 3, residual, followerPosition: sent, fill: { qty: 1, positionAfter: i } }));
      residual = p.residual;
      for (const l of p.legs) sent += l.qty;
      pos = i;
    }
    expect(pos).toBe(5);
    expect(sent + residual).toBeCloseTo(5 / 3);
    expect(sent).toBe(2);
  });

  it('caps the resulting position, not each order (G6)', () => {
    // $1,400 cap at $70k = 0.02 BTC = 20 contracts; already holding 15.
    const p = planCopy(input({ maxPositionUsd: 1400, followerPosition: 15, fill: { qty: 10, positionAfter: 25 } }));
    expect(p.legs).toEqual([{ kind: 'OPEN', side: 'BUY', qty: 5, reduceOnly: false }]);
    const full = planCopy(input({ maxPositionUsd: 1400, followerPosition: 20, fill: { qty: 10, positionAfter: 30 } }));
    expect(full).toMatchObject({ legs: [], skipReason: 'max position size reached' });
  });

  it('skips with a reason when the size rounds below one contract', () => {
    expect(planCopy(input({ sizingValue: 0.04, fill: { qty: 10, positionAfter: 10 } }))).toEqual({ legs: [], residual: 0.4, skipReason: 'size rounded below one contract (carried to the next fill)' });
  });
});

describe('planCopy: closing (G4)', () => {
  it('closes everything when the leader closes everything', () => {
    // Leader long 10 sells 10; follower holds 7 (smaller account).
    const p = planCopy(input({ followerPosition: 7, residual: 0.3, fill: { side: 'SELL', qty: 10, positionAfter: 0 } }));
    expect(p).toEqual({ legs: [{ kind: 'CLOSE', side: 'SELL', qty: 7, reduceOnly: true }], residual: 0 });
  });

  it('closes the same share on a partial close', () => {
    const p = planCopy(input({ followerPosition: 8, fill: { side: 'SELL', qty: 5, positionAfter: 5 } }));
    expect(p.legs).toEqual([{ kind: 'CLOSE', side: 'SELL', qty: 4, reduceOnly: true }]);
  });

  it('closes then opens the remainder when the leader flips', () => {
    // Leader long 10 sells 15 → short 5. Follower long 10 at the same scale.
    const p = planCopy(input({ followerPosition: 10, fill: { side: 'SELL', qty: 15, positionAfter: -5 } }));
    expect(p.legs).toEqual([
      { kind: 'CLOSE', side: 'SELL', qty: 10, reduceOnly: true },
      { kind: 'OPEN', side: 'SELL', qty: 5, reduceOnly: false },
    ]);
  });

  it('never over-closes a smaller follower position', () => {
    const p = planCopy(input({ followerPosition: 2, sizingValue: 3, fill: { side: 'SELL', qty: 3, positionAfter: 7 } }));
    expect(p.legs[0]!.qty).toBeLessThanOrEqual(2);
  });

  it('only reduces when the leader side is unknown and the follower is opposite', () => {
    const p = planCopy(input({ followerPosition: 6, fill: { side: 'SELL', qty: 10 } }));
    expect(p.legs).toEqual([{ kind: 'CLOSE', side: 'SELL', qty: 6, reduceOnly: true }]);
  });

  it('skips a leader close when the follower has nothing open', () => {
    expect(planCopy(input({ followerPosition: 0, fill: { side: 'SELL', qty: 10, positionAfter: 0 } }))).toMatchObject({ legs: [], skipReason: 'nothing to close on the follower account' });
  });

  it('reduces a stale opposite position without opening when the leader opens', () => {
    // Follower short 3 (drift); leader opens long 10 from flat.
    const p = planCopy(input({ followerPosition: -3, fill: { side: 'BUY', qty: 10, positionAfter: 10 } }));
    expect(p.legs).toEqual([{ kind: 'CLOSE', side: 'BUY', qty: 3, reduceOnly: true }]);
  });
});

describe('a full round trip stays in step with the leader', () => {
  it('opens, adds, trims, flips and closes to flat', () => {
    // Follower at half size.
    const leaderFills: Array<{ side: 'BUY' | 'SELL'; qty: number; after: number }> = [
      { side: 'BUY', qty: 4, after: 4 },
      { side: 'BUY', qty: 3, after: 7 },
      { side: 'SELL', qty: 2, after: 5 },
      { side: 'SELL', qty: 9, after: -4 },
      { side: 'BUY', qty: 4, after: 0 },
    ];
    let pos = 0;
    let residual = 0;
    for (const f of leaderFills) {
      const p = planCopy(input({ sizingValue: 0.5, followerPosition: pos, residual, fill: { side: f.side, qty: f.qty, positionAfter: f.after } }));
      residual = p.residual;
      for (const l of p.legs) pos += l.side === 'BUY' ? l.qty : -l.qty;
    }
    expect(pos).toBe(0);
  });
});

describe('applyFill (ported)', () => {
  it('averages entries, realizes on reduce, flips at the fill price', () => {
    const a = applyFill(null, 'BUY', 10, 100, 0.001);
    const b = applyFill(a, 'BUY', 10, 110, 0.001);
    expect(b.avgEntry).toBe(105);
    const c = applyFill(b, 'SELL', 5, 115, 0.001);
    expect(c.realizedDelta).toBeCloseTo(0.05);
    const d = applyFill(c, 'SELL', 20, 100, 0.001);
    expect(d).toMatchObject({ side: 'SHORT', qty: 5, avgEntry: 100 });
    const e = applyFill(d, 'BUY', 5, 90, 0.001);
    expect(e).toMatchObject({ closed: true, qty: 0 });
    expect(e.realizedDelta).toBeCloseTo(0.05);
  });
});
