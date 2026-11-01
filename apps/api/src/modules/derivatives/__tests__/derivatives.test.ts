// Derivatives with a fake Bybit: no network.
import { describe, expect, it } from 'vitest';
import { derivatives, perpFor, type DerivativesDeps } from '../derivatives.service.js';

const t = (symbol: string, turnover: number, over: Record<string, string> = {}) => ({ symbol, lastPrice: '100', price24hPcnt: '0.05', turnover24h: String(turnover), openInterestValue: '1000000', fundingRate: '0.0001', fundingIntervalHour: '8', nextFundingTime: '1793577600000', ...over });
const tickers = [
  t('BTCUSDT', 9e9, { price24hPcnt: '0.06' }),
  t('ETHUSDT', 5e9, { price24hPcnt: '-0.04', fundingRate: '-0.0002', openInterestValue: '3000000' }),
  t('NEWUSDT', 4e9, { curPreListingPhase: 'CallAuction' }),
  t('BTCPERP', 8e9),
  t('DEADUSDT', 0),
  t('FASTUSDT', 1e9, { fundingIntervalHour: '4', fundingRate: '' }),
];
const calls: string[] = [];
const deps = (over: Partial<DerivativesDeps> = {}): DerivativesDeps => ({
  get: async <T>(path: string): Promise<T> => {
    calls.push(path);
    if (path.startsWith('/tickers')) return { retCode: 0, result: { list: path.includes('symbol=XRPUSDT') ? [t('XRPUSDT', 1)] : tickers } } as T;
    if (path.startsWith('/open-interest')) {
      // BTC: OI 10 % lower than a day ago while price rose: short squeeze. ETH: OI up 20 %, price down: shorts building.
      const nowOi = path.includes('BTCUSDT') ? 90 : 120;
      return { retCode: 0, result: { list: Array.from({ length: 25 }, (_, i) => ({ openInterest: String(i === 0 ? nowOi : 100), timestamp: '0' })) } } as T;
    }
    if (path.startsWith('/account-ratio')) return { retCode: 0, result: { list: [{ buyRatio: path.includes('BTC') ? '0.68' : '0.45' }] } } as T;
    if (path.startsWith('/funding/history')) return { retCode: 0, result: { list: [{ fundingRate: '0.00005' }] } } as T;
    throw new Error(`unexpected ${path}`);
  },
  now: () => Date.UTC(2026, 10, 1),
  cache: false,
  ...over,
});

describe('derivatives', () => {
  it('ranks USDT perps by turnover and leaves out pre-listings and dead contracts', async () => {
    const d = await derivatives(deps());
    expect(d.source).toBe('bybit');
    expect(d.rows.map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'FASTUSDT']);
    expect(d.rows[0]).toMatchObject({ base: 'BTC', change24h: 6, funding: 0.01, lastFunding: 0.005, longRatio: 0.68 });
    expect(d.rows[0]!.annualised!).toBeCloseTo(10.95);
    expect(d.rows[2]).toMatchObject({ funding: null, annualised: null, fundingIntervalH: 4 });
    expect(d.liquidations).toBeNull();
  });
  it('reads squeezes from price and open interest together', async () => {
    const d = await derivatives(deps());
    expect(d.rows[0]!.oiChange24h!).toBeCloseTo(-10);
    expect(d.rows[0]!.squeeze).toBe('short_squeeze');
    expect(d.rows[1]!.oiChange24h!).toBeCloseTo(20);
    expect(d.rows[1]!.squeeze).toBe('short_build');
  });
  it('totals open interest and weights funding by it', async () => {
    const d = await derivatives(deps());
    expect(d.totals.oiValue).toBe(5_000_000);
    // (0.01 × 1M + -0.02 × 3M + 1M with no funding excluded) / 4M
    expect(d.totals.weightedFunding!).toBeCloseTo((0.01 * 1e6 - 0.02 * 3e6) / 4e6);
    expect(d.totals.positiveShare).toBe(0.5);
  });
  it('says so when Bybit is down instead of showing zeros', async () => {
    const d = await derivatives(deps({ get: async () => { throw new Error('timeout'); } }));
    expect(d).toMatchObject({ source: null, rows: [] });
    expect(d.note).toMatch(/didn’t answer/);
  });
  it('finds funding for one symbol, inside the list or not', async () => {
    expect(await perpFor('btcusdt', deps())).toMatchObject({ funding: 0.01, fundingIntervalH: 8 });
    expect(await perpFor('XRPUSDT', deps())).toMatchObject({ funding: 0.01 });
  });
});
