// Client for Analytics v2 (GET /api/insights/analytics) plus the pure helpers
// the page uses to lay out its charts. Types mirror
// packages/contracts/src/schema/analytics-v2.ts — keep them in step.
// Mock mode (NEXT_PUBLIC_USE_MOCKS) is served by app/data/insights/** (lib/mock-insights.ts).
import type { AiLine, DashBehaviour, DashDistribution, DashMaeMfe, DashParams, DashRolling, DashSession } from './dashboard-v2-api';
import { kmoney, money, rfmt } from './dashboard-v2-format';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${PREFIX}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data as T;
}

export function analyticsQuery(p: DashParams): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') u.set(k, String(v));
  return u.toString();
}

export const anaV2 = {
  get: (p: DashParams, signal?: AbortSignal) => call<AnalyticsV2DTO>(`/insights/analytics?${analyticsQuery(p)}`, signal ? { signal } : undefined),
};

// ─── types (mirror of the contract) ──────────────────────────────────────────

export const ANALYTICS_VIEWS = ['overview', 'performance', 'time', 'symbols', 'risk', 'behaviour', 'whatif'] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];
export const VIEW_LABEL: Record<AnalyticsView, string> = {
  overview: 'Overview', performance: 'Performance', time: 'Time', symbols: 'Symbols', risk: 'Risk & R', behaviour: 'Behaviour', whatif: 'What-if',
};

