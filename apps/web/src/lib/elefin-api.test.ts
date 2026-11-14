import { describe, it, expect } from 'vitest';
import { daysUntil, looksLikeKey, lotsShort, STATE_LABEL, usdShort, verificationShares } from './elefin-api';

describe('looksLikeKey', () => {
  it('accepts key.secret', () => {
    expect(looksLikeKey('fxcrm_pk_7Hq2mN4p.fxcrm_sk_x9TzQw3LkV5b')).toBe(true);
    expect(looksLikeKey('  elk_7Hq2mN4p.x9TzQw3LkV5b  ')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const k of ['', 'elk_7Hq2mN4pR8x9TzQw', 'a.b', 'elk 7Hq.x9TzQw3LkV5b', '.x9TzQw3LkV5bxxxx', 'elk_7Hq2mN4p.']) expect(looksLikeKey(k)).toBe(false);
  });
  it('labels every state', () => {
    expect(Object.keys(STATE_LABEL).sort()).toEqual(['ERROR', 'NOT_CONNECTED', 'OK', 'PAUSED', 'SYNCING']);
  });
});

describe('number formats', () => {
  it('compacts dollars and lots for tiles', () => {
    expect(usdShort(950)).toBe('$950');
    expect(usdShort(9_999)).toBe('$9,999');
    expect(usdShort(12_400)).toBe('$12.4K');
    expect(usdShort(250_000)).toBe('$250K');
    expect(usdShort(4_796_100)).toBe('$4.8M');
    expect(usdShort(2_000_000)).toBe('$2M');
    expect(lotsShort(4.24)).toBe('4.2');
    expect(lotsShort(932.4)).toBe('932');
    expect(lotsShort(17_664.5)).toBe('17.7K');
  });
  it('counts days to a key expiry', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('2026-11-20T12:00:00Z', now)).toBe(6);
    expect(daysUntil('2026-11-10T12:00:00Z', now)).toBeLessThanOrEqual(0);
  });
  it('splits referred traders by verification state', () => {
    expect(verificationShares({ referred: 10, verified: 5, held: 1, notFound: 2, waiting: 2, verifiedFunded: 3, lastCheckAt: null }))
      .toEqual({ verified: 50, held: 10, notFound: 20, waiting: 20 });
    expect(verificationShares({ referred: 0, verified: 0, held: 0, notFound: 0, waiting: 0, verifiedFunded: 0, lastCheckAt: null }))
      .toEqual({ verified: 0, held: 0, notFound: 0, waiting: 0 });
  });
});
