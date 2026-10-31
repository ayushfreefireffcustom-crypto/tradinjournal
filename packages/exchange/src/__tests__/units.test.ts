import { describe, expect, it } from 'vitest';
import { closeQty, toVenueQty } from '../units.js';
import { fingerprintApiKey, keyLast4 } from '../fingerprint.js';
import { TokenBucket } from '../rate-limit.js';

const BTCUSD = { contractMultiplier: 0.001, qtyStep: 1, minQty: 1 };

describe('toVenueQty', () => {
  it('rounds 0.997 contracts up to 1 (MirrorPip-X flooring regression)', () => {
    expect(toVenueQty(0.000997, BTCUSD).qty).toBe(1);
  });

  it('converts base units to contracts', () => {
    expect(toVenueQty(0.01, BTCUSD)).toEqual({ qty: 10, residual: 0 });
  });

  it('carries the unsent remainder so small fills add up', () => {
    // Five fills each worth 0.3 contracts: 1.5 contracts wanted in total.
    let residual = 0;
    let sent = 0;
    for (let i = 0; i < 5; i++) {
      const r = toVenueQty(0.0003, BTCUSD, residual);
      sent += r.qty;
      residual = r.residual;
    }
    expect(Math.abs(sent + residual - 1.5)).toBeLessThan(1e-9);
    expect(Math.abs(sent - 1.5)).toBeLessThanOrEqual(0.5);
  });

  it('never sends below the minimum and keeps it as residual', () => {
    expect(toVenueQty(0.0004, BTCUSD)).toEqual({ qty: 0, residual: 0.4 });
  });

  it('rejects negative or non-finite input without losing the carry', () => {
    expect(toVenueQty(-1, BTCUSD, 0.2)).toEqual({ qty: 0, residual: 0.2 });
    expect(toVenueQty(Number.NaN, BTCUSD, 0.2)).toEqual({ qty: 0, residual: 0.2 });
  });

  it('handles fractional steps', () => {
    expect(toVenueQty(0.0123, { contractMultiplier: 1, qtyStep: 0.001, minQty: 0.001 }).qty).toBe(0.012);
  });
});

describe('closeQty', () => {
  it('closes everything when the leader closes everything', () => {
    expect(closeQty(7, 10, 10, 1)).toBe(7);
    expect(closeQty(-7, -10, 10, 1)).toBe(7);
  });

  it('closes the same share of the follower position', () => {
    expect(closeQty(8, 10, 5, 1)).toBe(4);
  });

  it('is capped at the real open size and never flips', () => {
    expect(closeQty(3, 10, 25, 1)).toBe(3);
  });

  it('is zero when there is nothing to close', () => {
    expect(closeQty(0, 10, 5, 1)).toBe(0);
    expect(closeQty(5, 0, 5, 1)).toBe(0);
  });
});

describe('fingerprints', () => {
  it('are stable, keyed and trim the key', () => {
    const a = fingerprintApiKey('DELTA_INDIA', 'abc123', 'k1');
    expect(fingerprintApiKey('DELTA_INDIA', ' abc123 ', 'k1')).toBe(a);
    expect(fingerprintApiKey('DELTA_INDIA', 'abc123', 'k2')).not.toBe(a);
    expect(fingerprintApiKey('BINANCE', 'abc123', 'k1')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('show only the last four characters', () => {
    expect(keyLast4('abcdefgh')).toBe('efgh');
  });
});

describe('TokenBucket', () => {
  it('refills continuously', () => {
    let t = 0;
    const b = new TokenBucket(2, 1000, () => t);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    expect(b.waitMs()).toBe(500);
    t = 500;
    expect(b.take()).toBe(true);
  });
});