export interface AnaAgg { n: number; wins: number; net: number }
export interface AnaNavItem { view: AnalyticsView; value: number | null; fmt: 'money' | 'kmoney' | 'r' | 'weeks'; den?: number; tone: 'up' | 'dn' | 'flat' }
export interface AnaSegment extends AnaAgg { symbol: string; session: DashSession; avg: number }
export interface AnaOverview {
  net: AnaAgg & { profitFactor: number | null };
  edge: (AnaAgg & { label: string }) | null;
  bleed: (AnaAgg & { label: string }) | null;
  rulesBroken: AnaAgg | null;
  segments: AnaSegment[];
  segmentsHidden: number;
  segUnit: '$' | 'R';
  winRate: number;
  ai: AiLine | null;
}
export interface AnaDay extends AnaAgg { d: string; r: number | null }
export interface AnaWeek extends AnaAgg { start: string }
export interface AnaMonth extends AnaAgg { key: string }
export interface AnaStats {
  winRate: number; profitFactor: number | null; expectancy: number; expectancyR: number | null;
  avgWin: number; avgLoss: number; best: number; worst: number; maxWinStreak: number; maxLossStreak: number;
  medianHoldMs: number; long: AnaAgg; short: AnaAgg;
  /** Added Nov 2026; optional so an older API still renders. */
  grossProfit?: number; grossLoss?: number; losses?: number; maxDrawdown?: number;
}
export interface AnaPerformance {
  days: AnaDay[]; weeks: AnaWeek[]; worstWeek: string | null; greenWeeks: number; rUnit: boolean; months: AnaMonth[]; stats: AnaStats;
  ai: { header: AiLine | null; calendar: AiLine | null; months: AiLine | null; stats: AiLine | null };
}
export interface AnaHourCell extends AnaAgg { day: number; hour: number }
export interface AnaTime {
  days: number[]; cells: AnaHourCell[];
  dayTotals: Array<AnaAgg & { day: number }>;
  hourTotals: Array<AnaAgg & { hour: number }>;
  late: (AnaAgg & { from: number }) | null;
  bestHours: { from: number; to: number; inside: AnaAgg; outside: AnaAgg } | null;
  sessions: Array<AnaAgg & { session: DashSession }>;
  ai: { header: AiLine | null; heat: AiLine | null; sessions: AiLine | null };
}
export interface AnaSymbolSeries extends AnaAgg {
  symbol: string; profitFactor: number | null; pts: Array<{ t: number; v: number }>; monthsLost: number; monthsTraded: number; flag: 'pause' | 'share' | null;
}
export interface AnaSymbols {
  series: AnaSymbolSeries[]; hidden: number;
  grid: { symbols: string[]; cells: Array<AnaAgg & { symbol: string; session: DashSession }>; flagged: string | null };
  ai: { header: AiLine | null; series: AiLine | null; grid: AiLine | null };
}
export interface AnaHold { unit: '$' | 'R'; points: Array<{ ms: number; v: number; win: boolean }>; longLosers: { thresholdMs: number; n: number; net: number } | null; ratio: number | null }
export interface AnaExit { bins: Array<{ from: number; to: number; n: number }>; avg: number; n: number }
export interface AnaRisk {
  unit: '$' | 'R'; withR: number; withMae: number;
  distribution: DashDistribution | null; hold: AnaHold | null; maeMfe: DashMaeMfe | null;
  rolling20: DashRolling | null; rolling50: DashRolling | null; exit: AnaExit | null; avgWin: number; avgLoss: number;
  ai: { header: AiLine | null; distribution: AiLine | null; hold: AiLine | null; maeMfe: AiLine | null; rolling: AiLine | null; exit: AiLine | null };
}
export type AnaRuleKey = 'user-rule' | 'after-losses' | 'revenge' | 'oversized' | 'hour' | 'tail';
export interface AnaBehaviour {
  waterfall: { kept: AnaAgg; rules: Array<AnaAgg & { key: AnaRuleKey; label: string }>; total: AnaAgg } | null;
  score: DashBehaviour | null;
  strips: Array<{ key: 'discipline' | 'risk' | 'timing'; label: string; failed: number; bits: string }> | null;
  byLosses: Array<AnaAgg & { key: '0' | '1' | '2' | '3+'; size: number | null }>;
  bySize: { unit: '$' | 'R'; rows: Array<AnaAgg & { key: 'normal' | 'up' | 'big'; label: string; avg: number }> } | null;
  tags: Array<AnaAgg & { label: string }>;
  emotions: Array<AnaAgg & { label: string }>;
  ai: { header: AiLine | null; waterfall: AiLine | null; score: AiLine | null; losses: AiLine | null; size: AiLine | null };
}
export interface AnaFix { key: string; label: string; alone: number; trades: number }
export interface AnaWhatIf {
  base: number; fixes: AnaFix[]; gains: number[]; removed: number[]; defaultMask: number;
  breakEven: { gain: number; trades: number } | null; breakEvenNeeds: 'mae' | 'r' | null;
  ai: { header: AiLine | null; steps: AiLine | null; rules: AiLine | null };
}
export interface AnalyticsV2DTO {
  asOf: string;
  window: { from: number | null; to: number | null };
  options: { symbols: Array<{ symbol: string; trades: number }>; tags: string[] };
  counts: { trades: number; inWindow: number; allClosed: number; withR: number; withMae: number };
  minTrades: number;
  nav: AnaNavItem[];
  overview: AnaOverview | null;
  performance: AnaPerformance | null;
  time: AnaTime | null;
  symbols: AnaSymbols | null;
  risk: AnaRisk | null;
  behaviour: AnaBehaviour | null;
  whatif: AnaWhatIf | null;
}

// ─── pure helpers ────────────────────────────────────────────────────────────

/** Text for a view's headline number in the left menu ("" when there is none). */
export function navText(n: AnaNavItem | undefined): string {
  if (!n || n.value == null) return '';
  switch (n.fmt) {
    case 'money': return money(n.value);
    case 'kmoney': return kmoney(n.value);
    case 'r': return rfmt(n.value);
    case 'weeks': return `${n.value}/${n.den ?? 0} wk`;
  }
}

export function viewFromSearch(search: string): AnalyticsView {
  const v = new URLSearchParams(search).get('view');
  return (ANALYTICS_VIEWS as readonly string[]).includes(v ?? '') ? (v as AnalyticsView) : 'overview';
}

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseDay = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface CalWeek { start: string; days: Array<{ d: string; cell: AnaDay | null }>; total: AnaWeek | null }
/**
 * Calendar columns: every week (Monday start) from the first to the last
 * traded week, including empty weeks in between. `rows` are the weekdays shown
 * (Mon–Fri, plus Sat/Sun when anything closed on them).
 */
