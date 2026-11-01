// Options service against a fake Delta: no network.
import { describe, expect, it } from 'vitest';
import { bsGreeks, bsPrice, YEAR_MS } from '@tradinjournal/core';
import { analyzeLegs, chain, contract, contractCandles, optionsOverview, premiumSeries, replayLegs, templateFor, underlyings, type OptionsDeps } from '../options.service.js';

const NOW = Date.UTC(2026, 10, 2, 6);
const EXP = [{ code: '031126', at: Date.UTC(2026, 10, 3, 12) }, { code: '131126', at: Date.UTC(2026, 10, 13, 12) }, { code: '271126', at: Date.UTC(2026, 10, 27, 12) }];
const SPOT = 78_000;
function ticker(kind: 'call' | 'put', k: number, e: (typeof EXP)[number], und = 'BTC') {
  const T = (e.at - NOW) / YEAR_MS;
  const iv = 0.45 + (SPOT - k) / SPOT * 0.3;
  const mark = bsPrice(kind, SPOT, k, T, iv);
  const g = bsGreeks(kind, SPOT, k, T, iv);
  return {
    symbol: `${kind === 'call' ? 'C' : 'P'}-${und}-${k}-${e.code}`, product_id: k, contract_type: `${kind}_options`, underlying_asset_symbol: und, spot_price: String(SPOT), strike_price: String(k),
    mark_price: String(mark), close: mark, mark_change_24h: '1.5', volume: 0.5, turnover_usd: 1000, oi_contracts: String(kind === 'put' && k < SPOT ? 400 : 100), oi_value_usd: '5000', oi_change_usd_6h: '10',
    contract_value: '0.001', tick_size: '0.1',
    quotes: { best_bid: String(mark * 0.98), best_ask: String(mark * 1.02), bid_size: '200', ask_size: '150', bid_iv: String(iv - 0.01), ask_iv: String(iv + 0.01), mark_iv: String(iv) },
    greeks: { delta: String(g.delta), gamma: String(g.gamma), theta: String(g.theta), vega: String(g.vega), rho: '0' },
  };
}
const tickers = EXP.flatMap((e) => [70_000, 74_000, 76_000, 78_000, 80_000, 82_000, 86_000].flatMap((k) => [ticker('call', k, e), ticker('put', k, e)]));
tickers.push(ticker('call', 3000, EXP[0]!, 'ETH'));
const products = tickers.map((t) => ({ symbol: t.symbol, contract_type: t.contract_type, settlement_time: new Date(EXP.find((e) => t.symbol.endsWith(e.code))!.at).toISOString(), contract_value: '0.001', tick_size: '0.1', spot_index: { symbol: '.DEXBTUSD' }, state: 'live' }));
const calls: string[] = [];
const H = 3_600_000;
const deps: OptionsDeps = {
  now: () => NOW,
  cache: false,
  get: async <T>(env: string, path: string): Promise<T> => {
    calls.push(`${env}${path}`);
    if (path.startsWith('/v2/tickers')) return { success: true, result: env === 'testnet' ? tickers.slice(0, 4) : tickers } as T;
    if (path.startsWith('/v2/products')) return { success: true, result: products, meta: { after: null } } as T;
    if (path.startsWith('/v2/l2orderbook/')) return { success: true, result: { buy: [{ price: '100.5', size: 10 }], sell: [{ price: '102', size: 7 }] } } as T;
    if (path.startsWith('/v2/history/candles')) {
      const sym = decodeURIComponent(/symbol=([^&]+)/.exec(path)![1]!);
      // The index walks 76k → 80k over 5 hourly bars; marks are fair BS values at 45 %.
      const rows = [0, 1, 2, 3, 4].map((i) => {
        const t = NOW - (5 - i) * H;
        const spot = 76_000 + i * 1000;
        let c = spot;
        if (sym.startsWith('MARK:')) {
          const m = /MARK:([CP])-BTC-(\d+)-(\d{6})/.exec(sym)!;
          const exp = EXP.find((e) => e.code === m[3])!.at;
          c = bsPrice(m[1] === 'C' ? 'call' : 'put', spot, Number(m[2]), (exp - (t + H)) / YEAR_MS, 0.45);
        } else if (sym.startsWith('OI:')) c = 100 + i;
        return { time: t / 1000, open: c, high: c, low: c, close: c, volume: null };
      });
      return { success: true, result: rows.reverse() } as T;
    }
    throw new Error(`unexpected ${path}`);
  },
};

