import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  templateFallback,
  looksPersonalized,
  NFA_DISCLAIMER,
} from '../macro-assistant.prompt.js';
import type { MacroState } from '@tradinjournal/contracts';

const sampleState: MacroState = {
  asOf: '2026-08-07T12:00:00.000Z',
  regime: { growth: 'up', inflation: 'down', label: 'Goldilocks', recessionOdds: 20 },
  macro: [
    {
      key: 'UNRATE',
      label: 'Unemployment Rate',
      value: 3.8,
      prev: 3.9,
      source: 'fred',
      asOf: '2026-07-01T00:00:00.000Z',
    },
  ],
  markets: [{ symbol: 'BTC', price: 65000, changePct: 1, asOf: '2026-08-07T12:00:00.000Z' }],
  bias: [
    { asset: 'BTC', score: 62, label: 'BULLISH', supporting: ['Net liquidity'], opposing: ['US dollar'] },
  ],
  events: [],
  headlines: [],
  fx: [],
  engineVer: 'macro-0.1.0',
};

describe('macro assistant prompts', () => {
  it('system prompt injects state and citation rules', () => {
    const sys = buildSystemPrompt(sampleState);
    expect(sys).toContain('Answer ONLY from the live dashboard data');
    expect(sys).toContain('Unemployment Rate');
    expect(sys).toContain('<MACRO_DATA>');
    expect(sys).toContain(NFA_DISCLAIMER);
    expect(sys).toContain('"label":"Goldilocks"');
  });

  it('template fallback degrades gracefully and includes NFA', () => {
    const text = templateFallback('Why is gold firm?', sampleState);
    expect(text).toContain('AI desk is unavailable');
    expect(text).toContain('Goldilocks');
    expect(text).toContain(NFA_DISCLAIMER);
  });

  it('flags personalized advice requests', () => {
    expect(looksPersonalized('Should I buy BTC with my portfolio?')).toBe(true);
    expect(looksPersonalized('Why is net liquidity rising?')).toBe(false);
  });
});
