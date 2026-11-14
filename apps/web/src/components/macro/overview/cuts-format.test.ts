import { describe, expect, it } from 'vitest';
import { cumulativeDelta, cumulativeWord, meetingOutcome, segments } from './cuts-format';

describe('cuts by meeting format', () => {
  it('names the most likely outcome', () => {
    expect(meetingOutcome({ cutPct: 62, holdPct: 38, hikePct: 0 })).toEqual({ word: 'cut', pct: 62 });
    expect(meetingOutcome({ cutPct: 0, holdPct: 26.5, hikePct: 73.5 })).toEqual({ word: 'hike', pct: 74 });
    expect(meetingOutcome({ cutPct: 50, holdPct: 50, hikePct: 0 })).toEqual({ word: 'hold', pct: 50 });
    expect(meetingOutcome({ cutPct: 0, holdPct: 100, hikePct: 0 })).toEqual({ word: 'hold', pct: 100 });
  });
  it('words cumulative moves', () => {
    expect(cumulativeWord(0.6)).toBe('0.6 cuts');
    expect(cumulativeWord(1)).toBe('1.0 cut');
    expect(cumulativeWord(-1.12)).toBe('1.1 hikes');
    expect(cumulativeWord(-0.98)).toBe('1.0 hike');
    expect(cumulativeWord(0.02)).toBe('none');
  });
  it('gives the prior-session change only when it shows', () => {
    expect(cumulativeDelta({ cumulativeCuts: -1.12, cumulativeCutsYesterday: -1.15 })).toBe(0.03);
    expect(cumulativeDelta({ cumulativeCuts: 0.5, cumulativeCutsYesterday: 0.5 })).toBeNull();
    expect(cumulativeDelta({ cumulativeCuts: 0.5, cumulativeCutsYesterday: null })).toBeNull();
  });
  it('bar segments add up to 100', () => {
    expect(segments({ cutPct: 60, holdPct: 40, hikePct: 0 })).toEqual({ cut: 60, hold: 40, hike: 0 });
    expect(segments({ cutPct: 0, holdPct: 26.5, hikePct: 73.5 })).toEqual({ cut: 0, hold: 26.5, hike: 73.5 });
    const s = segments({ cutPct: 70, holdPct: 0, hikePct: 40 });
    expect(s.cut + s.hold + s.hike).toBe(100);
  });
});
