import { describe, it, expect } from 'vitest';
import { MOCK_ACCOUNTS, statsFor } from './mock-data';
import {
  insightTrades, mockAnalytics, mockAsk, mockBook, mockDashboard, mockExtras, mockPathCandles, mockTradeReview,
  mockGate, mockTradeCandles, mockTradelog, mockTradelogPaths, mockTradelogTrade, MOCKS_ON, schemas, seeded, tlTrades,
} from './mock-insights';

const acc = MOCK_ACCOUNTS[0]!.id;
const q = (extra: Record<string, string> = {}) => schemas.dashboard.parse({ accountId: acc, range: 'ALL', ...extra });

describe('seeded extras', () => {
  it('is deterministic per position and keeps R in step with the $ result', () => {
    const { trades } = statsFor(acc);
    const a = mockExtras(trades), b = mockExtras(trades);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const withR = trades.filter(t => a.get(t.positionId)!.r != null);
    expect(withR.length / trades.length).toBeGreaterThan(0.6);
    for (const t of withR) expect(Math.sign(a.get(t.positionId)!.r!)).toBe(Math.sign(t.netPnl));
    for (const t of trades) {
      const x = a.get(t.positionId)!;
      expect(x.mae!).toBeLessThanOrEqual(0);
      expect(x.mfe!).toBeGreaterThanOrEqual(0);
    }
    expect(seeded('a')()).toBe(seeded('a')());
  });
});

describe('book', () => {
  it('maps the same closed trades /data/trades returns', () => {
    const b = mockBook(acc);
    expect(insightTrades(b)).toHaveLength(statsFor(acc).trades.filter(t => t.status === 'CLOSED').length);
    expect(tlTrades(b).every(t => t.status === 'CLOSED' && t.close != null)).toBe(true);
    // Seeded journal tags reach the insight trades.
    expect(insightTrades(b).some(t => t.tags.length > 0)).toBe(true);
  });
});

describe('endpoints run the real compute', () => {
  it('dashboard: KPIs, grades and R from the book', () => {
    const d = mockDashboard(q());
    expect(d).toBeTruthy();
    const json = JSON.stringify(d);
    expect(json.length).toBeGreaterThan(1000);
    // Same input → same output (seeded), apart from time-derived fields.
    expect(Object.keys(mockDashboard(q()))).toEqual(Object.keys(d));
  });

  it('analytics answers every view', () => {
    const a = mockAnalytics(q());
    expect(a.counts.allClosed).toBe(insightTrades(mockBook(acc)).length);
    expect(a.counts.withR).toBeGreaterThan(0);
    expect(a.counts.withMae).toBeGreaterThan(0);
  });

  it('ask answers a weekday question', () => {
    const r = mockAsk({ ...q(), q: 'How do I do on Fridays?' });
    expect(r).toBeTruthy();
  });

  it('trade log pages, finds a trade and draws paths', () => {
    const log = mockTradelog(schemas.tradelog.parse({ accountId: acc, limit: '10' }));
    expect(log.rows.length).toBe(10);
    const id = log.rows[0]!.id;
    expect(mockTradelogTrade(acc, id)).toBeTruthy();
    expect(mockTradelogTrade(acc, 'nope')).toBeNull();
    const { paths } = mockTradelogPaths(acc, [id, 'nope']);
    expect(paths[id]).toBeTruthy();
    expect(paths.nope).toBeNull();
  });

  it('trade review for a known position, null for an unknown one', () => {
    const id = statsFor(acc).trades[3]!.positionId;
    expect(mockTradeReview(acc, id)).toBeTruthy();
    expect(mockTradeReview(acc, 'missing')).toBeNull();
  });

  it('path candles start at the entry side and end at the exit', () => {
    const t = tlTrades(mockBook(acc))[0]!;
    const c = mockPathCandles(t, { tf: '5m', ms: 300_000 });
    expect(c.length).toBeGreaterThan(1);
    for (const k of c) expect(k.high).toBeGreaterThanOrEqual(k.low);
    expect(c.at(-1)!.openTime).toBeGreaterThanOrEqual(t.close! - 300_000);
  });
});

describe('gate and candles', () => {
  it('404s outside mock mode', async () => {
    // Tests run without NEXT_PUBLIC_USE_MOCKS, like a production build.
    expect(MOCKS_ON).toBe(process.env.NEXT_PUBLIC_USE_MOCKS === 'true');
    if (!MOCKS_ON) expect(mockGate()?.status).toBe(404);
  });

  it('trade-anchored candles pass through the entry and exit', () => {
    const t = statsFor(acc).trades.find(x => x.closeTime)!;
    const open = new Date(t.openTime).getTime(), close = new Date(t.closeTime!).getTime();
    const bars = mockTradeCandles(acc, t.symbol, '5m', Math.floor(open / 1000) - 3600, Math.ceil(close / 1000) + 3600);
    expect(bars.length).toBeGreaterThan(10);
    const at = (ms: number) => bars.reduce((b, c) => (Math.abs(c.openTime - ms) < Math.abs(b.openTime - ms) ? c : b));
    const tol = Math.abs(t.entryPrice) * 0.01;
    expect(Math.abs(at(open).close - t.entryPrice)).toBeLessThan(tol);
    expect(Math.abs(at(close).close - t.exitPrice!)).toBeLessThan(tol);
    expect(mockTradeCandles(acc, 'NOPE', '5m', 0, 1000)).toEqual([]);
  });
});
