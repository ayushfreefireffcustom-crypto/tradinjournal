import { describe, expect, it } from 'vitest';
import { axisMoney, firstParagraph, fmtAi, isFlat, kmoney, money, nextSession, pct, plural, rfmt, spct, ticks, tone, toneColor } from './dashboard-v2-format';

describe('dashboard v2 format', () => {
  it('money', () => {
    expect(money(9308)).toBe('+$9,308');
    expect(money(-2601.4)).toBe('−$2,601');
    expect(money(34308, { plus: false })).toBe('$34,308');
    // A non-zero value never reads "$0": cents below 50c, and no sign or colour at a true 0.
    expect(money(-0.2)).toBe('−$0.20');
    expect(money(-0.08)).toBe('−$0.08');
    expect(money(0.004)).toBe('$0');
    expect(money(-0.001)).toBe('$0');
    expect(money(-0.6)).toBe('−$1');
    expect(money(-0.08, { dec: 2 })).toBe('−$0.08');
  });
  it('zero is neutral', () => {
    expect(tone(-0.08)).toBe('dn');
    expect(tone(-0.004)).toBe('');
    expect(tone(0)).toBe('');
    expect(tone(null)).toBe('');
    expect(tone(12)).toBe('up');
    expect(isFlat(-0.004)).toBe(true);
    expect(isFlat(-0.08)).toBe(false);
    expect(toneColor(-0.001, 'g', 'r', 'n')).toBe('n');
    expect(toneColor(-0.08, 'g', 'r', 'n')).toBe('r');
    expect(spct(-0.0001)).toBe('0.0%');
    expect(rfmt(-0.001)).toBe('0.00R');
  });
  it('kmoney', () => {
    expect(kmoney(-4700)).toBe('−$4.7k');
    expect(kmoney(570)).toBe('+$570');
    expect(kmoney(1_250_000)).toBe('+$1.3M');
    expect(kmoney(-0.08)).toBe('−$0.08');
    expect(kmoney(-0.003)).toBe('$0');
    expect(kmoney(0.6)).toBe('+$1');
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
  it('plural', () => {
    expect(plural(1, 'loser')).toBe('1 loser');
    expect(plural(3, 'loser')).toBe('3 losers');
    expect(plural(0, 'trade')).toBe('0 trades');
    expect(plural(1, 'loss', 'losses')).toBe('1 loss');
    expect(plural(2, 'loss', 'losses')).toBe('2 losses');
    expect(plural(1200, 'trade')).toBe('1,200 trades');
  });
});
