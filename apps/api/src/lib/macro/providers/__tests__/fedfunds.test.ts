import { describe, expect, it, vi } from 'vitest';
import { macroFedWatchSchema } from '@tradinjournal/contracts';

vi.mock('../../../cache.js', () => ({ cacheGet: async () => null, cacheSet: async () => {} }));
const { freshQuotes, getFedWatch, parseZq } = await import('../fedfunds.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const day = (k: number) => Math.floor((NOW - k * 86_400_000) / 1000);

/** Yahoo daily chart body for one contract: two sessions. */
const chart = (prev: number, last: number, t = day(1)) => ({
  chart: { result: [{ meta: { regularMarketTime: t }, timestamp: [t - 86_400, t], indicators: { quote: [{ close: [prev, last] }] } }] },
});
const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Real closes from 13 Nov 2026 (ZQX26 … ZQX27), previous session first. */
const QUOTES: Record<string, [number, number]> = {
  ZQX26: [96.12, 96.1225], ZQZ26: [95.91, 95.925], ZQF27: [95.81, 95.82], ZQG27: [95.65, 95.66],
  ZQH27: [95.565, 95.58], ZQJ27: [95.465, 95.48], ZQK27: [95.385, 95.395], ZQM27: [95.315, 95.325],
  ZQN27: [95.28, 95.29], ZQQ27: [95.25, 95.255], ZQU27: [95.235, 95.235], ZQV27: [95.22, 95.22], ZQX27: [95.235, 95.235],
  ZQZ27: [95.255, 95.25],
};

function deps(over: (sym: string) => unknown = () => undefined) {
  const urls: string[] = [];
  return {
    urls,
    deps: {
      cache: false,
      now: () => NOW,
      get: async <T>(url: string): Promise<T> => {
        urls.push(url);
        const sym = decodeURIComponent(url.split('/chart/')[1]!.split('?')[0]!).replace('.CBT', '');
        const o = over(sym);
        if (o !== undefined) { if (o instanceof Error) throw o; return o as T; }
        const q = QUOTES[sym];
        if (!q) throw new Error('HTTP 404');
        return chart(q[0], q[1]) as T;
      },
    },
  };
}

describe('Fed funds futures (Yahoo ZQ)', () => {
  it('parses last and prior closes and rejects stale or junk data', () => {
    expect(parseZq(chart(95.9, 95.925), NOW)).toEqual({ last: 95.925, prev: 95.9, time: day(1) * 1000, day: iso(day(1)), prevDay: iso(day(2)) });
    // A session with no close (thin contract) falls back to the last real one, with its own day.
    const gap = { chart: { result: [{ meta: { regularMarketTime: day(1) }, timestamp: [day(3), day(2), day(1)], indicators: { quote: [{ close: [95.8, 95.9, null] }] } }] } };
    expect(parseZq(gap, NOW)).toMatchObject({ last: 95.9, prev: 95.8, day: iso(day(2)) });
    expect(parseZq(chart(95.9, 95.925, day(10)), NOW)).toBeNull();
    expect(parseZq({ chart: { result: [] } }, NOW)).toBeNull();
    expect(parseZq(chart(0, 0), NOW)).toBeNull();
  });

  it('keeps only quotes from the newest session', () => {
    const q = (day: string, prevDay: string | null, last = 95, prev = 95.1) => ({ last, prev, time: 0, day, prevDay });
    const { last, prev } = freshQuotes(['a', 'b', 'c', 'd'], [q('2026-11-13', '2026-11-12'), q('2026-11-12', '2026-11-11'), null, q('2026-11-13', '2026-11-10')]);
    expect([...last.keys()]).toEqual(['a', 'd']);
    expect([...prev.keys()]).toEqual(['a']); // d's prior close is from an older session
  });

  it('prices eight meetings from fourteen contracts (one meeting extra to solve the last), with a prior-day value', async () => {
    const { deps: d, urls } = deps();
    const fw = await getFedWatch(3.88, d);
    expect(fw).not.toBeNull();
    expect(macroFedWatchSchema.safeParse(fw).success).toBe(true);
    expect(urls).toHaveLength(14);
    expect(urls[0]).toBe('https://query1.finance.yahoo.com/v8/finance/chart/ZQX26.CBT?interval=1d&range=5d');
    expect(fw!.impliedNow).toBeCloseTo(3.8775, 4);
    expect(fw!.rows.map((r) => r.label)).toEqual(['Dec 9', 'Jan 27', 'Mar 17', 'Apr 28', 'Jun 9', 'Jul 28', 'Sep 15', 'Oct 27']);
    const dec = fw!.rows[0]!;
    expect(dec.hikePct).toBe(100);
    expect(dec.cutPct + dec.holdPct + dec.hikePct).toBeCloseTo(100, 6);
    expect(dec.cumulativeCuts).toBeCloseTo(-1.12, 2);
    expect(dec.cumulativeCutsYesterday).toBeCloseTo(-1.15, 2);
    for (const r of fw!.rows) expect(r.cutPct + r.holdPct + r.hikePct).toBeCloseTo(100, 6);
    // Oct 27 is late in its month: solved back from the Nov meeting, not blown up by a forward solve
    // (that gave +31 bp, "100% hike, 24% 50bp" and a −0.99 d/d jump on these same quotes).
    const oct = fw!.rows.at(-1)!;
    expect(Math.abs(oct.expectedBp)).toBeLessThan(10);
    expect(oct.bigMovePct).toBe(0);
    expect(Math.abs(oct.cumulativeCuts - oct.cumulativeCutsYesterday!)).toBeLessThan(0.2);
  });

  it('drops meetings from a contract with no quote in the newest session', async () => {
    // ZQM27's last close is a session older than the rest: June 2027 and later drop.
    const { deps: d } = deps((s) => (s === 'ZQM27' ? chart(95.315, 95.325, day(2)) : undefined));
    const fw = await getFedWatch(3.88, d);
    expect(fw!.rows.map((r) => r.label)).toEqual(['Dec 9', 'Jan 27', 'Mar 17', 'Apr 28']);
  });

  it('keeps the meetings it can chain when a later contract is missing', async () => {
    const { deps: d } = deps((s) => (s === 'ZQM27' ? new Error('HTTP 404') : undefined));
    const fw = await getFedWatch(3.88, d);
    // June 2027 missing: Apr solves from May (free), June can't, the chain stops there.
    expect(fw!.rows.map((r) => r.label)).toEqual(['Dec 9', 'Jan 27', 'Mar 17', 'Apr 28']);
  });

  it('is null when the first meeting cannot be priced', async () => {
    const { deps: d } = deps((s) => (s === 'ZQZ26' ? new Error('HTTP 404') : undefined));
    expect(await getFedWatch(3.88, d)).toBeNull();
    const { deps: all } = deps(() => new Error('timeout'));
    expect(await getFedWatch(null, all)).toBeNull();
  });
});
