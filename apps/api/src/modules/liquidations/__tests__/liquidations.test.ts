// Liquidation map + max pain with fake Binance / Bybit: no network.
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { liquidationMapDtoSchema, maxPainBoardDtoSchema } from '@tradinjournal/contracts';
import { liquidationMap, maxPainBoard, LiquidationsUnavailableError, type LiquidationsDeps } from '../liquidations.service.js';

const M15 = 15 * 60_000;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const START = NOW - 192 * M15;

/** Deterministic zig-zag path around `base`, recorded in Binance's shapes. */
function binanceFixture(base: number, bars: number, barMs: number) {
  const t0 = NOW - bars * barMs;
  const closes = Array.from({ length: bars }, (_, i) => base * (1 + 0.004 * Math.sin(i / 4) + (i % 2 ? 0.001 : -0.001)));
  const klines = closes.map((c, i) => {
    const o = closes[i - 1] ?? c;
    return [t0 + i * barMs, String(o), String(Math.max(o, c) * 1.002), String(Math.min(o, c) * 0.998), String(c), '1000', t0 + (i + 1) * barMs - 1, String(1000 * c), 500, i % 3 ? '600' : '400', String(500 * c), '0'];
  });
  const oiHist = Array.from({ length: bars + 1 }, (_, i) => ({ symbol: 'X', sumOpenInterest: String(50_000 + i * 40 - (i % 7 === 6 ? 120 : 0)), sumOpenInterestValue: '0', timestamp: t0 + i * barMs - barMs }));
  const ratio = Array.from({ length: bars + 1 }, (_, i) => ({ symbol: 'X', longAccount: '0.62', shortAccount: '0.38', longShortRatio: '1.63', timestamp: t0 + i * barMs - barMs }));
  return { klines, oiHist, oiNow: { symbol: 'X', openInterest: String(50_000 + bars * 40 + 100), time: NOW - 1000 }, ratio };
}

const BASE: Record<string, number> = { BTC: 67_000, ETH: 3_100, SOL: 160, XRP: 0.55, BNB: 600, DOGE: 0.2 };

interface FakeOpts { binanceDown?: string[]; bybitDown?: string[]; relay?: (path: string) => unknown }
function fake(opts: FakeOpts = {}) {
  const calls: string[] = [];
  const relayCalls: string[] = [];
  const relay = async <T>(path: string): Promise<T> => {
    relayCalls.push(path);
    if (!opts.relay) throw new Error('no market relay configured');
    return opts.relay(path) as T;
  };
  const get = async <T>(url: string): Promise<T> => {
    calls.push(url);
    const u = new URL(url);
    const symbol = u.searchParams.get('symbol') ?? '';
    const coin = symbol.replace(/USDT$/, '');
    if (u.hostname === 'fapi.binance.com') {
      if (opts.binanceDown?.includes(coin)) throw new Error('HTTP 451');
      const barMs = (u.searchParams.get('interval') ?? u.searchParams.get('period')) === '1h' ? 3_600_000 : M15;
      const limit = Number(u.searchParams.get('limit') ?? 0);
      const f = binanceFixture(BASE[coin]!, u.pathname.includes('klines') ? limit : limit - 1, barMs);
      if (u.pathname === '/fapi/v1/klines') return f.klines as T;
      if (u.pathname === '/futures/data/openInterestHist') return f.oiHist as T;
      if (u.pathname === '/fapi/v1/openInterest') return f.oiNow as T;
      if (u.pathname === '/futures/data/globalLongShortAccountRatio') return f.ratio as T;
    }
    if (u.hostname === 'api.bybit.com') {
      if (opts.bybitDown?.includes(coin)) throw new Error('timeout');
      const f = binanceFixture(BASE[coin]!, 192, M15);
      // Bybit lists newest first and has no taker split.
      if (u.pathname.endsWith('/kline')) return { retCode: 0, result: { list: f.klines.map((k) => k.slice(0, 7).map(String)).reverse() } } as T;
      if (u.pathname.endsWith('/open-interest')) return { retCode: 0, result: { list: f.oiHist.map((p) => ({ openInterest: p.sumOpenInterest, timestamp: String(p.timestamp) })).reverse() } } as T;
      if (u.pathname.endsWith('/account-ratio')) return { retCode: 0, result: { list: f.ratio.map((p) => ({ buyRatio: p.longAccount, sellRatio: p.shortAccount, timestamp: String(p.timestamp) })).reverse() } } as T;
    }
    throw new Error(`unexpected ${url}`);
  };
  const deps: LiquidationsDeps = { get, relay, now: () => NOW, cache: false };
  return { deps, calls, relayCalls };
}

