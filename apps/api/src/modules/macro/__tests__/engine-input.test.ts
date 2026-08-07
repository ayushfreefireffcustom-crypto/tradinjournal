import { describe, it, expect } from 'vitest';
import { toEngineInput } from '../../../lib/macro/engine-input.js';
import { scoreAll, classifyRegime } from '@tradinjournal/core';

describe('toEngineInput edge cases', () => {
  it('normalizes missing prev/changePct to null', () => {
    const input = toEngineInput(
      [{ key: 'VIXCLS', value: 20 }, { key: 'UNRATE', value: 4, prev: undefined }],
      [{ symbol: 'BTC', price: 1 }],
    );
    expect(input.indicators.every(i => i.prev === null || typeof i.prev === 'number')).toBe(true);
    expect(input.markets[0]!.changePct).toBeNull();
  });

  it('empty input stays neutral / Unclear', () => {
    const input = toEngineInput([], []);
    expect(scoreAll(input).every(b => b.score === 50)).toBe(true);
    expect(classifyRegime(input).label).toBe('Unclear');
  });
});
