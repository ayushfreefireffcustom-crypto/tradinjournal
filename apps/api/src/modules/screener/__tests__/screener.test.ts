// Screener logic with fake market data: no network, no database.
import { describe, expect, it } from 'vitest';
import type { ScreenDefinition } from '@tradinjournal/contracts';
import { columnsOf, fundingFor, runScreen, type ScreenerDeps } from '../screener.service.js';
import { rankUniverse, type UniverseRow } from '../universe.js';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 1, 12, 30);
const t = (symbol: string, quoteVolume: number, change = 0, extra: Partial<{ lastPrice: string; count: number }> = {}) => ({ symbol, lastPrice: extra.lastPrice ?? '10', priceChangePercent: String(change), quoteVolume: String(quoteVolume), highPrice: '11', lowPrice: '9', count: extra.count ?? 100 });

describe('universe', () => {
  it('keeps the most-traded USDT pairs, without stablecoins, leveraged or halted tokens', () => {
    const u = rankUniverse([t('BTCUSDT', 900), t('ETHUSDT', 800), t('USDCUSDT', 9999), t('FDUSDUSDT', 5000), t('BTCUPUSDT', 700), t('ETHBTC', 99999), t('DEADUSDT', 600, 0, { count: 0 }), t('ZEROUSDT', 650, 0, { lastPrice: '0' }), t('SOLUSDT', 500, -3.2)], 2);
    expect(u.map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(rankUniverse([t('BTCUSDT', 900), t('TONUSDT', 850), t('ETHUSDT', 800)], 5, new Set(['BTCUSDT', 'ETHUSDT'])).map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    // Pegged near $1 all day = a stablecoin, whatever it's called; a coin that merely trades near $1 stays.
    const peg = { symbol: 'RWUSDUSDT', lastPrice: '0.9999', priceChangePercent: '0', quoteVolume: '800', highPrice: '1.0003', lowPrice: '0.9995', count: 50 };
    const near = { symbol: 'ARBUSDT', lastPrice: '1.002', priceChangePercent: '3', quoteVolume: '700', highPrice: '1.05', lowPrice: '0.96', count: 50 };
    expect(rankUniverse([peg, near], 5).map((r) => r.symbol)).toEqual(['ARBUSDT']);
    expect(rankUniverse([t('SOLUSDT', 500, -3.2)], 5)[0]).toMatchObject({ base: 'SOL', change24h: -3.2, volume24h: 500, price: 10 });
  });
  it('finds funding for coins Bybit lists per 1000', () => {
    const f = { source: 'bybit' as const, rates: new Map([['BTCUSDT', 0.01], ['1000PEPEUSDT', -0.02]]) };
    expect(fundingFor(f, 'BTCUSDT')).toBe(0.01);
    expect(fundingFor(f, 'PEPEUSDT')).toBe(-0.02);
    expect(fundingFor(f, 'XYZUSDT')).toBeNull();
  });
});

// Market: AAA falls hard (RSI 0), BBB rises (RSI 100), CCC flat with a spike on the forming bar, DDD has no candles.
const universe: UniverseRow[] = [
  { symbol: 'AAAUSDT', base: 'AAA', price: 50, change24h: -12, volume24h: 3e6, high24h: 0, low24h: 0 },
  { symbol: 'BBBUSDT', base: 'BBB', price: 150, change24h: 9, volume24h: 2e6, high24h: 0, low24h: 0 },
  { symbol: 'CCCUSDT', base: 'CCC', price: 100, change24h: 0.5, volume24h: 1e6, high24h: 0, low24h: 0 },
  { symbol: 'DDDUSDT', base: 'DDD', price: 1, change24h: 1, volume24h: 5e5, high24h: 0, low24h: 0 },
];
const path: Record<string, (i: number) => number> = { AAAUSDT: (i) => 100 - i, BBBUSDT: (i) => 100 + i, CCCUSDT: () => 100 };
const loads: string[] = [];
const deps: ScreenerDeps = {
  universe: async (n) => universe.slice(0, n),
  funding: async () => ({ source: 'bybit', rates: new Map([['AAAUSDT', -0.05], ['BBBUSDT', 0.03]]) }),
  loadCandles: async (symbol, _tf, limit) => {
    loads.push(symbol);
    if (!path[symbol]) return [];
    const n = 60;
    const first = Math.floor(NOW / H) * H - (n - 1) * H; // the last bar is still forming
    return Array.from({ length: n }, (_, i) => {
      const c = symbol === 'CCCUSDT' && i === n - 1 ? 500 : path[symbol]!(i);
      return { openTime: first + i * H, open: c, high: c + 1, low: c - 1, close: c, volume: 10 };
    }).slice(-limit);
  },
  now: () => NOW,
  cache: false,
};
const rsi = { kind: 'indicator' as const, id: 'rsi', output: 'value', params: { length: 14 } };
const def = (d: Partial<ScreenDefinition>): ScreenDefinition => ({ timeframe: '1h', universe: 50, groups: [], ...d });

describe('runScreen', () => {
  it('ANDs filters, reports indicator columns and the symbols without data', async () => {
    const r = await runScreen(def({ groups: [[{ type: 'indicator', left: rsi, operator: 'lt', right: { kind: 'value', value: 30 } }, { type: 'field', field: 'change24h', operator: 'lt', value: -5 }]] }), deps);
    expect(r.rows.map((x) => x.symbol)).toEqual(['AAAUSDT']);
    expect(r).toMatchObject({ universe: 4, scanned: 3, matched: 1, noData: ['DDDUSDT'], fundingSource: 'bybit', columns: [{ label: 'RSI(14)' }] });
    expect(r.rows[0]).toMatchObject({ funding: -0.05, values: [0] });
    expect(r.barTime).toBe(new Date(Math.floor(NOW / H) * H - H).toISOString());
  });

  it('ORs groups (E6), and between is two filters', async () => {
    const r = await runScreen(def({ groups: [
      [{ type: 'indicator', left: rsi, operator: 'lt', right: { kind: 'value', value: 30 } }],
      [{ type: 'indicator', left: rsi, operator: 'gt', right: { kind: 'value', value: 70 } }],
    ] }), deps);
    expect(r.rows.map((x) => x.symbol).sort()).toEqual(['AAAUSDT', 'BBBUSDT']);
    const between = await runScreen(def({ groups: [[{ type: 'indicator', left: rsi, operator: 'gte', right: { kind: 'value', value: 40 } }, { type: 'indicator', left: rsi, operator: 'lte', right: { kind: 'value', value: 60 } }]] }), deps);
    expect(between.rows.map((x) => x.symbol)).toEqual(['CCCUSDT']); // flat: RSI 50 (its forming spike is ignored)
  });

  it('ignores the forming bar', async () => {
    const r = await runScreen(def({ groups: [[{ type: 'indicator', left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'gt', right: { kind: 'value', value: 400 } }]] }), deps);
    expect(r.matched).toBe(0);
  });

  it('ranks without filters and without loading candles when no indicator is involved', async () => {
    loads.length = 0;
    const g = await runScreen(def({ sort: { by: 'change24h', dir: 'desc' } }), deps);
    expect(g.rows.map((x) => x.symbol)).toEqual(['BBBUSDT', 'DDDUSDT', 'CCCUSDT', 'AAAUSDT']);
    expect(loads).toEqual([]);
    const f = await runScreen(def({ groups: [[{ type: 'field', field: 'funding', operator: 'gt', value: 0 }]], sort: { by: 'funding', dir: 'desc' } }), deps);
    expect(f.rows.map((x) => x.symbol)).toEqual(['BBBUSDT']);
    // Unknown funding sorts last either way.
    const asc = await runScreen(def({ sort: { by: 'funding', dir: 'asc' } }), deps);
    expect(asc.rows.map((x) => x.funding)).toEqual([-0.05, 0.03, null, null]);
  });

  it('sorts by an indicator column', async () => {
    const r = await runScreen(def({ columns: [rsi], sort: { by: 'col:0', dir: 'asc' } }), deps);
    expect(r.rows.map((x) => [x.symbol, x.values[0]])).toEqual([['AAAUSDT', 0], ['CCCUSDT', 50], ['BBBUSDT', 100]]);
  });

  it('refuses filters that cannot work', async () => {
    await expect(runScreen(def({ groups: [[{ type: 'indicator', left: rsi, operator: 'gt', right: { kind: 'indicator', id: 'ema', output: 'value' } }]] }), deps)).rejects.toThrow(/same units/);
    await expect(runScreen(def({ groups: [[{ type: 'indicator', left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 400 } }, operator: 'gt', right: { kind: 'value', value: 1 } }]] }), deps)).rejects.toThrow(/at most 1000/);
    await expect(runScreen(def({ columns: [{ kind: 'indicator', id: 'rsi', output: 'nope' }] }), deps)).rejects.toThrow(/Unknown column/);
  });

  it('shows each indicator once, close as the price column', () => {
    const cols = columnsOf(def({ groups: [[{ type: 'indicator', left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'gt', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 50 } } }, { type: 'indicator', left: rsi, operator: 'gt', right: { kind: 'value', value: 50 } }]], columns: [{ kind: 'indicator', id: 'rsi', output: 'value' }, { kind: 'indicator', id: 'ema', output: 'value', params: { length: 50 } }] }));
    expect(cols.map((c) => c.label)).toEqual(['EMA(50)', 'RSI(14)']);
  });
});
