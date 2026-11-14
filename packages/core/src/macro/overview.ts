// Macro overview engine (pure, no I/O). Additive to the confluence engine:
//   - per-asset per-factor contributions on a −2..+2 scale (the heat grid)
//   - net bias −100..+100 (a linear map of the 0–100 score)
//   - "flips if": the single factor whose flip would change the bias label
//   - a regime trail: continuous growth × inflation coordinates per month,
//     from monthly FRED history (core CPI, payrolls, unemployment)
//   - an honest policy proxy: 25bp cuts implied by T-bill / Treasury yields
//     vs the effective Fed funds rate (NOT FedWatch meeting odds)
//   - a data-surprise grid from economic-calendar actual vs forecast
// Everything here is deterministic so it can be unit-tested and cached.
import { readFactors } from './factors.js';
import { SENSITIVITIES } from './sensitivities.js';
import { SCORE_SCALE, clampScore, labelForScore } from './score.js';
import { recessionOdds } from './regime.js';
import type {
  BiasLabel,
  EngineInput,
  RegimeResult,
  FactorKey,
  MacroAsset,
  RegimeLabel,
} from './types.js';

// ── Heat-grid contributions ─────────────────────────────────────────────────

export type GridCell = -2 | -1 | 0 | 1 | 2;

export interface FactorContribution {
  factor: FactorKey;
  /** weight × direction × sensitivity (the exact term scoreAsset sums). */
  raw: number;
  /** raw bucketed to −2..+2 for display. */
  cell: GridCell;
}

/** |raw| at or above this is a strong push (±2); anything non-zero below is ±1. */
export const STRONG_CONTRIBUTION = 0.7;

/** Bucket a raw contribution to the −2..+2 grid scale. */
export function contributionCell(raw: number): GridCell {
  if (!Number.isFinite(raw) || Math.abs(raw) < 1e-9) return 0;
  const mag = Math.abs(raw) >= STRONG_CONTRIBUTION ? 2 : 1;
  return (raw > 0 ? mag : -mag) as GridCell;
}

/** Contribution of every factor to one asset, in FACTORS order. */
export function assetContributions(asset: MacroAsset, input: EngineInput): FactorContribution[] {
  const sens = SENSITIVITIES[asset];
  return readFactors(input).map(f => {
    const s = sens[f.key] ?? 0;
    const raw = f.direction === 0 || s === 0 ? 0 : f.weight * f.direction * s;
    return { factor: f.key, raw, cell: contributionCell(raw) };
  });
}

/** 0–100 confluence score → −100..+100 net bias (50 → 0). */
export function netBias(score: number): number {
  return Math.max(-100, Math.min(100, Math.round((score - 50) * 2)));
}

// ── Flips if ────────────────────────────────────────────────────────────────

const FLIP_TEXT: Record<FactorKey, { up: string; down: string }> = {
  inflation: { up: 'Inflation re-accelerates', down: 'Inflation cools' },
  policy: { up: 'Fed turns hawkish', down: 'Fed eases' },
  growth: { up: 'Growth picks up', down: 'Growth slows' },
  rates: { up: '10Y yields rise', down: '10Y yields fall' },
  liquidity: { up: 'Liquidity expands', down: 'Liquidity drains' },
  credit: { up: 'Credit spreads widen', down: 'Credit spreads tighten' },
  risk: { up: 'VIX rises', down: 'VIX falls' },
  dollar: { up: 'Dollar strengthens', down: 'Dollar weakens' },
};

export interface FlipCondition {
  factor: FactorKey;
  /** The direction the factor would need to take. */
  direction: 1 | -1;
  text: string;
  /** Score after the flip (0–100) and its label. */
  score: number;
  label: BiasLabel;
}

/** Which side of neutral a score sits on. */
function lean(score: number): -1 | 0 | 1 {
  return score >= 55 ? 1 : score <= 45 ? -1 : 0;
}

/**
 * The single factor whose flip would change the asset's bias label.
 * Each factor is flipped alone (a reading of +1 → −1, −1 → +1, flat → either
 * way). Among flips that change the label we keep the one that pushes hardest
 * against the current lean (for a neutral asset: the largest move either way).
 * Ties keep FACTORS order. Null when no single flip changes the label.
 */
