import { describe, expect, it } from 'vitest';
import { agoLabel } from './freshness';

describe('agoLabel', () => {
  it('reads like a person would say it', () => {
    expect([agoLabel(3_000), agoLabel(42_000), agoLabel(5 * 60_000), agoLabel(3 * 3_600_000), agoLabel(50 * 3_600_000), agoLabel(-5_000)])
      .toEqual(['just now', '42s ago', '5 min ago', '3 h ago', '2 d ago', 'just now']);
  });
});
