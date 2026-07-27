import { describe, it, expect } from 'vitest';
import { surprise, rangeWindow, flag, countdown } from './calendar-format';

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
