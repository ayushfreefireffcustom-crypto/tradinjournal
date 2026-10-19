import { describe, it, expect } from 'vitest';
import { withPoolParams } from '@tradinjournal/db';

describe('withPoolParams', () => {
  const base = 'postgresql://u:p@host-pooler.neon.tech/db?sslmode=require';
  it('leaves the URL alone when nothing is set', () => {
    expect(withPoolParams(base)).toBe(base);
    expect(withPoolParams(undefined, '10')).toBeUndefined();
  });
  it('adds connection_limit / pool_timeout', () => {
    const u = new URL(withPoolParams(base, '15', '20')!);
    expect(u.searchParams.get('connection_limit')).toBe('15');
    expect(u.searchParams.get('pool_timeout')).toBe('20');
    expect(u.searchParams.get('sslmode')).toBe('require');
  });
  it('never overrides what the URL already says, and ignores junk', () => {
    expect(new URL(withPoolParams(`${base}&connection_limit=3`, '15')!).searchParams.get('connection_limit')).toBe('3');
    expect(withPoolParams(base, 'lots')).toBe(new URL(base).toString());
  });
});
