import { describe, it, expect } from 'vitest';
import { looksLikeKey, STATE_LABEL } from './elefin-api';

describe('looksLikeKey', () => {
  it('accepts key.secret', () => {
    expect(looksLikeKey('elk_7Hq2mN4p.x9TzQw3LkV5b')).toBe(true);
    expect(looksLikeKey('  elk_7Hq2mN4p.x9TzQw3LkV5b  ')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const k of ['', 'elk_7Hq2mN4pR8x9TzQw', 'a.b', 'elk 7Hq.x9TzQw3LkV5b', '.x9TzQw3LkV5bxxxx', 'elk_7Hq2mN4p.']) expect(looksLikeKey(k)).toBe(false);
  });
  it('labels every state', () => {
    expect(Object.keys(STATE_LABEL).sort()).toEqual(['ERROR', 'NOT_CONNECTED', 'OK', 'PAUSED', 'SYNCING']);
  });
});
