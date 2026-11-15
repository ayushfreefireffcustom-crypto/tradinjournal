import { describe, it, expect } from 'vitest';
import {
  assetContributions,
  buildSurpriseGrid,
  computeRegimeTrail,
  contributionCell,
  cutsImplied,
  flipsIf,
  nearBoundary,
  netBias,
  parseReleaseNumber,
  regimeFromCoords,
  regimeLine,
  scoreAsset,
  shiftMonth,
  SURPRISE_SERIES,
  surpriseLevel,
  releaseValue,
  MACRO_ASSETS,
  SCORE_SCALE,
} from '../macro/index.js';
import type { EngineInput, MonthlyObs } from '../macro/index.js';

const words = (s: string) => s.trim().split(/\s+/).length;

function input(): EngineInput {
  return {
    indicators: [
      { key: 'CPILFESL', value: 312, prev: 311 }, // inflation up
      { key: 'PAYEMS', value: 159_000, prev: 159_100 }, // growth down
      { key: 'UNRATE', value: 4.5, prev: 4.4 },
      { key: 'DFF', value: 3.9, prev: 3.9 }, // flat policy
      { key: 'DGS10', value: 4.2, prev: 4.1 }, // yields up
      { key: 'NET_LIQUIDITY', value: 5_700_000, prev: 5_760_000 }, // draining
      { key: 'BAMLH0A0HYM2', value: 3.0, prev: 3.0 },
      { key: 'VIXCLS', value: 18, prev: 17.9 },
      { key: 'DTWEXBGS', value: 121, prev: 120 }, // dollar up
    ],
    markets: [],
  };
}

describe('contributions', () => {
  it('buckets raw contributions to −2..+2', () => {
    expect(contributionCell(0)).toBe(0);
    expect(contributionCell(0.3)).toBe(1);
    expect(contributionCell(-0.3)).toBe(-1);
    expect(contributionCell(0.7)).toBe(2);
    expect(contributionCell(-1.3)).toBe(-2);
    expect(contributionCell(Number.NaN)).toBe(0);
  });

  it('sums to the same score scoreAsset produces', () => {
    for (const a of MACRO_ASSETS) {
      const c = assetContributions(a, input());
      const sum = c.reduce((s, x) => s + x.raw, 0);
      const expected = Math.max(0, Math.min(100, Math.round(50 + SCORE_SCALE * sum)));
      expect(scoreAsset(a, input()).score).toBe(expected);
      expect(c).toHaveLength(8);
    }
  });

  it('flat factors contribute zero', () => {
    const c = assetContributions('XAU', input());
    expect(c.find(x => x.factor === 'policy')!.cell).toBe(0);
    // Dollar up pushes gold down hard (−1.1).
    expect(c.find(x => x.factor === 'dollar')!.cell).toBe(-2);
  });

  it('maps score to net bias', () => {
    expect(netBias(50)).toBe(0);
    expect(netBias(0)).toBe(-100);
    expect(netBias(100)).toBe(100);
    expect(netBias(27.5)).toBe(-45);
  });
});

describe('flipsIf', () => {
  it('returns a flip that changes the label and pushes against the lean', () => {
    for (const a of MACRO_ASSETS) {
      const base = scoreAsset(a, input());
      const f = flipsIf(a, input());
      if (!f) continue;
      expect(f.label).not.toBe(base.label);
      if (base.score <= 45) expect(f.score).toBeGreaterThan(base.score);
      if (base.score >= 55) expect(f.score).toBeLessThan(base.score);
      expect(words(f.text)).toBeLessThanOrEqual(4);
    }
  });

  it('is deterministic', () => {
    expect(flipsIf('BTC', input())).toEqual(flipsIf('BTC', input()));
  });

  it('can flip a flat factor', () => {
    const empty: EngineInput = { indicators: [], markets: [] };
    // Neutral asset with every factor flat: the biggest single move wins.
    const f = flipsIf('SPX', empty);
    expect(f).not.toBeNull();
    expect(['growth', 'credit', 'risk']).toContain(f!.factor);
  });

  it('returns null when no single flip changes the label', () => {
    // Saturated: every factor pushing BTC down hard.
    const bear: EngineInput = {
      indicators: [
        { key: 'CPILFESL', value: 2, prev: 1 },
        { key: 'DFF', value: 5, prev: 4 },
        { key: 'PAYEMS', value: 1, prev: 2 },
        { key: 'UNRATE', value: 5, prev: 4 },
        { key: 'DGS10', value: 5, prev: 4 },
        { key: 'NET_LIQUIDITY', value: 1, prev: 100_000 },
        { key: 'BAMLH0A0HYM2', value: 5, prev: 4 },
        { key: 'VIXCLS', value: 30, prev: 20 },
        { key: 'DTWEXBGS', value: 130, prev: 120 },
      ],
      markets: [],
    };
    expect(scoreAsset('BTC', bear).score).toBeLessThan(15);
    expect(flipsIf('BTC', bear)).toBeNull();
  });
});

