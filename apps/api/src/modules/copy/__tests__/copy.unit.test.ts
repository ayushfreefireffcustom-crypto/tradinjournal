import { describe, expect, it } from 'vitest';
import { COPY_RISK_VERSION, createFollowSchema, leadersQuerySchema, updateFollowSchema, applyLeaderSchema } from '@tradinjournal/contracts';
import { byKnown, downsample, recommendedMargin, riskGrade } from '../leaders.service.js';

const DAY = 24 * 3600_000;

describe('riskGrade', () => {
  it('needs a week of history', () => {
    expect(riskGrade(1, 6 * DAY)).toBeNull();
    expect(riskGrade(1, 7 * DAY)).toBe('A');
  });
  it('grades by max drawdown at the documented cut-offs', () => {
    expect([0, 9.99, 10, 19.99, 20, 29.99, 30, 44.99, 45, 90].map((d) => riskGrade(d, 30 * DAY))).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E']);
  });
});

describe('recommendedMargin', () => {
  it('is leader equity over the median entry size, rounded up to $10', () => {
    expect(recommendedMargin(1200, [2, 4, 4])).toBe(300);
    expect(recommendedMargin(1000, [1, 3])).toBe(500);
    expect(recommendedMargin(61.73, [1])).toBe(70);
  });
  it('never divides by a fraction of a contract', () => {
    expect(recommendedMargin(100, [0.2, 0.5])).toBe(100);
  });
  it('is unknown without equity or entries', () => {
    expect(recommendedMargin(null, [1])).toBeNull();
    expect(recommendedMargin(0, [1])).toBeNull();
    expect(recommendedMargin(100, [])).toBeNull();
    expect(recommendedMargin(100, [0])).toBeNull();
  });
});

describe('byKnown', () => {
  it('sorts unknown values last in both directions', () => {
    const xs = [3, null, 1, null, 2];
    expect([...xs].sort((a, b) => byKnown(a, b, -1))).toEqual([3, 2, 1, null, null]);
    expect([...xs].sort((a, b) => byKnown(a, b, 1))).toEqual([1, 2, 3, null, null]);
  });
});

describe('downsample', () => {
  it('keeps short series and thins long ones to n, keeping both ends', () => {
    expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const out = downsample(Array.from({ length: 1000 }, (_, i) => i), 40);
    expect(out).toHaveLength(40);
    expect(out[0]).toBe(0);
    expect(out[39]).toBe(999);
  });
});

describe('copy request validation', () => {
  const ok = { leaderId: 'l', connectionId: 'c', riskAccepted: true, riskVersion: COPY_RISK_VERSION };
  it('defaults to proportional 1x', () => {
    expect(createFollowSchema.parse(ok)).toMatchObject({ sizingMode: 'PROPORTIONAL', sizingValue: 1 });
  });
  it('requires the current risk notice to be accepted', () => {
    expect(createFollowSchema.safeParse({ ...ok, riskAccepted: false }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, riskAccepted: undefined }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, riskVersion: '2020-01-01' }).success).toBe(false);
  });
  it('bounds sizing per mode', () => {
    expect(createFollowSchema.safeParse({ ...ok, sizingMode: 'MULTIPLIER', sizingValue: 101 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, sizingMode: 'MULTIPLIER', sizingValue: 0.005 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, sizingMode: 'FIXED_NOTIONAL', sizingValue: 0.5 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, sizingMode: 'FIXED_NOTIONAL', sizingValue: 250 }).success).toBe(true);
    expect(createFollowSchema.safeParse({ ...ok, sizingValue: -1 }).success).toBe(false);
  });
  it('rejects bad caps and leverage', () => {
    expect(createFollowSchema.safeParse({ ...ok, dailyLossLimitUsd: -5 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, maxProfitUsd: 0 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, leverage: 0 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, leverage: 2.5 }).success).toBe(false);
    expect(createFollowSchema.safeParse({ ...ok, leverage: null, dailyLossLimitUsd: null }).success).toBe(true);
  });
  it('edits need something, and sizing mode with value', () => {
    expect(updateFollowSchema.safeParse({}).success).toBe(false);
    expect(updateFollowSchema.safeParse({ sizingValue: 2 }).success).toBe(false);
    expect(updateFollowSchema.safeParse({ sizingMode: 'MULTIPLIER' }).success).toBe(false);
    expect(updateFollowSchema.safeParse({ sizingMode: 'MULTIPLIER', sizingValue: 2 }).success).toBe(true);
    expect(updateFollowSchema.safeParse({ action: 'stop' }).success).toBe(false);
    expect(updateFollowSchema.safeParse({ dailyLossLimitUsd: null }).success).toBe(true);
  });
  it('validates leaderboard queries and leader applications', () => {
    expect(leadersQuerySchema.parse({})).toEqual({ sort: 'roi', range: '30d' });
    expect(leadersQuerySchema.safeParse({ sort: 'x' }).success).toBe(false);
    expect(leadersQuerySchema.safeParse({ range: '1y' }).success).toBe(false);
    expect(applyLeaderSchema.safeParse({ connectionId: 'c', displayName: 'A', bio: 'x'.repeat(30) }).success).toBe(false);
    expect(applyLeaderSchema.safeParse({ connectionId: 'c', displayName: 'Alpha', bio: 'short' }).success).toBe(false);
  });
});
