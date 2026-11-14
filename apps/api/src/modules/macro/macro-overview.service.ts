// Macro overview (v2) builder: the regime map + trail, the four inputs behind
// it, the assets × drivers grid, the data-surprise grid, cut odds per FOMC
// meeting from Fed funds futures (Yahoo, cached; lib/macro/providers/fedfunds)
// and the Treasury-based policy proxy as their fallback. Everything else reads
// Postgres only (FRED history, BiasScore history, the economic calendar); the
// maths lives in @tradinjournal/core (pure, tested).
// Attached to the cached macro state as the optional `overview` field.
import { prisma, Prisma } from '@tradinjournal/db';
import {
  assetContributions,
  buildSurpriseGrid,
  computeRegimeTrail,
  cutsImplied,
  flipsIf,
  netBias,
  readFactors,
  scoreAsset,
  shiftMonth,
  yoy,
} from '@tradinjournal/core';
import type { EngineInput, FactorKey, MacroAsset, MonthlyObs } from '@tradinjournal/core';
import type { MacroFedWatch, MacroOverview, MacroOverviewInput } from '@tradinjournal/contracts';
import { getFedWatch } from '../../lib/macro/providers/fedfunds.js';

/** Grid rows (engine assets only; nothing here is scored without the engine). */
export const OVERVIEW_ASSETS: readonly MacroAsset[] = ['XAU', 'BTC', 'NDX', 'SPX', 'DXY', 'UST', 'OIL', 'ETH'];
/** Grid columns, left → right. */
export const OVERVIEW_DRIVERS: readonly FactorKey[] = ['rates', 'dollar', 'liquidity', 'policy', 'inflation', 'growth', 'credit', 'risk'];

const MONTHLY_KEYS = ['CPILFESL', 'PAYEMS', 'UNRATE'] as const;
const DAILY_KEYS = ['DFF', 'DGS3MO', 'DGS2', 'WALCL', 'WTREGEN', 'RRPONTSYD', 'NET_LIQUIDITY'] as const;
const SURPRISE_TITLE_HINTS = ['CPI', 'Inflation Rate', 'Non Farm', 'Non-Farm', 'Unemployment', 'Retail Sales', 'ISM Manufacturing', 'Jobless'];

const DAY = 24 * 3600_000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Num = Prisma.Decimal | number;
const n = (v: Num): number => (typeof v === 'number' ? v : v.toNumber());
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

export interface DatedValue { date: string; value: number }

/** For each date in `on`, the latest value of `series` at or before it (both ascending). */
export function asOfJoin(on: DatedValue[], series: DatedValue[]): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (const p of on) {
    while (j + 1 < series.length && series[j + 1]!.date <= p.date) j++;
    out.push(j >= 0 ? series[j]!.value : null);
  }
  return out;
}

/** Weekly net liquidity (mn $) = WALCL − WTREGEN − RRPONTSYD×1000, on WALCL dates. */
export function netLiquiditySeries(walcl: DatedValue[], tga: DatedValue[], rrpBn: DatedValue[]): DatedValue[] {
  const t = asOfJoin(walcl, tga);
  const r = asOfJoin(walcl, rrpBn);
  const out: DatedValue[] = [];
  walcl.forEach((w, i) => {
    const tv = t[i];
    const rv = r[i];
    if (tv == null || rv == null) return;
    out.push({ date: w.date, value: w.value - tv - rv * 1000 });
  });
  return out;
}

/** Cuts implied (EFFR − yield)/0.25 on each yield date, using the latest EFFR at or before it. */
export function cutsSeries(effr: DatedValue[], yields: DatedValue[]): DatedValue[] {
  const e = asOfJoin(yields, effr);
  const out: DatedValue[] = [];
  yields.forEach((y, i) => {
    const ev = e[i];
    if (ev != null) out.push({ date: y.date, value: cutsImplied(ev, y.value) });
  });
  return out;
}

function tone(delta: number | null, eps: number, upIsGood: boolean): 'pos' | 'neg' | 'flat' {
  if (delta == null || Math.abs(delta) < eps) return 'flat';
  return (delta > 0) === upIsGood ? 'pos' : 'neg';
}

