import { describe, it, expect } from 'vitest';
import { macroMemberApplySchema, macroMemberDecisionSchema } from '@tradinjournal/contracts';

describe('macroMemberApplySchema', () => {
  it('accepts DELTA / COINDCX and trims uid', () => {
    const parsed = macroMemberApplySchema.parse({ exchange: 'DELTA', exchangeUid: '  abc  ' });
    expect(parsed.exchangeUid).toBe('abc');
  });

  it('rejects empty uid and unknown exchange', () => {
    expect(() => macroMemberApplySchema.parse({ exchange: 'DELTA', exchangeUid: '   ' })).toThrow();
    expect(() => macroMemberApplySchema.parse({ exchange: 'BINANCE', exchangeUid: 'x' })).toThrow();
  });

  it('rejects oversized uid', () => {
    expect(() =>
      macroMemberApplySchema.parse({ exchange: 'COINDCX', exchangeUid: 'x'.repeat(200) }),
    ).toThrow();
  });
});

describe('macroMemberDecisionSchema', () => {
  it('allows empty body and optional note', () => {
    expect(macroMemberDecisionSchema.parse({})).toEqual({});
    expect(macroMemberDecisionSchema.parse({ note: 'ok' }).note).toBe('ok');
  });
});
