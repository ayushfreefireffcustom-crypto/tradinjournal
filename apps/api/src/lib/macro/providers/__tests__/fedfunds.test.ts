import { describe, expect, it, vi } from 'vitest';
import { macroFedWatchSchema } from '@tradinjournal/contracts';

vi.mock('../../../cache.js', () => ({ cacheGet: async () => null, cacheSet: async () => {} }));
const { getFedWatch, parseZq } = await import('../fedfunds.js');

const NOW = Date.UTC(2026, 10, 14, 12);
const day = (k: number) => Math.floor((NOW - k * 86_400_000) / 1000);

/** Yahoo daily chart body for one contract: two sessions. */
const chart = (prev: number, last: number, t = day(1)) => ({
  chart: { result: [{ meta: { regularMarketTime: t }, timestamp: [day(2), day(1)], indicators: { quote: [{ close: [prev, null, last].filter((x) => x !== null) }] } }] },
});

/** Real closes from 13 Nov 2026 (ZQX26 … ZQX27), previous session first. */
const QUOTES: Record<string, [number, number]> = {
  ZQX26: [96.12, 96.1225], ZQZ26: [95.91, 95.925], ZQF27: [95.81, 95.82], ZQG27: [95.65, 95.66],
  ZQH27: [95.565, 95.58], ZQJ27: [95.465, 95.48], ZQK27: [95.385, 95.395], ZQM27: [95.315, 95.325],
  ZQN27: [95.28, 95.29], ZQQ27: [95.25, 95.255], ZQU27: [95.235, 95.235], ZQV27: [95.22, 95.22], ZQX27: [95.235, 95.235],
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
    expect(parseZq(chart(95.9, 95.925), NOW)).toEqual({ last: 95.925, prev: 95.9, time: day(1) * 1000 });
    expect(parseZq(chart(95.9, 95.925, day(10)), NOW)).toBeNull();
    expect(parseZq({ chart: { result: [] } }, NOW)).toBeNull();
    expect(parseZq(chart(0, 0), NOW)).toBeNull();
  });

  it('prices eight meetings from thirteen contracts, with a prior-day value', async () => {
    const { deps: d, urls } = deps();
    const fw = await getFedWatch(3.88, d);
    expect(fw).not.toBeNull();
    expect(macroFedWatchSchema.safeParse(fw).success).toBe(true);
    expect(urls).toHaveLength(13);
    expect(urls[0]).toBe('https://query1.finance.yahoo.com/v8/finance/chart/ZQX26.CBT?interval=1d&range=5d');
    expect(fw!.impliedNow).toBeCloseTo(3.8775, 4);
    expect(fw!.rows.map((r) => r.label)).toEqual(['Dec 9', 'Jan 27', 'Mar 17', 'Apr 28', 'Jun 9', 'Jul 28', 'Sep 15', 'Oct 27']);
    const dec = fw!.rows[0]!;
    expect(dec.hikePct).toBe(100);
    expect(dec.cutPct + dec.holdPct + dec.hikePct).toBeCloseTo(100, 6);
    expect(dec.cumulativeCuts).toBeCloseTo(-1.12, 2);
    expect(dec.cumulativeCutsYesterday).toBeCloseTo(-1.15, 2);
    for (const r of fw!.rows) expect(r.cutPct + r.holdPct + r.hikePct).toBeCloseTo(100, 6);
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
