import { describe, expect, it } from 'vitest';
import { enrichPositions, riskTo } from '../enrich.js';
import { pointValues } from '../point-value.js';
import { lv, MON, H, M, pos } from './fixtures.js';

describe('risk and R', () => {
  it('risk = |entry − stop| × volume × value per point, losing side only', () => {
    expect(riskTo('LONG', 2000, 1995, 0.5, 100)).toBe(250);
    expect(riskTo('SHORT', 2000, 2004, 1, 100)).toBe(400);
    expect(riskTo('LONG', 2000, 2001, 1, 100)).toBeNull();
    expect(riskTo('LONG', 2000, 1995, 1, null)).toBeNull();
  });

  it('r from the stop at entry, stored R as a fallback, MAE/MFE in money', () => {
    const a = pos({ open: MON, net: 500, volume: 1 }); // +5 points on gold
    const b = pos({ open: MON + H, net: -300 });
    const c = pos({ open: MON + 2 * H, net: 100 });
    const o = pos({ open: MON + 3 * H, open_: true });
    const levels = new Map([
      [a.positionId, [lv({ at: MON, sl: 1995, source: 'order' }), lv({ at: MON + M, sl: 1990 })]],
      [o.positionId, [lv({ at: MON + 3 * H, sl: 1990, source: 'user' })]],
    ]);
    const exc = new Map([[a.positionId, { maePrice: 2, mfePrice: 7, maeMoney: null, mfeMoney: null, timeframe: '1m', bars: 30 }]]);
    const stored = new Map([[b.positionId, { r: -0.8, mae: null, mfe: null }], [c.positionId, { r: null, mae: 12, mfe: 40 }]]);
    const x = enrichPositions({ positions: [a, b, c, o], levels, excursions: exc, stored, pointValues: pointValues([a, b, c, o], 'USD') });
    expect(x.get(a.positionId)).toMatchObject({ r: 1, rFrom: 'stop', risk: 500, stop: 1995, stopSource: 'order', move: 'widened', mae: 200, mfe: 700 });
    expect(x.get(b.positionId)).toMatchObject({ r: -0.8, rFrom: 'stored', stop: null, move: null, mae: null });
    expect(x.get(c.positionId)).toMatchObject({ r: null, mae: 12, mfe: 40 });
    // Open: risk known, no R yet.
    expect(x.get(o.positionId)).toMatchObject({ r: null, risk: 1000, stop: 1990, stopSource: 'user' });
  });
});
