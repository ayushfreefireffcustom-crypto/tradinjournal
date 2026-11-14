import { describe, expect, it } from 'vitest';
import { hitTest, overlaps, placeLabels, placeTags, type Area, type LabelIn } from './label-layout';

const area: Area = { width: 600, plotTop: 24, plotBottom: 340, lane1: 391, lane2: 362 };
const L = (p: Partial<LabelIn> & { id: string }): LabelIn => ({
  prio: 5, ax: 300, ay: 200, w: 100, h: 17, region: 'plot',
  cands: [{ dx: 0, dy: -12, align: 'center' }, { dx: 0, dy: 14, align: 'center' }], ...p,
});

describe('placeLabels', () => {
  it('never lets two labels overlap and keeps the more important one', () => {
    const { placed, dropped } = placeLabels([
      L({ id: 'note', prio: 4, cands: [{ dx: 0, dy: -12, align: 'center' }] }),
      L({ id: 'open', prio: 0, cands: [{ dx: 0, dy: -12, align: 'center' }] }),
    ], area);
    expect(placed.map(p => p.id)).toEqual(['open']);
    expect(dropped).toEqual(['note']);
  });
  it('tries the next spot, then the short text', () => {
    const r = placeLabels([
      L({ id: 'a', prio: 0 }),
      L({ id: 'b', prio: 1 }),
      L({ id: 'c', prio: 2, w: 300, sw: 30, cands: [{ dx: 0, dy: -12, align: 'center' }, { dx: 60, dy: 14, align: 'left' }] }),
    ], area);
    const boxes = r.placed.map(p => p.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!, 0)).toBe(false);
    expect(r.placed.find(p => p.id === 'b')!.box.y).toBeGreaterThan(200);
    expect(r.placed.find(p => p.id === 'c')?.short).toBe(true);
  });
  it('keeps labels inside the pane and out of the legend and lane', () => {
    const { placed, dropped } = placeLabels([L({ id: 'edge', ax: 590, w: 120 }), L({ id: 'top', ay: 5, cands: [{ dx: 0, dy: -12, align: 'center' }] })], area);
    const edge = placed.find(p => p.id === 'edge')!.box;
    expect(edge.x + edge.w).toBeLessThanOrEqual(598);
    expect(dropped).toContain('top');
  });
  it('puts lane labels on their row', () => {
    const { placed } = placeLabels([L({ id: 'cpi', region: 'lane1', ay: 0 })], area);
    expect(placed[0]!.box.y + placed[0]!.box.h / 2).toBe(391);
  });
});

describe('placeTags', () => {
  it('nudges tags off each other and off the live price', () => {
    const m = placeTags([
      { id: 'tp', prio: 2, y: 100, h: 18 },
      { id: 'e', prio: 1, y: 104, h: 18 },
      { id: 'sl', prio: 0, y: 200, h: 18 },
    ], 400, [{ y0: 190, y1: 228 }]);
    const e = m.get('e')!, tp = m.get('tp')!, sl = m.get('sl')!;
    expect(Math.abs(e - tp)).toBeGreaterThanOrEqual(18);
    expect(sl + 9 <= 190 || sl - 9 >= 228).toBe(true);
  });
  it('drops a tag it cannot fit', () => {
    const m = placeTags([{ id: 'x', prio: 0, y: 100, h: 18 }], 400, [{ y0: 40, y1: 160 }], 20);
    expect(m.has('x')).toBe(false);
  });
});

it('finds the nearest marker for a tap', () => {
  expect(hitTest([{ x: 10, y: 10, t: 'a' }, { x: 30, y: 10, t: 'b' }], 27, 12)?.t).toBe('b');
  expect(hitTest([{ x: 10, y: 10 }], 100, 100)).toBeNull();
});