/** Monthly series from 2024-01 with a value function of month index. */
function series(n: number, fn: (k: number) => number): MonthlyObs[] {
  return Array.from({ length: n }, (_, k) => ({
    date: `${shiftMonth('2024-01', k)}-01`,
    value: fn(k),
  }));
}

describe('regime trail', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-11', -12)).toBe('2025-11');
  });

  it('labels quadrants from coordinates', () => {
    expect(regimeFromCoords(1, 1)).toBe('Reflation');
    expect(regimeFromCoords(1, -1)).toBe('Goldilocks');
    expect(regimeFromCoords(-1, 1)).toBe('Stagflation');
    expect(regimeFromCoords(-1, -1)).toBe('Deflation');
    expect(regimeFromCoords(0, 0)).toBe('Deflation');
  });

  it('needs enough history', () => {
    expect(computeRegimeTrail({ coreCpi: series(10, k => 300 + k), payrolls: series(10, k => k), unemployment: series(10, () => 4) })).toBeNull();
  });

  it('computes 12 points with accelerating inflation and improving growth = Reflation', () => {
    // Core CPI growth rate accelerates over time → y/y rising.
    let lvl = 300;
    const cpi = series(34, k => (lvl *= 1 + (0.001 + k * 0.0001)));
    // Payroll gains accelerate; unemployment falls.
    let emp = 150_000;
    const nfp = series(34, k => (emp += 50 + k * 10));
    const ur = series(34, k => 5 - k * 0.05);
    const t = computeRegimeTrail({ coreCpi: cpi, payrolls: nfp, unemployment: ur })!;
    expect(t).not.toBeNull();
    expect(t.points).toHaveLength(12);
    expect(t.label).toBe('Reflation');
    expect(t.points.every(p => Math.abs(p.growth) <= 2 && Math.abs(p.inflation) <= 2)).toBe(true);
    expect(t.months).toBeGreaterThanOrEqual(12); // whole computable history is reflation
    expect(t.points.at(-1)!.month).toBe(shiftMonth('2024-01', 33));
    expect(words(t.line)).toBeLessThanOrEqual(8);
  });

  it('counts the current run from where the quadrant last changed', () => {
    let lvl = 300;
    // Inflation accelerating until month 26, decelerating after.
    const cpi = series(34, k => (lvl *= 1 + (k < 26 ? 0.001 + k * 0.0001 : 0.0036 - (k - 26) * 0.0006)));
    let emp = 150_000;
    const nfp = series(34, k => (emp += 50 + k * 10));
    const ur = series(34, k => 5 - k * 0.05);
    const t = computeRegimeTrail({ coreCpi: cpi, payrolls: nfp, unemployment: ur })!;
    expect(t.label).toBe('Goldilocks');
    expect(t.months).toBeLessThan(12);
    expect(t.since).toBe(t.points[t.points.length - t.months]!.month);
  });

  it('writes a drift line near a boundary', () => {
    const line = regimeLine([
      { growth: 1.2, inflation: 0.9 },
      { growth: 1.0, inflation: 0.9 },
      { growth: 0.7, inflation: 1.0 },
      { growth: 0.3, inflation: 1.1 },
    ]);
    expect(line).toBe('Drifting toward stagflation as growth slows');
    expect(words(line)).toBeLessThanOrEqual(8);
    expect(nearBoundary({ growth: 0.3, inflation: 1.1 })).toEqual({ axis: 'growth', label: 'Stagflation' });
    expect(nearBoundary({ growth: 1.3, inflation: 1.1 })).toBeNull();
    expect(regimeLine([{ growth: -1.5, inflation: 1.5 }, { growth: -1.6, inflation: 1.6 }])).toBe('Growth slowing, inflation rising');
  });
});

