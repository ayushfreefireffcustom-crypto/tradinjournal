// Per-key request throttle. A continuous-refill token bucket (same shape as
// apps/api/src/lib/market/providers/twelvedata.ts), but async: callers wait for
// a token instead of being dropped, because an order must go out, just later.

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / this.windowMs) * this.capacity);
    this.last = t;
  }

  /** Take a token now if one is free. */
  take(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Milliseconds until the next token is free (0 when one is available). */
  waitMs(): number {
    this.refill();
    return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.capacity) * this.windowMs);
  }
}

const buckets = new Map<string, TokenBucket>();

/**
 * Wait for a request slot for one venue + key. `key` should be a fingerprint,
 * never the raw API key, because bucket names can surface in logs.
 */
export async function acquire(name: string, capacity: number, windowMs: number): Promise<void> {
  let b = buckets.get(name);
  if (!b) {
    b = new TokenBucket(capacity, windowMs);
    buckets.set(name, b);
  }
  for (;;) {
    if (b.take()) return;
    await new Promise((r) => setTimeout(r, Math.max(5, b.waitMs())));
  }
}
