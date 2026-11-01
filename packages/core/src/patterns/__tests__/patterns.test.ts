import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { detectPatterns, zigzag, type PatternKind } from '../index.js';

/** Candles along straight legs between [bars from start, price] waypoints, with a little wiggle. */
function path(points: Array<[number, number]>, wiggle = 0.3): Candle[] {
  const closes: number[] = [];
  for (let k = 1; k < points.length; k++) {
    const [i0, p0] = points[k - 1]!;
    const [i1, p1] = points[k]!;
    for (let i = i0; i < i1; i++) closes.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0));
  }
  closes.push(points[points.length - 1]![1]);
  return closes.map((c, i) => ({ openTime: i * 3_600_000, open: i ? closes[i - 1]! : c, high: c + wiggle, low: c - wiggle, close: c, volume: 100 }));
}
const find = (c: Candle[], kind: PatternKind) => detectPatterns(c).patterns.find((p) => p.kind === kind);
const kinds = (c: Candle[]) => detectPatterns(c).patterns.map((p) => p.kind);

describe('zigzag', () => {
  it('marks swing highs and lows once price turns back far enough', () => {
    const c = path([[0, 100], [20, 120], [35, 105], [50, 125]]);
    const z = zigzag(c);
    expect(z.map((p) => `${p.high ? 'H' : 'L'}${p.i}${p.confirmed ? '' : '?'}`)).toEqual(['L0', 'H20', 'L35', 'H50?']);
    expect(z[1]!.price).toBeCloseTo(120.3);
  });
  it('ignores wiggles smaller than the swing', () => {
    // Bars span 0.6; a 0.3 drift never reaches 2 ATRs.
    const c = path([[0, 100], [10, 100.3], [20, 100], [30, 100.3], [40, 100]]);
    expect(zigzag(c).filter((p) => p.confirmed)).toHaveLength(0);
  });
});

describe('double top and bottom', () => {
  const top = path([[0, 70], [25, 100], [37, 88], [49, 100.3], [64, 85]]);
  it('finds two matching peaks and confirms on a close below the neckline', () => {
    const p = find(top, 'double_top')!;
    expect(p).toBeTruthy();
    expect(p).toMatchObject({ bias: 'bearish', status: 'confirmed' });
    expect(p.breakout!).toBeCloseTo(87.7, 1); // the dip's low
    expect(p.invalidation!).toBeCloseTo(100.6, 1);
    expect(p.target!).toBeCloseTo(87.7 - (100.6 - 87.7), 1);
    expect(p.points.map((x) => x.label)).toEqual(['Peak 1', 'Neckline', 'Peak 2']);
    expect(p.lines[0]!.role).toBe('neckline');
  });
  it('is still forming above the neckline, and gone once price clears the peaks', () => {
    expect(find(path([[0, 70], [25, 100], [37, 88], [49, 100.3], [56, 93]]), 'double_top')?.status).toBe('forming');
    expect(find(path([[0, 70], [25, 100], [37, 88], [49, 100.3], [55, 96], [62, 106]]), 'double_top')).toBeUndefined();
  });
  it('drops a confirmed pattern once price closes back through the peaks', () => {
    expect(find(path([[0, 70], [25, 100], [37, 88], [49, 100.3], [64, 85], [80, 104]]), 'double_top')).toBeUndefined();
  });
  it('needs a real dip and similar peaks', () => {
    expect(find(path([[0, 70], [25, 100], [32, 98.5], [39, 100.2], [50, 85]]), 'double_top')).toBeUndefined(); // dip too shallow
    expect(find(path([[0, 70], [25, 100], [37, 88], [49, 96], [64, 80]]), 'double_top')).toBeUndefined(); // second peak far lower
  });
  it('mirrors for a double bottom and spots a hit target', () => {
    const p = find(path([[0, 130], [25, 100], [37, 112], [49, 99.8], [64, 128]]), 'double_bottom')!;
    expect(p).toMatchObject({ bias: 'bullish', status: 'target_hit' });
    expect(p.target!).toBeCloseTo(112.3 + (112.3 - 99.5), 0);
  });
});