describe('policy proxy', () => {
  it('converts the EFFR − yield gap into 25bp cuts', () => {
    expect(cutsImplied(3.88, 3.38)).toBe(2);
    expect(cutsImplied(3.88, 4.13)).toBe(-1);
    expect(cutsImplied(3.88, 3.75)).toBe(0.5);
  });
});

describe('surprise grid', () => {
  it('parses release numbers', () => {
    expect(parseReleaseNumber('245K')).toBe(245_000);
    expect(parseReleaseNumber('0.3%')).toBe(0.3);
    expect(parseReleaseNumber('-1.2M')).toBe(-1_200_000);
    expect(parseReleaseNumber('1,234')).toBe(1234);
    expect(parseReleaseNumber('−0.1%')).toBe(-0.1);
    expect(parseReleaseNumber('n/a')).toBeNull();
    expect(parseReleaseNumber(null)).toBeNull();
  });

  it('scores hotter-than-forecast with polarity', () => {
    const cpi = SURPRISE_SERIES.find(s => s.key === 'cpi')!;
    const claims = SURPRISE_SERIES.find(s => s.key === 'claims')!;
    expect(surpriseLevel(cpi, '0.4%', '0.3%')).toBe(1);
    expect(surpriseLevel(cpi, '0.5%', '0.3%')).toBe(2);
    expect(surpriseLevel(cpi, '0.3%', '0.3%')).toBe(0);
    expect(surpriseLevel(cpi, '0.1%', '0.3%')).toBe(-2);
    // Lower claims than forecast = hotter labour market.
    expect(surpriseLevel(claims, '210K', '225K')).toBe(2);
    expect(surpriseLevel(claims, '230K', '225K')).toBe(-1);
    expect(surpriseLevel(cpi, null, '0.3%')).toBeNull();
  });

  it('reads bare payrolls and claims as thousands (TradingView sends "165" for 165K)', () => {
    const nfp = SURPRISE_SERIES.find(s => s.key === 'payrolls')!;
    const claims = SURPRISE_SERIES.find(s => s.key === 'claims')!;
    expect(releaseValue(nfp, '165')).toBe(165_000);
    expect(releaseValue(nfp, '-140')).toBe(-140_000);
    expect(releaseValue(nfp, '85K')).toBe(85_000);
    expect(releaseValue(nfp, '165000')).toBe(165_000); // already in units
    expect(releaseValue(SURPRISE_SERIES.find(s => s.key === 'cpi')!, '0.3')).toBe(0.3);
    // Real Nov 2026 release: 165K vs 65K forecast, a big beat. Mixed sources still compare.
    expect(surpriseLevel(nfp, '165', '65')).toBe(2);
    expect(surpriseLevel(nfp, '55', '85K')).toBe(-1);
    expect(surpriseLevel(claims, '200', '195')).toBe(-1); // 5K more claims than forecast: cooler
  });

  it('builds a 12-month grid with gaps as null and a streak line', () => {
    const g = buildSurpriseGrid(
      [
        { title: 'Inflation Rate MoM', eventTime: '2026-09-11T12:30:00Z', actual: '0.4%', forecast: '0.3%' },
        { title: 'Inflation Rate MoM', eventTime: '2026-10-15T12:30:00Z', actual: '0.4%', forecast: '0.3%' },
        { title: 'Core CPI m/m', eventTime: '2026-11-13T13:30:00Z', actual: '0.5%', forecast: '0.3%' },
        { title: 'Initial Jobless Claims', eventTime: '2026-11-06T13:30:00Z', actual: '210K', forecast: '225K' },
        { title: 'Initial Jobless Claims', eventTime: '2026-11-13T13:30:00Z', actual: '240K', forecast: '225K' },
        { title: 'Non Farm Payrolls', eventTime: '2026-11-06T13:30:00Z', actual: '50K', forecast: null },
        { title: 'Retail Sales Ex Autos MoM', eventTime: '2026-11-14T13:30:00Z', actual: '1.0%', forecast: '0.1%' },
      ],
      '2026-11',
    );
    expect(g.months).toHaveLength(12);
    expect(g.months[0]).toBe('2025-12');
    expect(g.months[11]).toBe('2026-11');
    const cpi = g.series.find(s => s.key === 'cpi')!;
    expect(cpi.cells[0]!.level).toBeNull();
    expect(cpi.cells[9]!.level).toBe(1);
    const claims = g.series.find(s => s.key === 'claims')!;
    expect(claims.cells[11]!.level).toBe(0); // weekly: mean of +2 and −2
    expect(g.series.find(s => s.key === 'payrolls')!.cells[11]!.level).toBeNull();
    expect(g.series.find(s => s.key === 'retail')!.cells[11]!.level).toBeNull(); // ex-autos isn't headline
    expect(g.line).toBe('Inflation beat forecast three months running');
    expect(g.releases).toBe(3);
  });
});