export function calendarWeeks(days: AnaDay[], weeks: AnaWeek[]): { rows: number[]; cols: CalWeek[] } {
  if (!days.length) return { rows: [1, 2, 3, 4, 5], cols: [] };
  const byDay = new Map(days.map(d => [d.d, d]));
  const byWeek = new Map(weeks.map(w => [w.start, w]));
  const wd = (d: string) => new Date(parseDay(d)).getUTCDay();
  const rows = [1, 2, 3, 4, 5];
  if (days.some(d => wd(d.d) === 6)) rows.push(6);
  if (days.some(d => wd(d.d) === 0)) rows.push(0);
  const monday = (d: string) => { const ms = parseDay(d); return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY; };
  const first = monday(days[0]!.d), last = monday(days.at(-1)!.d);
  const cols: CalWeek[] = [];
  for (let w = first; w <= last; w += 7 * DAY) {
    const start = isoDay(w);
    cols.push({
      start,
      days: rows.map(r => { const d = isoDay(w + ((r + 6) % 7) * DAY); return { d, cell: byDay.get(d) ?? null }; }),
      total: byWeek.get(start) ?? null,
    });
  }
  return { rows, cols };
}

/** The window of `size` columns ending `back` columns before the last one. */
export function pageCols<T>(cols: T[], size: number, back: number): { shown: T[]; back: number; maxBack: number } {
  const maxBack = Math.max(0, cols.length - size);
  const b = Math.min(Math.max(0, back), maxBack);
  return { shown: cols.slice(Math.max(0, cols.length - size - b), cols.length - b), back: b, maxBack };
}

/** In-order steps for the chosen fixes: each adds only the trades not already skipped. */
export function whatIfSteps(w: Pick<AnaWhatIf, 'fixes' | 'gains' | 'removed'>, mask: number): Array<{ key: string; label: string; delta: number; trades: number }> {
  const out: Array<{ key: string; label: string; delta: number; trades: number }> = [];
  let m = 0;
  w.fixes.forEach((f, i) => {
    if (!(mask & (1 << i))) return;
    const next = m | (1 << i);
    out.push({ key: f.key, label: f.label, delta: Math.round(((w.gains[next] ?? 0) - (w.gains[m] ?? 0)) * 100) / 100, trades: (w.removed[next] ?? 0) - (w.removed[m] ?? 0) });
    m = next;
  });
  return out;
}

/** What fix i adds on top of the chosen ones (or what it contributed, if chosen). */
export function addedBy(w: Pick<AnaWhatIf, 'gains'>, mask: number, i: number): number {
  const bit = 1 << i;
  if (mask & bit) {
    // Contribution in order: fixes before i are already applied.
    const before = mask & (bit - 1);
    return Math.round(((w.gains[before | bit] ?? 0) - (w.gains[before] ?? 0)) * 100) / 100;
  }
  return Math.round(((w.gains[mask | bit] ?? 0) - (w.gains[mask] ?? 0)) * 100) / 100;
}

/** y-domain for the symbol small multiples: one shared scale, or each symbol's own. */
export function multDomain(series: Array<{ pts: Array<{ v: number }> }>, shared: boolean, i: number): [number, number] {
  const span = (ps: Array<{ v: number }>): [number, number] => [Math.min(0, ...ps.map(p => p.v)), Math.max(0, ...ps.map(p => p.v))];
  if (!shared) { const [a, b] = span(series[i]?.pts ?? []); return a === b ? [a - 1, b + 1] : [a, b]; }
  let lo = 0, hi = 0;
  for (const s of series) { const [a, b] = span(s.pts); lo = Math.min(lo, a); hi = Math.max(hi, b); }
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

/** 45m · 3h · 1.5d (hold times). */
export function fmtHold(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < DAY) return `${+(ms / 3_600_000).toFixed(1)}h`;
  return `${+(ms / DAY).toFixed(1)}d`;
}

/** Color strength 0–1 for a heat cell (sqrt so small values still show). */
export const heat = (v: number, max: number) => (max > 0 ? Math.min(1, Math.sqrt(Math.abs(v) / max)) : 0);

/** Short month label from YYYY-MM. Adds the year when the months span more than one. */
export function monthLabel(key: string, multiYear: boolean): string {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(key.slice(5, 7)) - 1] ?? key;
  return multiYear ? `${m} ’${key.slice(2, 4)}` : m;
}
