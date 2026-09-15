import { describe, expect, it } from 'vitest';
import { scoreUwVolume } from '../unusual-whales.js';
import { scoreDeribitBook } from '../deribit-options.js';
import { scoreBenzinga } from '../benzinga.js';
import { scoreSantiment } from '../santiment.js';

describe('vendor score parsers', () => {
  it('scores Unusual Whales from bullish vs bearish premium', () => {
    const scored = scoreUwVolume({
      bullish_premium: '200',
      bearish_premium: '100',
      call_volume: 300,
      put_volume: 100,
      avg_30_day_call_volume: 80,
      avg_30_day_put_volume: 80,
    });
    expect(scored).not.toBeNull();
    expect(scored!.score).toBeGreaterThan(0);
    expect(scored!.rationale).toMatch(/vol/);
  });

  it('returns null when Unusual Whales has no premium', () => {
    expect(scoreUwVolume({})).toBeNull();
  });

  it('scores Deribit put/call and skew', () => {
    const bull = scoreDeribitBook({ currency: 'BTC', putOi: 40, callOi: 100, putIv: 50, callIv: 55 });
    const bear = scoreDeribitBook({ currency: 'BTC', putOi: 160, callOi: 80, putIv: 70, callIv: 50 });
    expect(bull!.score).toBeGreaterThan(bear!.score);
  });

  it('omits Benzinga when articles have no sentiment', () => {
    expect(scoreBenzinga([{ stocks: [{ name: 'AAPL' }] }])).toBeNull();
    expect(scoreBenzinga([{ sentiment: 'positive' }, { sentiment: 'negative' }])!.score).toBe(0);
  });

  it('clamps Santiment into the lane range', () => {
    expect(scoreSantiment([])).toBeNull();
    expect(scoreSantiment([10])!.score).toBe(1);
    expect(scoreSantiment([-10])!.score).toBe(-1);
  });
});