export function flipsIf(asset: MacroAsset, input: EngineInput): FlipCondition | null {
  const sens = SENSITIVITIES[asset];
  const readings = readFactors(input);
  let sum = 0;
  for (const f of readings) {
    const s = sens[f.key] ?? 0;
    if (f.direction !== 0 && s !== 0) sum += f.weight * f.direction * s;
  }
  const score = clampScore(50 + SCORE_SCALE * sum);
  const label = labelForScore(score);
  const side = lean(score);

  let best: FlipCondition | null = null;
  let bestGain = -Infinity;
  for (const f of readings) {
    const s = sens[f.key] ?? 0;
    if (s === 0) continue;
    const current = f.direction === 0 ? 0 : f.weight * f.direction * s;
    const options: (1 | -1)[] = f.direction === 0 ? [1, -1] : [(-f.direction) as 1 | -1];
    for (const d of options) {
      const alt = clampScore(50 + SCORE_SCALE * (sum - current + f.weight * d * s));
      const altLabel = labelForScore(alt);
      if (altLabel === label) continue;
      const delta = alt - score;
      const gain = side === 0 ? Math.abs(delta) : -side * delta;
      if (gain <= 0) continue; // only flips that move against the current lean
      if (gain > bestGain) {
        bestGain = gain;
        best = {
          factor: f.key,
          direction: d,
          text: d > 0 ? FLIP_TEXT[f.key].up : FLIP_TEXT[f.key].down,
          score: alt,
          label: altLabel,
        };
      }
    }
  }
  return best;
}

// ── Regime trail ────────────────────────────────────────────────────────────

export interface MonthlyObs {
  /** Observation date, YYYY-MM-DD (FRED monthly series use the 1st). */
  date: string;
  value: number;
}

export interface RegimePoint {
  /** YYYY-MM of the data month. */
  month: string;
  /** −2..+2, positive = growth improving. */
  growth: number;
  /** −2..+2, positive = inflation rising. */
  inflation: number;
  label: Exclude<RegimeLabel, 'Unclear'>;
}

export interface RegimeTrail {
  points: RegimePoint[];
  label: Exclude<RegimeLabel, 'Unclear'>;
  /** First month (YYYY-MM) of the current unbroken run in this quadrant. */
  since: string;
  /** Length of that run in months (1 = first month). */
  months: number;
  /** ≤ 8-word deterministic reading of the trail. */
  line: string;
  /** The adjacent quadrant the latest point is closest to, if near a boundary. */
  near: { label: Exclude<RegimeLabel, 'Unclear'>; axis: 'growth' | 'inflation' } | null;
}

/** Inflation-axis unit: a 0.25pp change in core CPI y/y over 3 months = 1. */
export const INFLATION_UNIT_PP = 0.25;
/** Payroll-axis unit: 3m avg monthly gain vs 12m avg, 75k = 1. */
export const PAYROLL_UNIT_K = 75;
/** Unemployment-axis unit: a 0.2pp fall over 3 months = +1 growth. */
export const UNRATE_UNIT_PP = 0.2;

const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function regimeFromCoords(growth: number, inflation: number): Exclude<RegimeLabel, 'Unclear'> {
  const g = growth > 0;
  const i = inflation > 0;
  if (g && i) return 'Reflation';
  if (g && !i) return 'Goldilocks';
  if (!g && i) return 'Stagflation';
  return 'Deflation';
}

