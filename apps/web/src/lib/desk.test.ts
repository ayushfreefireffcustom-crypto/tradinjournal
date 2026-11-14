import { describe, it, expect } from 'vitest';
import { fmtPrice, marketKind, tagTone, tickerMark } from './desk';

describe('labels', () => {
  it('classifies markets and ticker marks', () => {
    expect(['XAUUSD', 'NAS100', 'US30.cash', 'EURUSD', 'GBPJPY.r', 'BTCUSD', 'USOIL', 'AAPL'].map(marketKind))
      .toEqual(['Metal', 'Index', 'Index', 'FX', 'FX', 'Crypto', 'Energy', '']);
    expect(['US30', 'NAS100', 'XAUUSD', 'US500'].map(tickerMark)).toEqual(['US30', 'NAS', 'XAU', 'SPX']);
  });
  it('formats prices by size', () => {
    expect([fmtPrice(1.0825), fmtPrice(193.4), fmtPrice(20896.8), fmtPrice(null)]).toEqual(['1.08250', '193.400', '20,896.80', '—']);
  });
  it('tones journal tags', () => {
    expect(['Patient', 'FOMO', 'news'].map(tagTone)).toEqual(['g', 'r', 'n']);
  });
});
