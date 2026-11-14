import { describe, it, expect, vi, beforeEach } from 'vitest';
import { macroOverviewSchema } from '@tradinjournal/contracts';
import { shiftMonth } from '@tradinjournal/core';

const indicatorFindMany = vi.fn();
const queryRaw = vi.fn();
const eventFindMany = vi.fn();

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    macroIndicator: { findMany: indicatorFindMany },
    economicEvent: { findMany: eventFindMany },
    $queryRaw: queryRaw,
  },
  Prisma: { join: (xs: unknown[]) => xs },
}));

const {
  asOfJoin,
  biasHistory,
  buildInputs,
  buildMacroOverview,
  cutsSeries,
  netLiquiditySeries,
  OVERVIEW_ASSETS,
  OVERVIEW_DRIVERS,
} = await import('../macro-overview.service.js');
const { toEngineInput } = await import('../../../lib/macro/engine-input.js');

describe('overview helpers', () => {
  it('as-of joins the latest value at or before each date', () => {
    const on = [{ date: '2026-01-05', value: 0 }, { date: '2026-01-12', value: 0 }];
    const s = [{ date: '2026-01-03', value: 1 }, { date: '2026-01-10', value: 2 }];
    expect(asOfJoin(on, s)).toEqual([1, 2]);
    expect(asOfJoin([{ date: '2026-01-01', value: 0 }], s)).toEqual([null]);
  });

  it('computes weekly net liquidity in mn$ (RRP is bn$)', () => {
    const out = netLiquiditySeries(
      [{ date: '2026-01-07', value: 6_600_000 }],
      [{ date: '2026-01-07', value: 800_000 }],
      [{ date: '2026-01-06', value: 100 }],
    );
    expect(out).toEqual([{ date: '2026-01-07', value: 5_700_000 }]);
  });

  it('turns yields into cuts implied vs EFFR', () => {
    const s = cutsSeries(
      [{ date: '2026-01-01', value: 3.88 }],
      [{ date: '2026-01-02', value: 3.38 }, { date: '2026-01-03', value: 3.63 }],
    );
    expect(s.map(x => x.value)).toEqual([2, 1]);
  });

  it('keeps yesterday only when the previous UTC day has a snapshot', () => {
    const h = biasHistory([{ day: '2026-11-12', score: 40 }, { day: '2026-11-13', score: 30 }, { day: '2026-11-14', score: 99 }], -50, '2026-11-14');
    expect(h.yesterday).toBe(-40);
    expect(h.trend).toEqual([-20, -40, -50]); // today's stored bucket replaced by the live value
    expect(biasHistory([{ day: '2026-11-10', score: 40 }], 0, '2026-11-14').yesterday).toBeNull();
  });

  it('builds the four inputs with tones', () => {
    const months = 26;
    let lvl = 300;
    const coreCpi = Array.from({ length: months }, (_, k) => ({ date: `${shiftMonth('2024-09', k)}-01`, value: (lvl *= 1.0025) }));
    const unemployment = Array.from({ length: 12 }, (_, k) => ({ date: `${shiftMonth('2025-11', k)}-01`, value: 4 + k * 0.05 }));
    const inputs = buildInputs({
      coreCpi,
      unemployment,
      effr: [{ date: '2026-11-01', value: 3.88 }],
      twoYear: [{ date: '2026-11-10', value: 3.5 }, { date: '2026-11-11', value: 3.4 }],
      netLiq: Array.from({ length: 6 }, (_, k) => ({ date: `2026-10-${String(1 + k * 5).padStart(2, '0')}`, value: 5_800_000 - k * 20_000 })),
    });
    expect(inputs.map(i => i.key)).toEqual(['core_cpi', 'policy', 'unemployment', 'net_liquidity']);
    const pol = inputs.find(i => i.key === 'policy')!;
    expect(pol.value).toBe(1.9);
    expect(pol.tone).toBe('pos'); // more cuts priced
    expect(inputs.find(i => i.key === 'unemployment')!.tone).toBe('neg');
    const nl = inputs.find(i => i.key === 'net_liquidity')!;
    expect(nl.delta).toBe(-80_000);
    expect(nl.tone).toBe('neg');
    expect(inputs.find(i => i.key === 'core_cpi')!.value).toBeCloseTo(3.0, 0);
  });
});

describe('buildMacroOverview', () => {
  beforeEach(() => {
    indicatorFindMany.mockReset();
    queryRaw.mockReset();
    eventFindMany.mockReset();
  });

  it('returns a contract-valid overview with empty history', async () => {
    indicatorFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    eventFindMany.mockResolvedValue([]);
    const input = toEngineInput([{ key: 'DTWEXBGS', value: 121, prev: 120 }], []);
    const o = await buildMacroOverview(input, new Date('2026-11-14T12:00:00Z'));
    expect(macroOverviewSchema.safeParse(o).success).toBe(true);
    expect(o.regime).toBeNull();
    expect(o.surprise).toBeNull();
    expect(o.cuts).toBeNull();
    expect(o.inputs).toEqual([]);
    expect(o.grid.map(g => g.asset)).toEqual([...OVERVIEW_ASSETS]);
    expect(o.grid[0]!.cells.map(c => c.factor)).toEqual([...OVERVIEW_DRIVERS]);
    expect(o.drivers.map(d => d.key)).toEqual([...OVERVIEW_DRIVERS]);
    // Gold vs a rising dollar: strong push down.
    expect(o.grid.find(g => g.asset === 'XAU')!.cells.find(c => c.factor === 'dollar')!.cell).toBe(-2);
  });

  it('fills the policy proxy and surprise grid when data exists', async () => {
    indicatorFindMany.mockImplementation(async (args: { where: { key: { in: string[] } } }) => {
      if (args.where.key.in.includes('DFF')) {
        return [
          { key: 'DFF', value: 3.88, asOf: new Date('2026-11-10') },
          { key: 'DGS2', value: 3.5, asOf: new Date('2026-11-11') },
          { key: 'DGS2', value: 3.4, asOf: new Date('2026-11-12') },
          { key: 'DGS3MO', value: 3.8, asOf: new Date('2026-11-12') },
        ];
      }
      return [];
    });
    queryRaw.mockResolvedValue([{ asset: 'BTC', score: 40, day: new Date('2026-11-13T00:00:00Z') }]);
    eventFindMany.mockResolvedValue([
      { title: 'Inflation Rate MoM', eventTime: new Date('2026-11-13T13:30:00Z'), actual: '0.4%', forecast: '0.3%' },
    ]);
    const o = await buildMacroOverview(toEngineInput([], []), new Date('2026-11-14T12:00:00Z'));
    expect(macroOverviewSchema.safeParse(o).success).toBe(true);
    expect(o.cuts!.rows.map(r => [r.key, r.cuts, r.cutsYesterday])).toEqual([['3m', 0.3, null], ['2y', 1.9, 1.5]]);
    expect(o.surprise!.series.find(s => s.key === 'cpi')!.cells.at(-1)!.level).toBe(1);
    expect(o.grid.find(g => g.asset === 'BTC')!.netYesterday).toBe(-20);
  });
});