describe('liquidationMap', () => {
  it('builds a contract-valid estimated ladder from Binance + Bybit, weighted by open interest', async () => {
    const { deps, calls } = fake();
    const d = await liquidationMap({ coin: 'BTC', window: '48h' }, deps);
    expect(() => liquidationMapDtoSchema.parse(d)).not.toThrow();
    expect(d).toMatchObject({ coin: 'BTC', symbol: 'BTCUSDT', window: '48h', estimated: true, lastHour: null, asOf: new Date(NOW).toISOString() });
    expect(d.path).toHaveLength(192);
    expect(d.path[0]!.t).toBe(new Date(START).toISOString());
    expect(d.price).toBe(d.path.at(-1)!.p);
    expect(d.bands.length).toBeGreaterThan(50);
    for (let i = 1; i < d.bands.length; i++) expect(d.bands[i]!.price).toBeGreaterThan(d.bands[i - 1]!.price);
    expect(d.bands.some((b) => b.longUsd > 0)).toBe(true);
    expect(d.bands.some((b) => b.shortUsd > 0)).toBe(true);
    expect(d.maxPain.longPrice).toBeLessThan(d.price);
    expect(d.maxPain.shortPrice).toBeGreaterThan(d.price);
    expect(d.maxPain.touchDownPct).not.toBeNull();
    expect(d.sources).toEqual(expect.arrayContaining([
      'Binance USDⓈ-M klines', 'Binance open interest history', 'Binance global long/short account ratio',
      'Bybit linear klines', 'Bybit open interest history', 'Bybit long/short account ratio',
    ]));
    // Fixture OI: Binance live 50,060 vs Bybit's latest 57,680 (same price) → 46 / 54.
    expect(d.sources).toContain('Weighted by open interest: Binance 46%, Bybit 54%');
    expect(d.sources.at(-1)).toBe('TRADElogs estimate (leverage-tier model)');
    expect(calls.some((c) => c.startsWith('https://fapi.binance.com/'))).toBe(true);
    expect(calls.some((c) => c.startsWith('https://api.bybit.com/'))).toBe(true);
    expect(calls.find((c) => c.includes('/klines'))).toContain('interval=15m&limit=192');
    // Path and price come from Binance.
    expect(d.price).toBe(d.path.at(-1)!.p);
  });

  it('uses hourly bars for the 7 day window', async () => {
    const { deps, calls } = fake();
    const d = await liquidationMap({ coin: 'ETH', window: '7d' }, deps);
    expect(d.path).toHaveLength(168);
    expect(calls.find((c) => c.includes('/klines'))).toContain('interval=1h&limit=168');
    expect(calls.find((c) => c.includes('openInterestHist'))).toContain('period=1h&limit=169');
  });

  it('uses Binance alone when Bybit does not answer', async () => {
    const { deps } = fake({ bybitDown: ['ETH'] });
    const d = await liquidationMap({ coin: 'ETH', window: '48h' }, deps);
    expect(d.sources.some((x) => x.startsWith('Bybit'))).toBe(false);
    expect(d.sources.some((x) => x.startsWith('Weighted'))).toBe(false);
    expect(d.bands.some((b) => b.longUsd > 0)).toBe(true);
  });

  it('a two-venue ladder holds more than either venue alone', async () => {
    const both = await liquidationMap({ coin: 'BTC', window: '48h' }, fake().deps);
    const bnOnly = await liquidationMap({ coin: 'BTC', window: '48h' }, fake({ bybitDown: ['BTC'] }).deps);
    const sum = (d: typeof both) => d.bands.reduce((s, b) => s + b.longUsd + b.shortUsd, 0);
    expect(sum(both)).toBeGreaterThan(sum(bnOnly) * 1.5);
    expect(both.step).toBe(bnOnly.step);
  });

  it('falls back to Bybit when Binance does not answer', async () => {
    const { deps, calls } = fake({ binanceDown: ['SOL'] });
    const d = await liquidationMap({ coin: 'SOL', window: '48h' }, deps);
    expect(() => liquidationMapDtoSchema.parse(d)).not.toThrow();
    expect(d.sources).toEqual(expect.arrayContaining(['Bybit linear klines', 'Bybit open interest history', 'Bybit long/short account ratio']));
    expect(d.sources.some((x) => x.startsWith('Binance'))).toBe(false);
    expect(d.path).toHaveLength(192);
    expect(d.path[0]!.t < d.path[1]!.t).toBe(true); // re-sorted oldest first
    expect(calls.some((c) => c.startsWith('https://api.bybit.com/v5/market/kline?category=linear&symbol=SOLUSDT&interval=15'))).toBe(true);
  });

  it('answers 503 when neither venue answers', async () => {
    const { deps } = fake({ binanceDown: ['XRP'], bybitDown: ['XRP'] });
    const err = await liquidationMap({ coin: 'XRP', window: '24h' }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LiquidationsUnavailableError);
    expect(err).toMatchObject({ statusCode: 503, code: 'LIQUIDATIONS_UNAVAILABLE' });
  });

  it('gives sub-cent coins fine bands', async () => {
    const { deps } = fake();
    const d = await liquidationMap({ coin: 'DOGE', window: '24h' }, deps);
    expect(d.step).toBeLessThan(0.001);
    expect(d.bands[0]!.price).toBeGreaterThan(0.15);
  });
});

