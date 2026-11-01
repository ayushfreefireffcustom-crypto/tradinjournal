import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

describe('squarify', () => {
  it('fills the box exactly, with areas proportional to weight', () => {
    const items = [6, 6, 4, 3, 2, 2, 1];
    const out = squarify(items, (x) => x, { x: 0, y: 0, w: 600, h: 400 });
    expect(out).toHaveLength(7);
    const total = out.reduce((s, o) => s + o.rect.w * o.rect.h, 0);
    expect(total).toBeCloseTo(600 * 400);
    for (const o of out) expect((o.rect.w * o.rect.h) / (600 * 400)).toBeCloseTo(o.item / 24);
    for (const o of out) {
      expect(o.rect.x).toBeGreaterThanOrEqual(-1e-6);
      expect(o.rect.y).toBeGreaterThanOrEqual(-1e-6);
      expect(o.rect.x + o.rect.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(o.rect.y + o.rect.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it('keeps tiles reasonably square', () => {
    const out = squarify(Array.from({ length: 30 }, (_, i) => 30 - i), (x) => x, { x: 0, y: 0, w: 900, h: 500 });
    const worst = Math.max(...out.map((o) => Math.max(o.rect.w / o.rect.h, o.rect.h / o.rect.w)));
    expect(worst).toBeLessThan(5);
  });
  it('ignores zero weights and empty boxes', () => {
    expect(squarify([0, 0], (x) => x, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
    expect(squarify([1], (x) => x, { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });
});
