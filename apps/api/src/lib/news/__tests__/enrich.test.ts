import { describe, it, expect } from 'vitest';
import { parseBatch } from '../enrich.js';

describe('parseBatch', () => {
  it('parses a well-formed array', () => {
    const raw = '[{"i":0,"sentiment":"BULLISH","relevance":80,"impact":"HIGH","category":"CRYPTO","marketMoving":true,"country":"US"}]';
    const m = parseBatch(raw);
    expect(m.get(0)).toEqual({
      sentiment: 'BULLISH', relevance: 80, impact: 'HIGH', category: 'CRYPTO', marketMoving: true, country: 'US', short: null, line: null,
    });
  });

  it('tolerates surrounding prose / code fences', () => {
    const raw = 'Sure:\n```json\n[{"i":0,"sentiment":"bearish","relevance":40,"impact":"medium","category":"macro","marketMoving":false}]\n```';
    const e = parseBatch(raw).get(0)!;
    expect(e.sentiment).toBe('BEARISH');
    expect(e.impact).toBe('MEDIUM');
    expect(e.category).toBe('MACRO');
  });

  it('clamps relevance and defaults unknown enums', () => {
    const raw = '[{"i":0,"sentiment":"???","relevance":999,"impact":"???","category":"???","marketMoving":"yes"}]';
    const e = parseBatch(raw).get(0)!;
    expect(e.relevance).toBe(100);
    expect(e.sentiment).toBe('NEUTRAL');
    expect(e.impact).toBe('LOW');
    expect(e.category).toBeNull();
    expect(e.marketMoving).toBe(false); // only literal true counts
  });

  it('nulls an invalid country and handles missing relevance', () => {
    const e = parseBatch('[{"i":2,"sentiment":"NEUTRAL","impact":"LOW","country":"USA"}]').get(2)!;
    expect(e.country).toBeNull();
    expect(e.relevance).toBe(0);
  });

  it('keeps a short title and takeaway only within their word limits', () => {
    const raw = JSON.stringify([
      { i: 0, sentiment: 'BEARISH', relevance: 96, impact: 'HIGH', short: 'Hot US CPI, second month running', line: 'Dec cut odds 61% → 38% in 11 min' },
      { i: 1, sentiment: 'BEARISH', relevance: 50, impact: 'LOW', short: 'This short title is far too long to use', line: 'one two three four five six seven eight nine' },
    ]);
    const m = parseBatch(raw);
    expect(m.get(0)!.short).toBe('Hot US CPI, second month running');
    expect(m.get(0)!.line).toBe('Dec cut odds 61% → 38% in 11 min');
    expect(m.get(1)!.short).toBeNull();
    expect(m.get(1)!.line).toBeNull();
  });

  it('returns empty for non-JSON', () => {
    expect(parseBatch('no json here').size).toBe(0);
  });
});
