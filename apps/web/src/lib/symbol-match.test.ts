import { describe, it, expect } from 'vitest';
import { matchSymbols, normalizeSymbol, matchesUserSymbols, canonicalize } from './symbol-match';

describe('matchSymbols', () => {
  it('matches obvious asset aliases', () => {
    expect(matchSymbols('Bitcoin nears $65k on rate-cut relief')).toEqual(['BTCUSD']);
    expect(matchSymbols('Gold hits fresh record high')).toEqual(['XAUUSD']);
    expect(matchSymbols('S&P 500 rallies into the close')).toEqual(['US500']);
    expect(matchSymbols('Nasdaq leads tech higher')).toEqual(['US100']);
  });

  it('respects word boundaries (no false positives)', () => {
    expect(matchSymbols('Goldman Sachs reports strong profits')).toEqual([]); // not "gold"
    expect(matchSymbols('The tethered stablecoin debate')).toEqual([]); // "ether" inside "tethered"
    expect(matchSymbols('Fed holds rates steady, no cut')).toEqual([]); // no instrument
  });

  it('finds multiple distinct symbols, deduped', () => {
    const got = new Set(matchSymbols('Gold and Bitcoin both surge as the dollar slips'));
    expect(got).toEqual(new Set(['XAUUSD', 'BTCUSD']));
  });

  it('is case-insensitive and handles ticker forms', () => {
    expect(matchSymbols('BTCUSD breaks resistance')).toEqual(['BTCUSD']);
    expect(matchSymbols('XAUUSD accumulation continues')).toEqual(['XAUUSD']);
  });

  it('returns [] for empty/whitespace', () => {
    expect(matchSymbols('')).toEqual([]);
    expect(matchSymbols('   ')).toEqual([]);
  });
});

describe('normalizeSymbol', () => {
  it('strips broker suffixes and punctuation', () => {
    expect(normalizeSymbol('XAUUSD.m')).toBe('XAUUSD');
    expect(normalizeSymbol('EURUSD.pro')).toBe('EURUSD');
    expect(normalizeSymbol('US500.cash')).toBe('US500');
    expect(normalizeSymbol('BTC/USD')).toBe('BTCUSD');
    expect(normalizeSymbol('us30')).toBe('US30');
  });
  it('handles empty input', () => {
    expect(normalizeSymbol('')).toBe('');
  });
});

describe('canonicalize', () => {
  it('maps broker names/aliases to the news canonical key', () => {
    expect(canonicalize('GOLD')).toBe('XAUUSD');
    expect(canonicalize('gold')).toBe('XAUUSD');
    expect(canonicalize('XAUUSD.m')).toBe('XAUUSD');
    expect(canonicalize('SPX500')).toBe('US500');
    expect(canonicalize('BTCUSD')).toBe('BTCUSD');
    expect(canonicalize('EURUSD')).toBe('EURUSD');
    expect(canonicalize('USDCHF')).toBe('USDCHF');
  });
  it('passes unknown symbols through normalized', () => {
    expect(canonicalize('XYZ123')).toBe('XYZ123');
  });
});

describe('matchesUserSymbols', () => {
  it('returns only symbols the user trades', () => {
    const user = new Set(['XAUUSD', 'BTCUSD']);
    expect(matchesUserSymbols('Gold and Silver rally', user)).toEqual(['XAUUSD']); // silver not traded
    expect(matchesUserSymbols('Bitcoin and gold both up', user).sort()).toEqual(['BTCUSD', 'XAUUSD']);
  });
  it('bridges broker "GOLD" to gold news via canonicalize (the reported bug)', () => {
    const user = new Set(['GOLD', 'BTCUSD', 'USDCHF'].map(canonicalize)); // → XAUUSD, BTCUSD, USDCHF
    expect(matchesUserSymbols('Gold: Hawkish Fed delays recovery path', user)).toEqual(['XAUUSD']);
    expect(matchesUserSymbols('Swiss franc firms as risk fades', user)).toEqual(['USDCHF']);
  });
  it('returns [] when the user has no symbols', () => {
    expect(matchesUserSymbols('Gold rallies', new Set())).toEqual([]);
  });
  it('returns [] when nothing overlaps', () => {
    expect(matchesUserSymbols('Yen weakens', new Set(['XAUUSD']))).toEqual([]);
  });
});