/** The four inputs behind the regime ("What put us here"). Pure; exported for tests. */
export function buildInputs(src: {
  coreCpi: MonthlyObs[];
  unemployment: MonthlyObs[];
  effr: DatedValue[];
  twoYear: DatedValue[];
  netLiq: DatedValue[];
}): MacroOverviewInput[] {
  const out: MacroOverviewInput[] = [];

  // Core CPI y/y, 12 monthly points.
  const cpi = new Map(src.coreCpi.map(o => [o.date.slice(0, 7), o.value]));
  const cpiMonths = [...cpi.keys()].sort();
  const lastM = cpiMonths.at(-1);
  if (lastM) {
    const ys: { m: string; v: number }[] = [];
    for (let k = 11; k >= 0; k--) {
      const m = shiftMonth(lastM, -k);
      const v = yoy(cpi, m);
      if (v != null) ys.push({ m, v: round(v, 2) });
    }
    const last = ys.at(-1);
    if (last && last.m === lastM) {
      const prev = ys.length > 1 ? ys[ys.length - 2]! : null;
      const delta = prev ? round(last.v - prev.v, 1) : null;
      out.push({
        key: 'core_cpi',
        label: 'Core CPI y/y',
        sub: delta == null || delta === 0 ? 'inflation holding' : delta > 0 ? 'pushes inflation up' : 'pulls inflation down',
        value: round(last.v, 1),
        format: 'pct',
        spark: ys.map(y => y.v),
        delta,
        deltaLabel: prev ? `since ${MONTHS_SHORT[Number(prev.m.slice(5)) - 1]}` : '',
        tone: tone(delta, 0.05, false),
        asOf: `${lastM}-01T00:00:00.000Z`,
      });
    }
  }

  // Policy proxy: 25bp cuts implied by the 2Y vs effective Fed funds.
  const cuts = cutsSeries(src.effr, src.twoYear);
  const lastCut = cuts.at(-1);
  if (lastCut) {
    const prev = cuts.length > 1 ? cuts[cuts.length - 2]! : null;
    const delta = prev ? round(lastCut.value - prev.value, 1) : null;
    out.push({
      key: 'policy',
      label: 'Cuts priced, 2Y',
      sub: '2Y Treasury vs Fed funds · proxy',
      value: lastCut.value,
      format: 'cuts',
      spark: cuts.slice(-60).map(c => c.value),
      delta,
      deltaLabel: 'prior day',
      tone: tone(delta, 0.05, true),
      asOf: `${lastCut.date}T00:00:00.000Z`,
    });
  }

  // Unemployment, 12 monthly points, change over 3 months.
  const ur = [...src.unemployment].sort((a, b) => a.date.localeCompare(b.date));
  const lastU = ur.at(-1);
  if (lastU) {
    const base = ur.length > 3 ? ur[ur.length - 4]! : null;
    const delta = base ? round(lastU.value - base.value, 1) : null;
    out.push({
      key: 'unemployment',
      label: 'Unemployment',
      sub: delta != null && delta > 0.05 ? 'growth softening' : 'growth still holding',
      value: lastU.value,
      format: 'pct',
      spark: ur.slice(-12).map(o => o.value),
      delta,
      deltaLabel: delta === 0 ? 'flat 3 mo' : '3 months',
      tone: tone(delta, 0.05, false),
      asOf: `${lastU.date}T00:00:00.000Z`,
    });
  }

  // Net liquidity, weekly, change over 4 weeks.
  const nl = src.netLiq;
  const lastL = nl.at(-1);
  if (lastL) {
    const base = nl.length > 4 ? nl[nl.length - 5]! : null;
    const delta = base ? lastL.value - base.value : null;
    out.push({
      key: 'net_liquidity',
      label: 'Net liquidity',
      sub: 'Fed assets − TGA − RRP',
      value: lastL.value,
      format: 'usd_mn',
      spark: nl.slice(-20).map(o => o.value),
      delta,
      deltaLabel: '4 weeks',
      tone: tone(delta, 1_000, true),
      asOf: `${lastL.date}T00:00:00.000Z`,
    });
  }
  return out;
}

