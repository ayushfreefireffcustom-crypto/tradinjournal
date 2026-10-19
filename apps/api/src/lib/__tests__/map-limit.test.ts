import { describe, it, expect } from 'vitest';
import { mapLimit } from '../map-limit.js';

describe('mapLimit', () => {
  it('keeps order and never exceeds the limit', async () => {
    let running = 0, peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (x) => {
      running++; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, x));
      running--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(peak).toBe(2);
  });
  it('handles empty input and propagates errors', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
    await expect(mapLimit([1, 2], 2, async x => { if (x === 2) throw new Error('no'); return x; })).rejects.toThrow('no');
  });
});