/** Whole months from a to b (YYYY-MM). */
export function monthsBetween(a: string, b: string): number {
  const idx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  return idx(b) - idx(a);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** YYYY-MM → previous / later month by `delta`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function byMonth(obs: MonthlyObs[]): Map<string, number> {
  const out = new Map<string, number>();
  // Later rows win (one value per data month).
  for (const o of [...obs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (Number.isFinite(o.value)) out.set(monthKey(o.date), o.value);
  }
  return out;
}

/**
 * Index level for `month`; a single missing month (e.g. a release skipped in a
 * government shutdown) is filled with the geometric mean of its neighbours.
 */
function level(series: Map<string, number>, month: string): number | null {
  const v = series.get(month);
  if (v != null) return v;
  const a = series.get(shiftMonth(month, -1));
  const b = series.get(shiftMonth(month, 1));
  return a != null && b != null && a > 0 && b > 0 ? Math.sqrt(a * b) : null;
}

/** Core CPI y/y (%) for `month`, or null without the base month. */
export function yoy(series: Map<string, number>, month: string): number | null {
  const now = series.get(month);
  const base = level(series, shiftMonth(month, -12));
  if (now == null || base == null || base === 0) return null;
  return (now / base - 1) * 100;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/**
 * Continuous growth × inflation coordinates per month for the last `count`
 * months that have all three inputs.
 *   inflation = (avg core CPI y/y, last 3 months − the 3 before) / 0.25pp
 *   growth    = mean of ((3m avg payroll gain − 12m avg gain) / 75k)
 *                    and (−(avg unemployment, last 3 months − the 3 before) / 0.2pp)
 * Both clamped to ±2 (the map's extent). Needs ~30 months of core CPI and
 * ~17 months of payrolls / unemployment. Null when fewer than 2 points.
 */
export function computeRegimeTrail(
  input: { coreCpi: MonthlyObs[]; payrolls: MonthlyObs[]; unemployment: MonthlyObs[] },
  count = 12,
): RegimeTrail | null {
  const cpi = byMonth(input.coreCpi);
  const nfp = byMonth(input.payrolls);
  const ur = byMonth(input.unemployment);
  const months = [...cpi.keys()].sort();
  const points: RegimePoint[] = [];

  const gain = (m: string): number | null => {
    const a = nfp.get(m);
    const b = nfp.get(shiftMonth(m, -1));
    return a == null || b == null ? null : a - b;
  };
  // Missing months (e.g. a release skipped by a government shutdown) are
  // tolerated: averages need at least two thirds of their window.
  const avgGain = (m: string, n: number): number | null => {
    let s = 0;
    let c = 0;
    for (let k = 0; k < n; k++) {
      const g = gain(shiftMonth(m, -k));
      if (g == null) continue;
      s += g;
      c++;
    }
    return c >= Math.ceil((n * 2) / 3) ? s / c : null;
  };

  /** Mean of f over months m, m−1, m−2 (at least two present), else null. */
  const mean3 = (m: string, f: (x: string) => number | null | undefined): number | null => {
    let s = 0;
    let c = 0;
    for (let k = 0; k < 3; k++) {
      const v = f(shiftMonth(m, -k));
      if (v == null) continue;
      s += v;
      c++;
    }
    return c >= 2 ? s / c : null;
  };

  for (const m of months) {
    // Smoothed: last 3 months' average vs the 3 months before that.
    const yNow = mean3(m, x => yoy(cpi, x));
    const yPrev = mean3(shiftMonth(m, -3), x => yoy(cpi, x));
    const g3 = avgGain(m, 3);
    const g12 = avgGain(m, 12);
    const uNow = mean3(m, x => ur.get(x));
    const uPrev = mean3(shiftMonth(m, -3), x => ur.get(x));
    if (yNow == null || yPrev == null || g3 == null || g12 == null || uNow == null || uPrev == null) continue;
    const inflation = round2(clamp2((yNow - yPrev) / INFLATION_UNIT_PP));
    const growth = round2(clamp2(((g3 - g12) / PAYROLL_UNIT_K + -(uNow - uPrev) / UNRATE_UNIT_PP) / 2));
    points.push({ month: m, growth, inflation, label: regimeFromCoords(growth, inflation) });
  }

  const tail = points.slice(-count);
  if (tail.length < 2) return null;
  const last = tail[tail.length - 1]!;

  // Run length uses the whole computed history, not just the visible tail.
  let first = points.length - 1;
  while (first > 0 && points[first - 1]!.label === last.label) first--;
  const since = points[first]!.month;
  const run = monthsBetween(since, last.month) + 1;

  return {
    points: tail,
    label: last.label,
    since,
    months: run,
    line: regimeLine(tail),
    near: nearBoundary(last),
  };
}

/**
 * The single regime the whole app reports. classifyRegime reads month-over-month
 * index moves (a CPI index rises almost every month, so it nearly always says
 * "inflation up"); the trail measures acceleration instead. When a trail exists
 * its latest point wins; otherwise fall back to classifyRegime's result.
 */
export function resolveRegime(
  trail: Pick<RegimeTrail, 'points' | 'label'> | null,
  input: EngineInput,
  fallback: RegimeResult | null,
): RegimeResult | null {
  const last = trail?.points[trail.points.length - 1];
  if (!trail || !last) return fallback;
  return {
    growth: last.growth > 0 ? 'up' : 'down',
    inflation: last.inflation > 0 ? 'up' : 'down',
    label: trail.label,
    recessionOdds: fallback?.recessionOdds ?? recessionOdds(input),
  };
}

/** Within this distance of an axis the "toward X" hint is shown. */
export const NEAR_BOUNDARY = 0.6;

export function nearBoundary(p: { growth: number; inflation: number }): RegimeTrail['near'] {
  const dg = Math.abs(p.growth);
  const di = Math.abs(p.inflation);
  if (Math.min(dg, di) > NEAR_BOUNDARY) return null;
  if (dg <= di) {
    // Growth sign flips.
    return { axis: 'growth', label: regimeFromCoords(p.growth > 0 ? -1 : 1, p.inflation) };
  }
  return { axis: 'inflation', label: regimeFromCoords(p.growth, p.inflation > 0 ? -1 : 1) };
}

/**
 * One short line (≤ 8 words) from the trail's last 3-month move:
 * "Drifting toward stagflation as growth slows" when heading at a nearby
 * boundary, otherwise "Growth slowing, inflation rising".
 */
export function regimeLine(points: { growth: number; inflation: number }[]): string {
  const last = points[points.length - 1]!;
  const ref = points[Math.max(0, points.length - 4)]!;
  const dg = last.growth - ref.growth;
  const di = last.inflation - ref.inflation;
  const near = nearBoundary(last);
  if (near) {
    const towardGrowth = near.axis === 'growth' && Math.sign(dg) === -Math.sign(last.growth) && dg !== 0;
    const towardInfl = near.axis === 'inflation' && Math.sign(di) === -Math.sign(last.inflation) && di !== 0;
    if (towardGrowth) return `Drifting toward ${near.label.toLowerCase()} as growth ${dg < 0 ? 'slows' : 'picks up'}`;
    if (towardInfl) return `Drifting toward ${near.label.toLowerCase()} as inflation ${di < 0 ? 'cools' : 're-accelerates'}`;
  }
  const g = last.growth > 0 ? 'improving' : 'slowing';
  const i = last.inflation > 0 ? 'rising' : 'cooling';
  return `Growth ${g}, inflation ${i}`;
}

// ── Policy proxy (cuts priced) ──────────────────────────────────────────────

/**
 * 25bp cuts implied by a Treasury yield relative to effective Fed funds:
 * (EFFR − yield) / 0.25. Positive = cuts priced, negative = hikes. A rough
 * proxy only: bill/term premia sit in the gap too. Not meeting-level odds.
 */
export function cutsImplied(effr: number, yieldPct: number): number {
  return Math.round(((effr - yieldPct) / 0.25) * 10) / 10;
}

// ── Surprise grid ───────────────────────────────────────────────────────────

export interface SurpriseSeriesDef {
  key: string;
  label: string;
  /** Matches EconomicEvent.title (USD) for this release. */
  match: RegExp;
  /** +1: actual above forecast is "hotter"; −1: below is hotter (jobless, unemployment). */
  polarity: 1 | -1;
  /** |surprise| thresholds (in the release's own units) for level 1 and 2. */
  small: number;
  big: number;
}

export const SURPRISE_SERIES: readonly SurpriseSeriesDef[] = [
  { key: 'cpi', label: 'CPI m/m', match: /^(cpi m\/m|inflation rate mom)$/i, polarity: 1, small: 0.05, big: 0.15 },
  { key: 'core_cpi', label: 'Core CPI m/m', match: /^(core cpi m\/m|core inflation rate mom)$/i, polarity: 1, small: 0.05, big: 0.15 },
  { key: 'payrolls', label: 'Payrolls', match: /^(non[- ]?farm (payrolls|employment change))$/i, polarity: 1, small: 25_000, big: 75_000 },
  { key: 'unemployment', label: 'Unemployment', match: /^unemployment rate$/i, polarity: -1, small: 0.05, big: 0.15 },
  { key: 'retail', label: 'Retail sales', match: /^retail sales (m\/m|mom)$/i, polarity: 1, small: 0.15, big: 0.5 },
  { key: 'ism', label: 'ISM manufacturing', match: /^ism manufacturing pmi$/i, polarity: 1, small: 0.5, big: 1.5 },
  { key: 'claims', label: 'Jobless claims', match: /^(initial jobless claims|unemployment claims)$/i, polarity: -1, small: 5_000, big: 15_000 },
];

/** "245K" → 245000, "0.3%" → 0.3, "-1.2M" → -1200000, "1,234" → 1234. Null if unparseable. */
export function parseReleaseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/,/g, '').replace(/−/g, '-');
  const m = /^([+-]?\d*\.?\d+)\s*([kKmMbBtT%]?)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return n * (mult[m[2]!.toLowerCase()] ?? 1);
}

/** −2..+2 "hotter than forecast" level (positive = hotter, hurts risk). Null if not comparable. */
export function surpriseLevel(def: SurpriseSeriesDef, actual: string | null, forecast: string | null): number | null {
  const a = parseReleaseNumber(actual);
  const f = parseReleaseNumber(forecast);
  if (a == null || f == null) return null;
  const s = (a - f) * def.polarity;
  const mag = Math.abs(s);
  if (mag < def.small - 1e-9) return 0;
  const level = mag >= def.big - 1e-9 ? 2 : 1;
  return s > 0 ? level : -level;
}

export interface SurpriseRelease {
  title: string;
  eventTime: string; // ISO
  actual: string | null;
  forecast: string | null;
}

export interface SurpriseCell {
  month: string;
  /** −2..+2, null = no release with a forecast that month. */
  level: number | null;
  actual: string | null;
  forecast: string | null;
}

export interface SurpriseGrid {
  months: string[];
  series: { key: string; label: string; cells: SurpriseCell[] }[];
  /** ≤ 8-word reading, null when there's too little data. */
  line: string | null;
  /** Number of series with at least one scored release. */
  releases: number;
}

/**
 * Releases × months grid. Monthly series use the latest release in the month;
 * weekly claims average their levels and round. `endMonth` is the last column.
 */
export function buildSurpriseGrid(releases: SurpriseRelease[], endMonth: string, count = 12): SurpriseGrid {
  const months = Array.from({ length: count }, (_, k) => shiftMonth(endMonth, k - count + 1));
  const sorted = [...releases].sort((a, b) => a.eventTime.localeCompare(b.eventTime));
  const series = SURPRISE_SERIES.map(def => {
    const byM = new Map<string, { levels: number[]; actual: string | null; forecast: string | null }>();
    for (const r of sorted) {
      if (!def.match.test(r.title.trim())) continue;
      const lvl = surpriseLevel(def, r.actual, r.forecast);
      if (lvl == null) continue;
      const m = r.eventTime.slice(0, 7);
      const slot = byM.get(m) ?? { levels: [], actual: null, forecast: null };
      if (def.key === 'claims') slot.levels.push(lvl);
      else slot.levels = [lvl];
      slot.actual = r.actual;
      slot.forecast = r.forecast;
      byM.set(m, slot);
    }
    const cells: SurpriseCell[] = months.map(m => {
      const slot = byM.get(m);
      if (!slot || slot.levels.length === 0) return { month: m, level: null, actual: null, forecast: null };
      const avg = slot.levels.reduce((s, v) => s + v, 0) / slot.levels.length;
      const level = Math.max(-2, Math.min(2, Math.round(avg)));
      return { month: m, level: Object.is(level, -0) ? 0 : level, actual: slot.actual, forecast: slot.forecast };
    });
    return { key: def.key, label: def.label, cells };
  });
  const releasesCount = series.filter(s => s.cells.some(c => c.level != null)).length;
  return { months, series, line: surpriseLine(series), releases: releasesCount };
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Deterministic ≤ 8-word reading of the grid. */
export function surpriseLine(series: SurpriseGrid['series']): string | null {
  // Inflation beat streak: months (newest back) where CPI or core CPI came in hot.
  const infl = series.filter(s => s.key === 'cpi' || s.key === 'core_cpi');
  const n = infl[0]?.cells.length ?? 0;
  let streak = 0;
  let started = false;
  for (let k = n - 1; k >= 0; k--) {
    const lv = infl.map(s => s.cells[k]!.level).filter((v): v is number => v != null);
    if (lv.length === 0) {
      if (started) break;
      continue; // skip the not-yet-released tail
    }
    started = true;
    if (lv.some(v => v > 0)) streak++;
    else break;
  }
  if (streak >= 2) return `Inflation beat forecast ${NUM_WORDS[streak] ?? streak} months running`;

  // Otherwise: the balance of the last three months across every series.
  let hot = 0;
  let cool = 0;
  let scored = 0;
  for (const s of series) {
    for (const c of s.cells.slice(-3)) {
      if (c.level == null) continue;
      scored++;
      if (c.level > 0) hot++;
      else if (c.level < 0) cool++;
    }
  }
  if (scored < 3) return null;
  if (hot >= cool + 2) return 'US data running hotter than forecast';
  if (cool >= hot + 2) return 'US data running cooler than forecast';
  return 'US data mostly in line with forecasts';
}