/** Daily net-bias history → { trend, yesterday } for one asset. Pure; exported for tests. */
export function biasHistory(
  daily: { day: string; score: number }[],
  liveNet: number,
  today: string,
): { trend: number[]; yesterday: number | null } {
  const past = daily.filter(d => d.day < today).sort((a, b) => a.day.localeCompare(b.day));
  const y = past.at(-1);
  const yesterdayKey = isoDay(new Date(Date.parse(`${today}T00:00:00Z`) - DAY));
  return {
    trend: [...past.slice(-29).map(d => netBias(d.score)), liveNet],
    yesterday: y && y.day === yesterdayKey ? netBias(y.score) : null,
  };
}

/** Assets × drivers grid from the live engine input + daily BiasScore history. */
export function buildGrid(
  input: EngineInput,
  dailyByAsset: Map<string, { day: string; score: number }[]>,
  today: string,
): MacroOverview['grid'] {
  return OVERVIEW_ASSETS.map(asset => {
    const b = scoreAsset(asset, input);
    const contrib = new Map(assetContributions(asset, input).map(c => [c.factor, c]));
    const net = netBias(b.score);
    const hist = biasHistory(dailyByAsset.get(asset) ?? [], net, today);
    const flip = flipsIf(asset, input);
    return {
      asset,
      score: b.score,
      label: b.label,
      net,
      netYesterday: hist.yesterday,
      cells: OVERVIEW_DRIVERS.map(f => {
        const c = contrib.get(f)!;
        return { factor: f, raw: round(c.raw, 3), cell: c.cell };
      }),
      flipsIf: flip ? { factor: flip.factor, direction: flip.direction, text: flip.text, label: flip.label } : null,
      trend: hist.trend,
    };
  });
}

/**
 * Build the overview. Every block degrades on its own: missing history makes
 * that block null/empty instead of failing the whole state.
 */
