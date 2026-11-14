import { describe, expect, it } from 'vitest';
import { axisMoney, firstParagraph, fmtAi, kmoney, money, nextSession, pct, rfmt, spct, ticks } from './dashboard-v2-format';

describe('dashboard v2 format', () => {
  it('money', () => {
    expect(money(9308)).toBe('+$9,308');
    expect(money(-2601.4)).toBe('−$2,601');
    expect(money(34308, { plus: false })).toBe('$34,308');
    expect(money(-0.2)).toBe('$0');
  });
  it('kmoney', () => {
    expect(kmoney(-4700)).toBe('−$4.7k');
    expect(kmoney(570)).toBe('+$570');
    expect(kmoney(1_250_000)).toBe('+$1.3M');
  });
  it('pct, spct, R', () => {
    expect(pct(0.372, 1)).toBe('37.2%');
    expect(spct(-0.081)).toBe('−8.1%');
    expect(rfmt(0.29)).toBe('+0.29R');
    expect(rfmt(-1.25)).toBe('−1.25R');
  });
  it('AI line values', () => {
    expect(fmtAi({ text: 'x', value: -8530, fmt: 'money', tone: 'dn', trades: 3 })).toBe('−$8,530');
    expect(fmtAi({ text: 'x', value: 60, fmt: 'int', tone: 'dn', trades: 3 })).toBe('60');
    expect(fmtAi({ text: 'x', value: 0.8, fmt: 'r', tone: 'up', trades: 3 })).toBe('+0.80R');
    expect(fmtAi({ text: 'x', value: null, fmt: 'text', tone: 'flat', trades: 0 })).toBe('');
  });
  it('ticks and axis labels', () => {
    expect(ticks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(ticks(24_000, 36_000, 4)).toEqual([25_000, 30_000, 35_000]);
    expect(axisMoney(35_000)).toBe('35k');
    expect(axisMoney(-2_000)).toBe('−2k');
  });
  it('next session skips weekends (UTC)', () => {
    expect(nextSession(Date.UTC(2026, 10, 13, 12))).toBe('Mon 16 Nov'); // Fri → Mon
    expect(nextSession(Date.UTC(2026, 10, 10, 12))).toBe('Wed 11 Nov');
  });
  it('first paragraph of a coach reply', () => {
    expect(firstParagraph('**Short** answer.\n\nMore detail here.')).toBe('Short answer.');
    const long = 'word '.repeat(200);
    expect(firstParagraph(long, 50).length).toBeLessThanOrEqual(51);
  });
});
