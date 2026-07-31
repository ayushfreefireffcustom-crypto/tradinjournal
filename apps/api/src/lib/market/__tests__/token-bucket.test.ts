import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '../providers/twelvedata.js';

describe('TokenBucket (Twelve Data free-tier guard)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows up to capacity, then blocks', () => {
    const b = new TokenBucket(8, 60_000);
    for (let i = 0; i < 8; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false); // 9th within the window is refused
  });

  it('refills continuously over the window', () => {
    const b = new TokenBucket(8, 60_000);
    for (let i = 0; i < 8; i++) b.take();
    expect(b.take()).toBe(false);
    vi.advanceTimersByTime(7_600); // ~1/8 of the window → ~1 token back
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });

  it('never exceeds capacity even after a long idle', () => {
    const b = new TokenBucket(8, 60_000);
    vi.advanceTimersByTime(600_000); // 10 windows idle
    let ok = 0;
    for (let i = 0; i < 20; i++) if (b.take()) ok++;
    expect(ok).toBe(8); // capped at capacity — quota can never be exceeded
  });
});
