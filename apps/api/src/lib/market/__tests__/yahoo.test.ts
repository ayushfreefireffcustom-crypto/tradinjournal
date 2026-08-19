import { describe, it, expect } from 'vitest';
import { yahooSymbol } from '../providers/yahoo.js';

describe('yahooSymbol mapping', () => {
  it('appends =X to a 6-letter FX pair', () => {
    expect(yahooSymbol('EURUSD')).toBe('EURUSD=X');
    expect(yahooSymbol('gbpjpy')).toBe('GBPJPY=X');
  });
  it('maps metals/energy to their Yahoo futures tickers', () => {
    expect(yahooSymbol('XAUUSD')).toBe('GC=F');
    expect(yahooSymbol('XAGUSD')).toBe('SI=F');
    expect(yahooSymbol('USOIL')).toBe('CL=F');
  });
  it('maps common index aliases to caret tickers', () => {
    expect(yahooSymbol('US30')).toBe('^DJI');
    expect(yahooSymbol('NAS100')).toBe('^NDX');
    expect(yahooSymbol('US500')).toBe('^GSPC');
  });
  it('passes through tickers that already carry a Yahoo suffix/prefix', () => {
    expect(yahooSymbol('GC=F')).toBe('GC=F');
    expect(yahooSymbol('^GSPC')).toBe('^GSPC');
    expect(yahooSymbol('BRK-B')).toBe('BRK-B');
  });
  it('leaves plain equities untouched', () => {
    expect(yahooSymbol('AAPL')).toBe('AAPL');
    expect(yahooSymbol('tsla')).toBe('TSLA');
  });
});