describe('lastHour (relay liquidation feed)', () => {
  const recent = (over: Record<string, unknown> = {}) => () => ({ coin: 'BTC', windowMin: 60, totalUsd: 41_234_567.4, longUsd: 30e6, shortUsd: 11e6, longShare: 0.733, complete: true, ...over });

  it('fills lastHour from a fully covered hour', async () => {
    const { deps, relayCalls } = fake({ relay: recent() });
    const d = await liquidationMap({ coin: 'BTC', window: '48h' }, deps);
    expect(d.lastHour).toEqual({ totalUsd: 41_234_567, longShare: 0.733 });
    expect(relayCalls).toEqual(['/liquidations/recent?coin=BTC&window=60']);
    expect(() => liquidationMapDtoSchema.parse(d)).not.toThrow();
  });
  it('is null while the relay has not watched the whole hour', async () => {
    const d = await liquidationMap({ coin: 'BTC', window: '48h' }, fake({ relay: recent({ complete: false }) }).deps);
    expect(d.lastHour).toBeNull();
  });
  it('is null when the relay is missing or fails, and the ladder still answers', async () => {
    const d = await liquidationMap({ coin: 'BTC', window: '48h' }, fake().deps);
    expect(d.lastHour).toBeNull();
    const d2 = await liquidationMap({ coin: 'ETH', window: '24h' }, fake({ relay: () => { throw new Error('relay HTTP 502'); } }).deps);
    expect(d2.lastHour).toBeNull();
    expect(d2.bands.length).toBeGreaterThan(0);
  });
  it('a quiet hour is zero with no long share', async () => {
    const d = await liquidationMap({ coin: 'DOGE', window: '24h' }, fake({ relay: recent({ totalUsd: 0, longUsd: 0, shortUsd: 0, longShare: null }) }).deps);
    expect(d.lastHour).toEqual({ totalUsd: 0, longShare: null });
  });
  it('the max-pain board does not ask the relay', async () => {
    const { deps, relayCalls } = fake({ relay: recent() });
    await maxPainBoard(deps);
    expect(relayCalls).toEqual([]);
  });
});

describe('maxPainBoard', () => {
  it('has a row per coin in order', async () => {
    const { deps } = fake();
    const b = await maxPainBoard(deps);
    expect(() => maxPainBoardDtoSchema.parse(b)).not.toThrow();
    expect(b.rows.map((r) => r.coin)).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE']);
    for (const r of b.rows) {
      expect(r.longPrice).toBeLessThanOrEqual(r.price);
      expect(r.shortPrice).toBeGreaterThanOrEqual(r.price);
    }
  });
  it('leaves out coins with no data and fails only when none answer', async () => {
    const some = await maxPainBoard(fake({ binanceDown: ['BNB'], bybitDown: ['BNB'] }).deps);
    expect(some.rows.map((r) => r.coin)).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);
    const all = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'];
    await expect(maxPainBoard(fake({ binanceDown: all, bybitDown: all }).deps)).rejects.toBeInstanceOf(LiquidationsUnavailableError);
  });
});

// Routes: query validation and the 503 shape, with auth stubbed out and every upstream down
// (the service tests above inject their own fetcher, so this only reaches the default one).
vi.mock('../../../lib/market/http.js', () => ({
  fetchJson: async () => { throw new Error('HTTP 451'); },
  fetchRelayJson: async () => { throw new Error('no market relay configured'); },
}));
vi.mock('../../../http/middleware/require-auth.js', () => ({ requireAuth: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../http/middleware/require-platform-access.js', () => ({ requirePlatformAccess: (_q: unknown, _s: unknown, n: () => void) => n() }));

describe('liquidations routes', () => {
  let base = '';
  let close: () => void = () => {};
  beforeAll(async () => {
    const { liquidationsRouter } = await import('../liquidations.routes.js');
    const { errorHandler } = await import('../../../http/middleware/error-handler.js');
    const app = express();
    app.use('/api/liquidations', liquidationsRouter);
    app.use(errorHandler);
    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it('rejects unknown coins, windows and params with 422', async () => {
    for (const q of ['coin=PEPE', 'window=1h', 'coin=BTC&foo=1']) {
      const res = await fetch(`${base}/api/liquidations/map?${q}`);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('answers 503 with a readable message when the exchanges are down', async () => {
    for (const path of ['/map?coin=ETH&window=24h', '/max-pain']) {
      const res = await fetch(`${base}/api/liquidations${path}`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('LIQUIDATIONS_UNAVAILABLE');
      expect(body.error.message).toMatch(/didn’t answer/);
    }
  });
});
