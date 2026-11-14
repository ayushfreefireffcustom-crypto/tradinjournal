import { describe, it, expect } from 'vitest';
import { tickersFor, deskFor, storyScore, isKept, RULES_SCORE_MAX } from '../tickers.js';

describe('tickersFor', () => {
  it('maps a US inflation print to the rates/dollar/gold/equities complex', () => {
    expect(tickersFor('US CPI hotter than forecast for a second month')).toEqual(['US10Y', 'DXY', 'XAUUSD', 'US500']);
  });

  it('maps the Fed and yields', () => {
    expect(tickersFor('Fed funds futures: December cut odds fall to 38%')).toEqual(expect.arrayContaining(['US10Y', 'DXY']));
    expect(tickersFor('US two-year yield jumps 9bp to 3.64%')).toEqual(['US10Y', 'DXY']);
  });

  it('maps crypto', () => {
    expect(tickersFor('Bitcoin longs flushed: $214M liquidated in 15 minutes')).toEqual(['BTCUSD']);
    expect(tickersFor('Spot Ether ETFs: $212M inflows, fifth day running')).toEqual(['ETHUSD']);
    expect(tickersFor('SEC delays two spot Solana ETF decisions to January')).toEqual(['SOLUSD']);
  });

  it('maps an attack on an oil terminal to crude', () => {
    expect(tickersFor('Drone strike hits a Black Sea oil export terminal')).toEqual(['WTI', 'BRENT']);
    expect(tickersFor('OPEC+ agrees to extend output cuts')).toEqual(['WTI', 'BRENT']);
  });

  it('maps the ECB and euro to EURUSD, not the US complex', () => {
    expect(tickersFor('ECB accounts: inflation risks broadly balanced')).toEqual(['EURUSD']);
    expect(tickersFor('Euro zone inflation slows to 2.1%')).toEqual(['EURUSD']);
  });

  it('maps Japan to USDJPY and JP10Y', () => {
    expect(tickersFor('Japan 10-year yield at 1.78%, highest since 2008')).toEqual(['USDJPY', 'JP10Y']);
    expect(tickersFor('BoJ keeps rates on hold, yen slips')).toEqual(['USDJPY', 'JP10Y']);
  });

  it('maps UK data to GBPUSD only', () => {
    expect(tickersFor('UK GDP grows 0.1% in Q3, forecast 0.2%')).toEqual(['GBPUSD']);
  });

  it('maps index futures', () => {
    expect(tickersFor('S&P 500 futures −0.6%, Nasdaq 100 futures −0.8%')).toEqual(['US500', 'US100']);
  });

  it('does not read "bp" the company as basis points', () => {
    expect(tickersFor('BP names a new chief executive')).toEqual([]);
  });

  it('falls back to the summary only when the headline names nothing', () => {
    expect(tickersFor('Markets brace for a busy week', 'Bitcoin and gold in focus')).toEqual(['BTCUSD', 'XAUUSD']);
    expect(tickersFor('Bitcoin slips', 'Gold also lower')).toEqual(['BTCUSD']);
  });

  it('caps at five tickers and returns [] for noise', () => {
    expect(tickersFor('Fed, ECB, BoJ, bitcoin, oil and gold all in focus').length).toBeLessThanOrEqual(5);
    expect(tickersFor('Celebrity chef opens a new restaurant')).toEqual([]);
  });
});

describe('deskFor', () => {
  it('carves RATES out of macro', () => {
    expect(deskFor('MACRO', 'US two-year yield jumps 9bp to 3.64%')).toBe('RATES');
    expect(deskFor('MACRO', 'Fed funds futures: December cut odds fall to 38%')).toBe('RATES');
    expect(deskFor('MACRO', 'US CPI hotter than forecast for a second month')).toBe('MACRO');
  });
  it('keeps a stored non-macro category', () => {
    expect(deskFor('CRYPTO', 'Bitcoin longs flushed')).toBe('CRYPTO');
    expect(deskFor('GEOPOLITICAL', 'Drone strike hits a Black Sea oil export terminal')).toBe('GEOPOLITICAL');
  });
  it('guesses when the row has no category yet', () => {
    expect(deskFor(null, 'Bitcoin slips under 90K')).toBe('CRYPTO');
    expect(deskFor(null, 'Drone strike hits a Black Sea oil export terminal')).toBe('GEOPOLITICAL');
    expect(deskFor(null, 'Nasdaq 100 futures slip')).toBe('MARKETS');
    expect(deskFor(null, 'Celebrity chef opens a new restaurant')).toBeNull();
  });
});

describe('storyScore', () => {
  const base = { summary: null, impact: null, marketMoving: false, category: null, sourceCount: 1 } as const;
  it('uses the LLM relevance when enriched', () => {
    expect(storyScore({ ...base, title: 'Anything', relevance: 96 })).toEqual({ score: 96, source: 'ai' });
    expect(storyScore({ ...base, title: 'Anything', relevance: 140 }).score).toBe(100);
  });
  it('falls back to rules: data prints and wide coverage score higher, capped below 80', () => {
    const cpi = storyScore({ ...base, title: 'US CPI hotter than forecast', relevance: null, sourceCount: 16 });
    const chef = storyScore({ ...base, title: 'Celebrity chef opens a new restaurant', relevance: null });
    expect(cpi.source).toBe('rules');
    expect(cpi.score).toBeGreaterThanOrEqual(65);
    expect(cpi.score).toBeLessThanOrEqual(RULES_SCORE_MAX);
    expect(chef.score).toBeLessThan(40);
    expect(isKept(cpi.score, null)).toBe(true);
    expect(isKept(chef.score, null)).toBe(false);
  });
  it('keeps HIGH impact regardless of score', () => {
    expect(isKept(10, 'HIGH')).toBe(true);
  });
});