describe('yoy', () => {
  it('fills a single missing base month from its neighbours', async () => {
    const { yoy } = await import('../macro/index.js');
    const m = new Map([['2025-09', 100], ['2025-11', 104.04], ['2026-10', 110]]);
    expect(yoy(m, '2026-10')).toBeCloseTo((110 / 102 - 1) * 100, 6);
    expect(yoy(new Map([['2026-10', 110]]), '2026-10')).toBeNull();
  });
});

describe('resolveRegime', () => {
  it('uses the trail latest point over classifyRegime', async () => {
    const { resolveRegime, classifyRegime } = await import('../macro/index.js');
    const inp: EngineInput = {
      indicators: [
        { key: 'CPILFESL', value: 339.9, prev: 338.9 }, // index up → classifyRegime says inflation up
        { key: 'PAYEMS', value: 159_293, prev: 159_044 },
        { key: 'UNRATE', value: 4.1, prev: 4.2 },
      ],
      markets: [],
    };
    const old = classifyRegime(inp);
    expect(old.label).toBe('Reflation');
    const r = resolveRegime(
      { label: 'Goldilocks', points: [{ month: '2026-09', growth: 0.5, inflation: 0.2, label: 'Reflation' }, { month: '2026-10', growth: 0.59, inflation: -0.45, label: 'Goldilocks' }] },
      inp,
      old,
    )!;
    expect(r).toEqual({ growth: 'up', inflation: 'down', label: 'Goldilocks', recessionOdds: old.recessionOdds });
  });

  it('falls back to classifyRegime without a trail', async () => {
    const { resolveRegime, classifyRegime } = await import('../macro/index.js');
    const inp: EngineInput = { indicators: [{ key: 'UNRATE', value: 4.1, prev: 4.2 }], markets: [] };
    const old = classifyRegime(inp);
    expect(resolveRegime(null, inp, old)).toBe(old);
    expect(resolveRegime(null, inp, null)).toBeNull();
  });

  it('computes recession odds when there is no fallback', async () => {
    const { resolveRegime, recessionOdds } = await import('../macro/index.js');
    const inp: EngineInput = { indicators: [{ key: 'T10Y2Y', value: -0.3, prev: -0.2 }], markets: [] };
    const r = resolveRegime({ label: 'Deflation', points: [{ month: '2026-10', growth: -1, inflation: -1, label: 'Deflation' }] }, inp, null)!;
    expect(r.recessionOdds).toBe(recessionOdds(inp));
    expect(r.growth).toBe('down');
  });
});
