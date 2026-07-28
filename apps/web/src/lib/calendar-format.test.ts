import { describe, it, expect } from 'vitest';
import {
  surprise, rangeWindow, flag, countdown,
  startOfWeek, startOfMonth, scopeWindow, shiftAnchor, periodLabel,
} from './calendar-format';

describe('surprise', () => {
  it('flags actual above/below forecast', () => {
    expect(surprise('1.2', '1.0')).toBe('up');
    expect(surprise('0.8', '1.0')).toBe('down');
  });
  it('parses through units and signs', () => {
    expect(surprise('3.296M', '2.5M')).toBe('up');
    expect(surprise('-0.125M', '1.759M')).toBe('down');
    expect(surprise('0.7%', '1.4%')).toBe('down');
  });
  it('returns null when equal or non-numeric or missing', () => {
    expect(surprise('1.0', '1.0')).toBeNull();
    expect(surprise(null, '1.0')).toBeNull();
    expect(surprise('1.0', null)).toBeNull();
    expect(surprise('-', '1.0')).toBeNull();
    expect(surprise('n/a', '1.0')).toBeNull();
  });
});

describe('rangeWindow', () => {
  const now = new Date('2026-07-29T10:30:00.000Z');
  it('today = midnight..+24h UTC', () => {
    expect(rangeWindow('today', now)).toEqual({
      from: '2026-07-29T00:00:00.000Z',
      to: '2026-07-30T00:00:00.000Z',
    });
  });
  it('week = midnight..+7d UTC', () => {
    const { from, to } = rangeWindow('week', now);
    expect(from).toBe('2026-07-29T00:00:00.000Z');
    expect(to).toBe('2026-08-05T00:00:00.000Z');
  });
  it('upcoming starts 1h before now', () => {
    const { from } = rangeWindow('upcoming', now);
    expect(from).toBe('2026-07-29T09:30:00.000Z');
  });
});

describe('flag', () => {
  it('maps ISO alpha-2 to regional-indicator emoji', () => {
    expect(flag('US')).toBe('🇺🇸');
    expect(flag('eu')).toBe('🇪🇺');
  });
  it('falls back for invalid codes', () => {
    expect(flag('U')).toBe('🏳️');
    expect(flag('123')).toBe('🏳️');
  });
});

describe('countdown', () => {
  const now = Date.parse('2026-07-29T10:00:00.000Z');
  it('formats minutes and hours ahead', () => {
    expect(countdown('2026-07-29T10:45:00.000Z', now)).toBe('in 45m');
    expect(countdown('2026-07-29T12:15:00.000Z', now)).toBe('in 2h 15m');
  });
  it('is empty once the event has started', () => {
    expect(countdown('2026-07-29T09:59:00.000Z', now)).toBe('');
  });
});

// Scope helpers use LOCAL boundaries, so assert date COMPONENTS (TZ/DST-safe)
// rather than exact ISO strings.
describe('scope helpers', () => {
  const wed = new Date(2026, 6, 29); // Wed Jul 29 2026, local
  it('startOfWeek is the Monday of that week', () => {
    const mon = startOfWeek(wed);
    expect(mon.getDay()).toBe(1); // Monday
    expect(mon.getDate()).toBe(27); // Mon Jul 27
  });
  it('startOfMonth is the 1st', () => {
    expect(startOfMonth(wed).getDate()).toBe(1);
    expect(startOfMonth(wed).getMonth()).toBe(6); // July
  });

  it('scopeWindow(day) is one local day and contains the anchor', () => {
    const { from, to } = scopeWindow('day', wed);
    const f = new Date(from), t = new Date(to);
    expect(f.getHours()).toBe(0);
    expect(f.getDate()).toBe(29);
    expect(t.getDate()).toBe(30);
    expect(f.getTime()).toBeLessThanOrEqual(wed.getTime());
    expect(wed.getTime()).toBeLessThan(t.getTime());
  });
  it('scopeWindow(week) starts Monday and includes past days of the week', () => {
    const { from, to } = scopeWindow('week', wed);
    const f = new Date(from), t = new Date(to);
    expect(f.getDay()).toBe(1); // Monday (Jul 27 — before the Wed anchor)
    expect(f.getDate()).toBe(27);
    expect(f.getTime()).toBeLessThan(wed.getTime()); // past days visible
    expect(new Date(to).getDate()).toBe(3); // to = next Monday Aug 3
    expect(t.getMonth()).toBe(7); // August
  });
  it('scopeWindow(month) spans the whole calendar month', () => {
    const { from, to } = scopeWindow('month', wed);
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(from).getMonth()).toBe(6); // July 1
    expect(new Date(to).getDate()).toBe(1);
    expect(new Date(to).getMonth()).toBe(7); // Aug 1
  });

  it('shiftAnchor moves by the scope unit', () => {
    expect(shiftAnchor('day', wed, 1).getDate()).toBe(30);
    expect(shiftAnchor('day', wed, -1).getDate()).toBe(28);
    expect(shiftAnchor('week', wed, 1).getDate()).toBe(5); // +7 → Aug 5
    expect(shiftAnchor('month', wed, 1).getMonth()).toBe(7); // August
    expect(shiftAnchor('month', wed, -1).getMonth()).toBe(5); // June
  });

  it('periodLabel reflects the scope', () => {
    expect(periodLabel('month', wed)).toContain('2026');
    expect(periodLabel('week', wed)).toContain('–');
  });
});
