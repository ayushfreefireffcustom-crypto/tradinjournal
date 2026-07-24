import { describe, it, expect } from 'vitest';
import { parseBatch } from '../enrich.js';

describe('parseBatch', () => {
  it('parses a well-formed array', () => {
    const raw = '[{"i":0,"sentiment":"BULLISH","relevance":80,"impact":"HIGH","category":"CRYPTO","marketMoving":true,"country":"US"}]';
    const m = parseBatch(raw);
    expect(m.get(0)).toEqual({
      sentiment: 'BULLISH', relevance: 80, impact: 'HIGH', category: 'CRYPTO', marketMoving: true, country: 'US',
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

  it('returns empty for non-JSON', () => {
    expect(parseBatch('no json here').size).toBe(0);
  });
});