export async function buildMacroOverview(
  input: EngineInput,
  now = new Date(),
  deps: { fedWatch: (effr: number | null) => Promise<MacroFedWatch | null> } = { fedWatch: (effr) => getFedWatch(effr) },
): Promise<MacroOverview> {
  const today = isoDay(now);
  const endMonth = today.slice(0, 7);
  const surpriseFrom = new Date(`${shiftMonth(endMonth, -11)}-01T00:00:00.000Z`);

  const [monthlyRows, dailyRows, biasRows, eventRows] = await Promise.all([
    prisma.macroIndicator.findMany({
      where: { key: { in: [...MONTHLY_KEYS] }, asOf: { gte: new Date(now.getTime() - 40 * 31 * DAY), lte: now } },
      orderBy: [{ key: 'asc' }, { asOf: 'asc' }],
      select: { key: true, value: true, asOf: true },
    }),
    prisma.macroIndicator.findMany({
      where: { key: { in: [...DAILY_KEYS] }, asOf: { gte: new Date(now.getTime() - 200 * DAY), lte: now } },
      orderBy: [{ key: 'asc' }, { asOf: 'asc' }],
      select: { key: true, value: true, asOf: true },
    }),
    // Last snapshot per asset per UTC day, 31 days.
    prisma.$queryRaw<{ asset: string; score: number; day: Date }[]>`
      SELECT DISTINCT ON (asset, date_trunc('day', "asOf"))
        asset, score, date_trunc('day', "asOf") AS day
      FROM bias_score
      WHERE "asOf" >= ${new Date(now.getTime() - 31 * DAY)}
        AND asset IN (${Prisma.join([...OVERVIEW_ASSETS])})
      ORDER BY asset, date_trunc('day', "asOf"), "asOf" DESC`,
    prisma.economicEvent.findMany({
      where: {
        currency: 'USD',
        eventTime: { gte: surpriseFrom, lte: now },
        actual: { not: null },
        forecast: { not: null },
        OR: SURPRISE_TITLE_HINTS.map(t => ({ title: { contains: t, mode: 'insensitive' as const } })),
      },
      orderBy: { eventTime: 'asc' },
      select: { title: true, eventTime: true, actual: true, forecast: true },
      take: 2_000,
    }),
  ]);

  const group = (rows: { key: string; value: Num; asOf: Date }[]) => {
    const m = new Map<string, DatedValue[]>();
    for (const r of rows) {
      const arr = m.get(r.key) ?? [];
      arr.push({ date: isoDay(r.asOf), value: n(r.value) });
      m.set(r.key, arr);
    }
    return m;
  };
  const monthly = group(monthlyRows);
  const daily = group(dailyRows);
  const get = (m: Map<string, DatedValue[]>, k: string) => m.get(k) ?? [];

  const trail = computeRegimeTrail({
    coreCpi: get(monthly, 'CPILFESL'),
    payrolls: get(monthly, 'PAYEMS'),
    unemployment: get(monthly, 'UNRATE'),
  });

  let netLiq = netLiquiditySeries(get(daily, 'WALCL'), get(daily, 'WTREGEN'), get(daily, 'RRPONTSYD'));
  if (netLiq.length === 0) netLiq = get(daily, 'NET_LIQUIDITY');

  const inputs = buildInputs({
    coreCpi: get(monthly, 'CPILFESL'),
    unemployment: get(monthly, 'UNRATE'),
    effr: get(daily, 'DFF'),
    twoYear: get(daily, 'DGS2'),
    netLiq,
  });

  const dailyByAsset = new Map<string, { day: string; score: number }[]>();
  for (const r of biasRows) {
    const arr = dailyByAsset.get(r.asset) ?? [];
    arr.push({ day: isoDay(new Date(r.day)), score: Number(r.score) });
    dailyByAsset.set(r.asset, arr);
  }

  const factors = new Map(readFactors(input).map(f => [f.key, f]));
  const drivers = OVERVIEW_DRIVERS.map(k => {
    const f = factors.get(k)!;
    return { key: k, label: f.label, value: f.value, direction: f.direction, weight: f.weight };
  });

  const surprise = buildSurpriseGrid(
    eventRows.map(e => ({ title: e.title, eventTime: e.eventTime.toISOString(), actual: e.actual, forecast: e.forecast })),
    endMonth,
  );

  // Policy proxy rows: 3M bill and 2Y note vs effective Fed funds.
  const effr = get(daily, 'DFF');
  const lastEffr = effr.at(-1);
  let cuts: MacroOverview['cuts'] = null;
  if (lastEffr) {
    const rows: NonNullable<MacroOverview['cuts']>['rows'] = [];
    for (const [key, label, series] of [['3m', 'Next 3 months', 'DGS3MO'], ['2y', 'Next 2 years', 'DGS2']] as const) {
      const s = cutsSeries(effr, get(daily, series));
      const last = s.at(-1);
      const y = get(daily, series).at(-1);
      if (!last || !y) continue;
      rows.push({ key, label, yield: y.value, cuts: last.value, cutsYesterday: s.length > 1 ? s[s.length - 2]!.value : null });
    }
    if (rows.length > 0) cuts = { basis: 'treasury-vs-effr', effr: lastEffr.value, asOf: `${lastEffr.date}T00:00:00.000Z`, rows };
  }

  // Per-meeting odds from Fed funds futures; null (proxy shown instead) when they don't answer.
  let fedwatch: MacroFedWatch | null = null;
  try {
    fedwatch = await deps.fedWatch(lastEffr?.value ?? null);
  } catch {
    fedwatch = null;
  }

  return {
    asOf: now.toISOString(),
    regime: trail
      ? {
          label: trail.label,
          since: trail.since,
          months: trail.months,
          line: trail.line,
          seriesCount: MONTHLY_KEYS.length,
          near: trail.near,
          points: trail.points,
        }
      : null,
    inputs,
    drivers,
    grid: buildGrid(input, dailyByAsset, today),
    surprise: surprise.releases > 0 ? surprise : null,
    cuts,
    fedwatch,
  };
}