describe('options service', () => {
  it('lists underlyings and builds the chain for the nearest expiry a day or more out', async () => {
    const u = await underlyings('live', deps);
    expect(u.map((x) => [x.underlying, x.expiries])).toEqual([['BTC', 3], ['ETH', 1]]);
    const c = await chain('live', 'BTC', undefined, deps);
    expect(c.expiry).toBe('031126'); // 30 h away
    expect(c.expiries.map((e) => e.code)).toEqual(['031126', '131126', '271126']);
    expect(c.quotes).toHaveLength(14);
    expect(c.quotes[0]).toMatchObject({ symbol: 'C-BTC-70000-031126', kind: 'call', strike: 70_000, oi: 100, volume: 500, bidSize: 200 });
    expect(c.stats.atmStrike).toBe(78_000);
    expect(c.stats.atmIv!).toBeCloseTo(0.45, 6);
    expect((await chain('live', 'BTC', '271126', deps)).quotes.every((q) => q.expiryCode === '271126')).toBe(true);
    await expect(chain('live', 'BTC', '010101', deps)).rejects.toThrow(/No BTC expiry/);
    await expect(chain('live', 'SOL', undefined, deps)).rejects.toThrow(/No SOL options/);
    expect(calls.some((x) => x.startsWith('testnet'))).toBe(false);
  });
  it('summarises the market: term, skew, OI and gamma', async () => {
    const o = await optionsOverview('live', 'BTC', '131126', deps);
    expect(o.term).toHaveLength(3);
    expect(o.termSlope).toBeCloseTo(0, 6); // flat 45 % ATM in the fixture
    expect(o.expiries[0]!.rr25!).toBeLessThan(0);
    expect(o.putCallOi!).toBeGreaterThan(1);
    expect(o.strikes).toHaveLength(7);
    expect(o.strikes.find((r) => r.strike === 70_000)!.gex).toBeLessThan(0);
    expect(o.gammaCentre!).toBeGreaterThan(70_000);
  });
  it('returns a contract with its book, and IV solved from mark candles', async () => {
    const k = await contract('live', 'P-BTC-76000-131126', deps);
    expect(k.quote.kind).toBe('put');
    expect(k.book).toEqual({ bids: [{ price: 100.5, size: 10 }], asks: [{ price: 102, size: 7 }] });
    await expect(contract('live', 'P-BTC-75000-131126', deps)).rejects.toThrow(/isn't listed/);
    const iv = await contractCandles('live', 'C-BTC-80000-271126', 'iv', '1h', 1, deps);
    expect(iv.candles).toHaveLength(5);
    for (const c of iv.candles) expect(c.c!).toBeCloseTo(0.45, 4);
    const oi = await contractCandles('live', 'C-BTC-80000-271126', 'oi', '1h', 1, deps);
    expect(oi.candles.map((c) => c.c)).toEqual([100, 101, 102, 103, 104]); // oldest first
  });
  it('builds a rolling ATM straddle and a fixed strangle', async () => {
    const st = await premiumSeries('live', 'BTC', '271126', '1h', 1, null, deps);
    expect(st.points.map((p) => p.callStrike)).toEqual([76_000, 76_000, 78_000, 78_000, 80_000]); // 77k ties go to the lower strike
    expect(st.points[0]!.premium).toBeCloseTo(bsPrice('call', 76_000, 76_000, (EXP[2]!.at - (NOW - 4 * H)) / YEAR_MS, 0.45) * 2, 6);
    const sg = await premiumSeries('live', 'BTC', '271126', '1h', 1, { put: 74_000, call: 82_000 }, deps);
    expect(sg.points.every((p) => p.putStrike === 74_000 && p.callStrike === 82_000)).toBe(true);
  });
  it('analyses legs priced from the chain and resolves templates', async () => {
    const a = await analyzeLegs('live', 'BTC', { legs: [{ kind: 'call', side: 1, qty: 10, strike: 80_000, expiry: '131126' }, { kind: 'call', side: -1, qty: 10, strike: 86_000, expiry: '131126' }] }, deps);
    expect(a.legs.map((l) => l.symbol)).toEqual(['C-BTC-80000-131126', 'C-BTC-86000-131126']);
    expect(a.summary.maxProfit! + a.summary.netPremium).toBeCloseTo(6000 * 10 * 0.001, 6);
    expect(a.summary.maxLoss).toBeCloseTo(-a.summary.netPremium, 6);
    expect(a.summary.breakevens).toHaveLength(1);
    expect(a.payoff.length).toBe(161);
    expect(a.payoff[0]!.s).toBeLessThan(80_000);
    expect(a.payoff.at(-1)!.s).toBeGreaterThan(86_000);
    expect(a.analysis.legs.map((l) => l.fill)).toEqual(['easy', 'easy']);
    expect(a.sigma!.lo).toBeLessThan(SPOT);
    await expect(analyzeLegs('live', 'BTC', { legs: [{ kind: 'call', side: 1, qty: 1, strike: 81_000, expiry: '131126' }] }, deps)).rejects.toThrow(/Leg 1: no BTC call at 81000/);
    const ic = await templateFor('live', 'BTC', 'iron_condor', '131126', 2, deps);
    expect(ic.map((l) => `${l.side > 0 ? '+' : '-'}${l.kind}${l.strike}`)).toEqual(['+put70000', '-put74000', '-call82000', '+call86000']);
    const cal = await templateFor('live', 'BTC', 'calendar_call', '131126', 1, deps);
    expect(cal.map((l) => l.expiry)).toEqual(['131126', '271126']);
    await expect(templateFor('live', 'BTC', 'calendar_call', '271126', 1, deps)).rejects.toThrow(/later expiry/);
  });
  it('replays legs to expiry on a flat or a recorded path', async () => {
    const legs = [{ kind: 'call' as const, side: -1 as const, qty: 1, strike: 78_000, expiry: '031126' }, { kind: 'put' as const, side: -1 as const, qty: 1, strike: 78_000, expiry: '031126' }];
    const flat = await replayLegs('live', 'BTC', { legs, path: 'flat' }, deps);
    const f = flat.replay.frames;
    expect(f[0]!.t).toBe(NOW);
    expect(f.at(-1)!.t).toBe(EXP[0]!.at);
    expect(f.length).toBe(31); // hourly over 30 h
    expect(f[0]!.pnl).toBeCloseTo(0, 6);
    expect(f.at(-1)!.pnl).toBeCloseTo(flat.legs.reduce((a, l) => a + l.price, 0) * 0.001, 6); // the whole premium kept
    expect(flat.replay.grid).toHaveLength(61);
    const rec = await replayLegs('live', 'BTC', { legs, path: 'recorded' }, deps);
    // The fixture index rose 76k → 80k (+5.26 %): replayed from today's 78k.
    expect(rec.replay.frames.at(-1)!.spot).toBeCloseTo(78_000 * 80 / 76, 6);
    expect(rec.recorded).toEqual({ from: NOW - 5 * H, to: NOW - H });
    await expect(replayLegs('live', 'BTC', { legs: [{ kind: 'future', side: 1, qty: 1 }], path: 'flat' }, deps)).rejects.toThrow(/at least one option/);
  });
  it('reads testnet listings when asked', async () => {
    const c = await chain('testnet', 'BTC', undefined, deps);
    expect(c.env).toBe('testnet');
    expect(c.quotes.length).toBe(4);
  });
});