describe('lines: channels, ranges, triangles, wedges', () => {
  it('ascending triangle: flat top, rising lows', () => {
    const p = find(path([[0, 80], [10, 110], [20, 90], [30, 110], [40, 97], [50, 110], [58, 103], [62, 106]]), 'ascending_triangle')!;
    expect(p).toMatchObject({ family: 'triangle', bias: 'bullish', status: 'forming' });
    expect(p.lines.map((l) => l.role)).toEqual(['upper', 'lower']);
    expect(p.breakout!).toBeCloseTo(110.3, 0);
  });
  it('symmetrical triangle breaking down', () => {
    const p = find(path([[0, 130], [10, 120], [20, 90], [30, 114], [40, 96], [50, 108], [58, 102], [64, 92]]), 'symmetrical_triangle')!;
    expect(p).toMatchObject({ bias: 'neutral', status: 'broke_down' });
  });
  it('descending triangle: flat bottom, falling highs', () => {
    expect(find(path([[0, 120], [10, 90], [20, 116], [30, 90], [40, 108], [50, 90], [58, 101], [62, 96]]), 'descending_triangle')).toMatchObject({ bias: 'bearish' });
  });
  it('rising and falling wedges', () => {
    expect(find(path([[0, 85], [10, 100], [20, 92], [30, 108], [40, 101], [50, 113], [60, 109], [64, 111]]), 'rising_wedge')).toMatchObject({ bias: 'bearish', family: 'wedge' });
    expect(find(path([[0, 125], [10, 110], [20, 118], [30, 102], [40, 109], [50, 97], [60, 101], [64, 99]]), 'falling_wedge')).toMatchObject({ bias: 'bullish', family: 'wedge' });
  });
  it('channels and ranges', () => {
    expect(find(path([[0, 95], [10, 110], [20, 100], [30, 120], [40, 110], [50, 130], [60, 120], [64, 124]]), 'ascending_channel')).toMatchObject({ family: 'channel', status: 'forming', target: null });
    expect(find(path([[0, 135], [10, 120], [20, 130], [30, 110], [40, 120], [50, 100], [60, 110], [64, 106]]), 'descending_channel')).toBeTruthy();
    const r = find(path([[0, 90], [10, 110], [20, 100], [30, 110.4], [40, 99.7], [50, 109.8], [60, 100.2], [64, 104]]), 'range')!;
    expect(r).toMatchObject({ family: 'channel', bias: 'neutral' });
  });
  it('drops a breakout that reverses through the far line', () => {
    expect(find(path([[0, 130], [10, 120], [20, 90], [30, 114], [40, 96], [50, 108], [58, 102], [64, 92], [76, 118]]), 'symmetrical_triangle')).toBeUndefined();
  });
  it('does not call a broadening shape a triangle', () => {
    const k = kinds(path([[0, 100], [10, 104], [20, 96], [30, 108], [40, 92], [50, 112], [60, 88], [64, 95]]));
    expect(k.some((x) => /triangle|wedge|channel|range/.test(x))).toBe(false);
  });
});

describe('flags', () => {
  it('bull flag: steep pole, shallow pause drifting down', () => {
    const p = find(path([[0, 100], [30, 100.5], [38, 130], [44, 126], [48, 128], [52, 124.5], [56, 126.5], [58, 125]]), 'bull_flag')!;
    expect(p).toBeTruthy();
    expect(p.lines.map((l) => l.role)).toEqual(['pole', 'upper', 'lower']);
    expect(p.target! - p.breakout!).toBeCloseTo(130.3 - 100.2, 0); // pole height from the breakout
    expect(p.status).toBe('forming');
  });
  it('a pause that gives back more than half the pole is not a flag', () => {
    expect(find(path([[0, 100], [30, 100.5], [38, 130], [48, 110], [56, 114]]), 'bull_flag')).toBeUndefined();
  });
  it('bear flag mirrors it', () => {
    expect(find(path([[0, 130], [30, 129.5], [38, 100], [44, 104], [48, 102], [52, 105.5], [56, 103.5], [58, 105]]), 'bear_flag')).toMatchObject({ bias: 'bearish' });
  });
});

describe('levels', () => {
  it('turns repeated pivots into support and resistance around price', () => {
    const c = path([[0, 100], [10, 120], [20, 100.2], [30, 119.8], [40, 99.9], [50, 120.1], [58, 110]]);
    const { patterns } = detectPatterns(c);
    const res = patterns.find((p) => p.kind === 'resistance')!;
    const sup = patterns.find((p) => p.kind === 'support')!;
    expect(res.breakout!).toBeCloseTo(120.3, 0);
    expect(res.touches).toBe(3);
    expect(sup.breakout!).toBeCloseTo(99.8, 0);
  });
  it('needs at least 30 bars', () => {
    expect(detectPatterns(path([[0, 100], [20, 110]])).patterns).toEqual([]);
  });
});
