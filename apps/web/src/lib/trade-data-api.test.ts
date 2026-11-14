import { describe, expect, it } from 'vitest';
import { levelError, parsePrice, SOURCE_LABEL } from './trade-data-api';

describe('stop / target editor helpers', () => {
  it('parses typed prices', () => {
    expect(parsePrice('1,995.50')).toBe(1995.5);
    expect(parsePrice('  ')).toBeNull();
    expect(parsePrice('abc')).toBeNaN();
    expect(parsePrice('-3')).toBeNaN();
  });
  it('stop at entry on the losing side, target on the winning side (same rules as the API)', () => {
    expect(levelError('LONG', 2000, 2001, null, false)).toMatch(/below/);
    expect(levelError('SHORT', 2000, 1999, null, false)).toMatch(/above/);
    expect(levelError('LONG', 2000, 2005, null, true)).toBeNull();
    expect(levelError('LONG', 2000, null, 1990, false)).toMatch(/Target goes above/);
    expect(levelError('SHORT', 2000, 2010, 1980, false)).toBeNull();
    expect(levelError('LONG', 2000, null, null, false)).toMatch(/Add a stop/);
  });
  it('labels every source', () => {
    expect(Object.keys(SOURCE_LABEL).sort()).toEqual(['bridge', 'exchange', 'order', 'plan', 'user']);
  });
});
