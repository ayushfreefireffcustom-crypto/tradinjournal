import { describe, it, expect } from 'vitest';
import type { Deal } from '@tradinjournal/types';
import { dealToExecution } from '../sync.mapping.js';
import { planNormalization } from '../server-time.sync.js';

const NY_CLOSE = { zone: 'America/New_York', shiftMin: 420 };
const deal = (dealTime: string): Deal => ({
  dealTicket: '1', orderTicket: '1', positionId: '1', symbol: 'EURUSD', type: 'BUY', entry: 'IN', volume: '0.1',
  price: '1.1', profit: '0', commission: '0', swap: '0', fee: '0', dealTime, comment: '',
});

describe('dealToExecution', () => {
  it('stores raw server time with no model', () => {
    const r = dealToExecution('a', deal('2026-07-15T12:00:00.000Z'));
    expect((r.dealTime as Date).toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(r.serverOffsetMin).toBeNull();
  });
  it('stores real UTC and the applied offset with a model', () => {
    const summer = dealToExecution('a', deal('2026-07-15T12:00:00.000Z'), NY_CLOSE);
    expect((summer.dealTime as Date).toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(summer.serverOffsetMin).toBe(180);
    const winter = dealToExecution('a', deal('2026-01-15T12:00:00.000Z'), NY_CLOSE);
    expect((winter.dealTime as Date).toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(winter.serverOffsetMin).toBe(120);
  });
});

describe('planNormalization', () => {
  const row = (id: string, iso: string, serverOffsetMin: number | null) => ({ id, dealTime: new Date(iso), serverOffsetMin });

  it('groups raw rows by the shift their date needs', () => {
    const groups = planNormalization([
      row('w1', '2026-01-15T12:00:00Z', null),
      row('w2', '2026-02-01T08:00:00Z', null),
      row('s1', '2026-07-15T12:00:00Z', null),
    ], NY_CLOSE);
    expect(groups).toEqual(expect.arrayContaining([
      { from: null, to: 120, ids: ['w1', 'w2'] },
      { from: null, to: 180, ids: ['s1'] },
    ]));
    expect(groups).toHaveLength(2);
  });

  it('skips rows already converted correctly — re-running changes nothing', () => {
    expect(planNormalization([row('a', '2026-07-15T09:00:00Z', 180), row('b', '2026-01-15T10:00:00Z', 120)], NY_CLOSE)).toEqual([]);
  });

  it('re-converts from the recovered wall clock after a model correction, never double-shifting', () => {
    // Converted as fixed GMT+2, but the server is New York close: a summer deal needed +3.
    const [g] = planNormalization([row('a', '2026-07-15T10:00:00Z', 120)], NY_CLOSE);
    expect(g).toEqual({ from: 120, to: 180, ids: ['a'] });
    // wall = 10:00 + 2h = 12:00 server → 09:00Z: a −60 min move from what is stored.
  });
});
