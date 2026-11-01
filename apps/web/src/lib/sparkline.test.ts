import { describe, expect, it } from 'vitest';
import { sparkGeometry } from './sparkline';

describe('sparkGeometry', () => {
  it('scales the series into the box, inside the padding', () => {
    const g = sparkGeometry([1, 3, 2], 100, 20)!;
    expect(g.line).toBe('M2 18 L50 2 L98 10');
    expect(g.area).toBe('M2 18 L50 2 L98 10 L98 20 L2 20Z');
    expect(g.dir).toBe('up');
    expect(g.zeroY).toBeNull();
  });
  it('needs two usable points and a real box', () => {
    expect(sparkGeometry([], 100, 20)).toBeNull();
    expect(sparkGeometry([5], 100, 20)).toBeNull();
    expect(sparkGeometry([5, NaN, Infinity], 100, 20)).toBeNull();
    expect(sparkGeometry([1, 2], 0, 20)).toBeNull();
  });
  it('drops gaps instead of drawing to zero', () => {
    expect(sparkGeometry([1, NaN, 3], 100, 20)!.line).toBe('M2 18 L98 2');
  });
  it('draws a flat series through the middle, uncoloured', () => {
    const g = sparkGeometry([4, 4, 4], 100, 20)!;
    expect(g.line).toBe('M2 10 L50 10 L98 10');
    expect(g.dir).toBe('flat');
  });
  it('keeps zero in range and colours by the last value with `zero`', () => {
    const g = sparkGeometry([5, 10, -5], 100, 32, { zero: true })!;
    expect(g.zeroY).toBe(20.7);
    expect(g.dir).toBe('down');
    const pos = sparkGeometry([2, 4], 100, 32, { zero: true })!;
    expect(pos.zeroY).toBe(30); // 0 is the low end
    expect(pos.dir).toBe('up');
    expect(sparkGeometry([3, 1], 100, 32)!.dir).toBe('down');
  });
});
