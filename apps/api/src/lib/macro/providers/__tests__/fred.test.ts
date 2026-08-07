import { describe, it, expect } from 'vitest';
import { parseFredObservations, computeNetLiquidity } from '../fred.js';
import type { NormalizedMacroIndicator } from '../../types.js';

describe('parseFredObservations', () => {
  const def = { id: 'UNRATE', label: 'Unemployment Rate', unit: '%' };

  it('takes the latest observation and stamps prev from the prior', () => {
    const row = parseFredObservations(def, [
      { date: '2026-07-01', value: '4.1' },
      { date: '2026-06-01', value: '4.0' },
    ]);
    expect(row).toEqual({
      key: 'UNRATE',
      label: 'Unemployment Rate',
      value: 4.1,
      prev: 4.0,
      unit: '%',
      source: 'fred',
      asOf: new Date('2026-07-01T00:00:00.000Z'),
    });
  });

  it('skips missing "." values', () => {
    const row = parseFredObservations(def, [
      { date: '2026-07-01', value: '.' },
      { date: '2026-06-01', value: '4.0' },
    ]);
    expect(row?.value).toBe(4.0);
    expect(row?.prev).toBeNull();
  });

  it('returns null when every observation is missing', () => {
    expect(parseFredObservations(def, [{ date: '2026-07-01', value: '.' }])).toBeNull();
    expect(parseFredObservations(def, [])).toBeNull();
  });
});

describe('computeNetLiquidity', () => {
  function ind(key: string, value: number, prev: number | null, asOf: string): NormalizedMacroIndicator {
    return {
      key,
      label: key,
      value,
      prev,
      unit: 'mn $',
      source: 'fred',
      asOf: new Date(asOf),
    };
  }

  it('computes WALCL − TGA − RRP(bn→mn)', () => {
    const parts = new Map([
      ['WALCL', ind('WALCL', 7_000_000, 6_900_000, '2026-08-06T00:00:00.000Z')],
      ['WTREGEN', ind('WTREGEN', 800_000, 750_000, '2026-08-05T00:00:00.000Z')],
      ['RRPONTSYD', ind('RRPONTSYD', 200, 250, '2026-08-06T00:00:00.000Z')], // bn
    ]);
    const net = computeNetLiquidity(parts);
    expect(net).not.toBeNull();
    // 7_000_000 - 800_000 - 200*1000 = 6_000_000
    expect(net!.value).toBe(6_000_000);
    // prev: 6_900_000 - 750_000 - 250*1000 = 5_900_000
    expect(net!.prev).toBe(5_900_000);
    expect(net!.key).toBe('NET_LIQUIDITY');
    // oldest component asOf
    expect(net!.asOf.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('returns null when any component is missing', () => {
    const parts = new Map([['WALCL', ind('WALCL', 1, null, '2026-08-06T00:00:00.000Z')]]);
    expect(computeNetLiquidity(parts)).toBeNull();
  });
});
