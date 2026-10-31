import { describe, expect, it } from 'vitest';
import { dayStartIn } from '../time.js';

describe('dayStartIn', () => {
  it('is UTC midnight for UTC', () => {
    expect(dayStartIn('UTC', new Date('2026-10-31T17:20:00Z')).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
  it('uses the local date in zones ahead of UTC', () => {
    // 17:20 UTC is 22:50 in India, still the 31st; midnight there was 18:30 UTC on the 30th.
    expect(dayStartIn('Asia/Kolkata', new Date('2026-10-31T17:20:00Z')).toISOString()).toBe('2026-10-30T18:30:00.000Z');
    // 20:00 UTC is 01:30 on Nov 1 in India: a new day has started.
    expect(dayStartIn('Asia/Kolkata', new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
  it('uses the local date in zones behind UTC', () => {
    // 02:00 UTC on Nov 1 is 22:00 Oct 31 in New York (EDT, UTC−4).
    expect(dayStartIn('America/New_York', new Date('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-31T04:00:00.000Z');
  });
  it('never returns a time after now, including across a DST change', () => {
    for (const iso of ['2026-11-01T05:30:00Z', '2026-11-01T07:00:00Z', '2026-03-08T07:30:00Z', '2026-03-08T12:00:00Z']) {
      const now = new Date(iso);
      const s = dayStartIn('America/New_York', now);
      expect(s.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime() - s.getTime()).toBeLessThan(25 * 3600_000);
    }
  });
  it('falls back to UTC for a zone it does not know', () => {
    expect(dayStartIn('Mars/Olympus', new Date('2026-10-31T17:20:00Z')).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
});
