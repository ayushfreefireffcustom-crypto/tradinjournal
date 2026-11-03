import { describe, expect, it } from 'vitest';
import { packRows } from './pack-rows';

const S = { a: 12, b: 5, c: 7, d: 7, e: 5, f: 6 } as const;

describe('packRows', () => {
  it('leaves rows that already fill alone', () => {
    expect(packRows(['a', 'b', 'c'], S)).toEqual({ a: 12, b: 5, c: 7 });
  });
  it('stretches the last card of a row the next card does not fit in', () => {
    // 7 then 7: the first 7 can't share a row with the second, so it takes the full row.
    expect(packRows(['c', 'd', 'e'], S)).toEqual({ c: 12, d: 7, e: 5 });
    // 5 + 6 = 11: the 6 stretches to 7 when a 12 follows.
    expect(packRows(['b', 'f', 'a'], S)).toEqual({ b: 5, f: 7, a: 12 });
  });
  it('fills the final row', () => {
    expect(packRows(['a', 'b'], S)).toEqual({ a: 12, b: 12 });
  });
});
