import { describe, it, expect } from 'vitest';
import { isoWeekKey, weeklyReviewSendJobId } from '../index.js';

// The week key is the idempotency scope for a weekly run: every job id derives
// from it, so if it drifts mid-week a user gets a second email. ISO week rules
// around New Year are the classic place that breaks, hence the boundary cases.

describe('isoWeekKey', () => {
  it('is constant across every day of the same ISO week', () => {
    // Mon 20 Jul 2026 → Sun 26 Jul 2026 is one ISO week.
    const keys = new Set(
      [20, 21, 22, 23, 24, 25, 26].map(day => isoWeekKey(new Date(Date.UTC(2026, 6, day, 12, 0, 0)))),
    );
    expect(keys.size).toBe(1);
  });

  it('rolls over on Monday, not Sunday', () => {
    const sunday = isoWeekKey(new Date(Date.UTC(2026, 6, 26)));
    const monday = isoWeekKey(new Date(Date.UTC(2026, 6, 27)));
    expect(monday).not.toBe(sunday);
  });

  it('is unaffected by the time of day', () => {
    const early = isoWeekKey(new Date(Date.UTC(2026, 6, 25, 0, 0, 1)));
    const late = isoWeekKey(new Date(Date.UTC(2026, 6, 25, 23, 59, 59)));
    expect(early).toBe(late);
  });

  it('assigns a year-straddling week to the year holding its Thursday', () => {
    // 1 Jan 2026 is a Thursday, so 29–31 Dec 2025 belong to 2026-W01.
    expect(isoWeekKey(new Date(Date.UTC(2025, 11, 29)))).toBe('2026-W01');
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 4)))).toBe('2026-W01');
    // The following Monday starts W02.
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-W02');
  });

  it('zero-pads the week number', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 1, 2)))).toMatch(/^2026-W\d{2}$/);
  });
});

describe('weeklyReviewSendJobId', () => {
  it('is stable for the same user and week, so a re-dispatch is deduped', () => {
    const a = weeklyReviewSendJobId('user_1', '2026-W30');
    const b = weeklyReviewSendJobId('user_1', '2026-W30');
    expect(a).toBe(b);
  });

  it('differs across users and across weeks', () => {
    expect(weeklyReviewSendJobId('user_1', '2026-W30')).not.toBe(weeklyReviewSendJobId('user_2', '2026-W30'));
    expect(weeklyReviewSendJobId('user_1', '2026-W30')).not.toBe(weeklyReviewSendJobId('user_1', '2026-W31'));
  });
});
