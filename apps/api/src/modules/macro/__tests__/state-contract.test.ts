import { describe, it, expect } from 'vitest';
import { macroStateSchema } from '@tradinjournal/contracts';
import { ENGINE_VER, scoreAll, classifyRegime } from '@tradinjournal/core';
import { toEngineInput } from '../../../lib/macro/engine-input.js';

describe('macroStateSchema (P2 contract)', () => {
  it('accepts a fully populated state payload with regime + 7-tier labels', () => {
    const input = toEngineInput(
      [
        { key: 'CPILFESL', value: 310, prev: 312 },
        { key: 'PAYEMS', value: 160_000, prev: 159_000 },
        { key: 'UNRATE', value: 3.8, prev: 3.9 },
        { key: 'NET_LIQUIDITY', value: 6_200_000, prev: 6_000_000 },
        { key: 'VIXCLS', value: 14, prev: 18 },
        { key: 'DTWEXBGS', value: 120, prev: 122 },
      ],
      [{ symbol: 'BTC', price: 65000, changePct: 1.2 }],
    );
    const bias = scoreAll(input);
    const regime = classifyRegime(input);

    const state = {
      asOf: '2026-08-07T12:00:00.000Z',
      regime,
      macro: [
        {
          key: 'UNRATE',
          label: 'Unemployment Rate',
          value: 3.8,
          prev: 3.9,
          forecast: null,
          unit: '%',
          source: 'fred',
          asOf: '2026-07-01T00:00:00.000Z',
        },
      ],
      markets: [
        { symbol: 'BTC', price: 65000, changePct: 1.2, asOf: '2026-08-07T12:00:00.000Z' },
      ],
      bias: bias.map(b => ({
        asset: b.asset,
        score: b.score,
        label: b.label,
        supporting: b.supporting,
        opposing: b.opposing,
      })),
      events: [],
      headlines: [],
      engineVer: ENGINE_VER,
    };
    const parsed = macroStateSchema.parse(state);
    expect(parsed.engineVer).toBe('macro-0.1.0');
    expect(parsed.regime?.label).toBe('Goldilocks');
    expect(parsed.bias).toHaveLength(4);
    expect(parsed.bias.every(b => b.score >= 0 && b.score <= 100)).toBe(true);
  });

  it('toEngineInput maps nullish prev/changePct', () => {
    const input = toEngineInput([{ key: 'VIXCLS', value: 20 }], [{ symbol: 'XAU', price: 2400 }]);
    expect(input.indicators[0]).toEqual({ key: 'VIXCLS', value: 20, prev: null });
    expect(input.markets[0]).toEqual({ symbol: 'XAU', price: 2400, changePct: null });
  });
});
