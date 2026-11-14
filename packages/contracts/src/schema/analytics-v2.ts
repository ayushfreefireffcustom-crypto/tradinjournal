// Analytics v2 ("D · AI"): one call that returns every view of the analytics
// page (Overview, Performance, Time, Symbols, Risk & R, Behaviour, What-if),
// computed server-side from the account's closed trades and cached ~60s.
//
// Same conventions as Dashboard v2 (schema/dashboard-v2.ts): UTC; a trade
// belongs to the hour, weekday and session it opened in (Asia 22–07,
// London 07–13, New York 13–22); days and weeks go by the close; a win is
// net P&L > 0. R values only when at least half the trades (and ≥ 10) carry
// a stored R-multiple, otherwise $; MAE/MFE only with stored metric data.
// "Rules" are the dashboard's deterministic process flags, never user input.
import type {
  AiLine, DashBehaviour, DashDistribution, DashMaeMfe, DashRolling, DashSession, DashboardV2Query,
} from './dashboard-v2.js';
import { dashboardV2QuerySchema } from './dashboard-v2.js';

/** Same account / range / filter fields as the dashboard. */
export const analyticsV2QuerySchema = dashboardV2QuerySchema;
export type AnalyticsV2Query = DashboardV2Query;

export const ANALYTICS_VIEWS = ['overview', 'performance', 'time', 'symbols', 'risk', 'behaviour', 'whatif'] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];

/** n trades, how many won, net $. */
export interface AnaAgg { n: number; wins: number; net: number }

/** Headline number next to a view in the left menu. `weeks`: value of den. */
export interface AnaNavItem {
  view: AnalyticsView;
  value: number | null;
  fmt: 'money' | 'kmoney' | 'r' | 'weeks';
  den?: number;
  tone: 'up' | 'dn' | 'flat';
}

export interface AnaSegment extends AnaAgg { symbol: string; session: DashSession; /** avg R (when unit R) or avg $ per trade. */ avg: number }

export interface AnaOverview {
  net: AnaAgg & { profitFactor: number | null };
  /** Best session when it is net positive. */
  edge: (AnaAgg & { label: string }) | null;
  /** Every net-negative session together. */
  bleed: (AnaAgg & { label: string }) | null;
  /** Trades with at least one rule flag (null below minTrades). */
  rulesBroken: AnaAgg | null;
  /** Symbol × session with ≥ 3 trades, best net first (top + bottom when there are many). */
  segments: AnaSegment[];
  /** Segments left out of the list. */
  segmentsHidden: number;
  segUnit: '$' | 'R';
  winRate: number;
  ai: AiLine | null;
}

export interface AnaDay extends AnaAgg { /** YYYY-MM-DD (UTC close day). */ d: string; /** Sum of R that day (R unit only). */ r: number | null }
export interface AnaWeek extends AnaAgg { /** Monday, YYYY-MM-DD. */ start: string }
export interface AnaMonth extends AnaAgg { /** YYYY-MM */ key: string }
export interface AnaStats {
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  expectancyR: number | null;
  avgWin: number;
  avgLoss: number;
  best: number;
  worst: number;
  maxWinStreak: number;
  maxLossStreak: number;
  /** Median time in trade, ms. */
  medianHoldMs: number;
  long: AnaAgg;
  short: AnaAgg;
}
export interface AnaPerformance {
  days: AnaDay[];
  weeks: AnaWeek[];
  worstWeek: string | null;
  greenWeeks: number;
  rUnit: boolean;
  months: AnaMonth[];
  stats: AnaStats;
  ai: { header: AiLine | null; calendar: AiLine | null; months: AiLine | null; stats: AiLine | null };
}

export interface AnaHourCell extends AnaAgg { day: number; hour: number }
export interface AnaTime {
  days: number[];
  cells: AnaHourCell[];
  dayTotals: Array<AnaAgg & { day: number }>;
  hourTotals: Array<AnaAgg & { hour: number }>;
  /** The "after HH:00" leak (same rule as the dashboard), outlined on the heat map. */
  late: (AnaAgg & { from: number }) | null;
  /** Best contiguous UTC hour window when trading outside it loses. */
  bestHours: { from: number; to: number; inside: AnaAgg; outside: AnaAgg } | null;
  sessions: Array<AnaAgg & { session: DashSession }>;
  ai: { header: AiLine | null; heat: AiLine | null; sessions: AiLine | null };
}

export interface AnaSymbolSeries extends AnaAgg {
  symbol: string;
  profitFactor: number | null;
  /** Cumulative net after each trade, sampled (first point is 0). */
  pts: Array<{ t: number; v: number }>;
  monthsLost: number;
  monthsTraded: number;
  flag: 'pause' | 'share' | null;
}
export interface AnaSymbols {
  series: AnaSymbolSeries[];
  /** Symbols beyond the small multiples (by trade count). */
  hidden: number;
  grid: { symbols: string[]; cells: Array<AnaAgg & { symbol: string; session: DashSession }>; flagged: string | null };
  ai: { header: AiLine | null; series: AiLine | null; grid: AiLine | null };
}

export interface AnaHold {
  unit: '$' | 'R';
  points: Array<{ ms: number; v: number; win: boolean }>;
  /** Losers held longer than most winners (75th percentile of winner hold, rounded). */
  longLosers: { thresholdMs: number; n: number; net: number } | null;
  /** Median loser hold ÷ median winner hold. */
  ratio: number | null;
}
export interface AnaExit {
  /** Winners with MFE: share of the best open profit that was kept (net ÷ MFE, 0–1). */
  bins: Array<{ from: number; to: number; n: number }>;
  avg: number;
  n: number;
}
export interface AnaRisk {
  unit: '$' | 'R';
  withR: number;
  withMae: number;
  distribution: DashDistribution | null;
  hold: AnaHold | null;
  maeMfe: DashMaeMfe | null;
  rolling20: DashRolling | null;
  rolling50: DashRolling | null;
  exit: AnaExit | null;
  avgWin: number;
  avgLoss: number;
  ai: { header: AiLine | null; distribution: AiLine | null; hold: AiLine | null; maeMfe: AiLine | null; rolling: AiLine | null; exit: AiLine | null };
}

/** 'user-rule' = the trader's own rules (Settings › Trading rules), bucketed first. */
export type AnaRuleKey = 'user-rule' | 'after-losses' | 'revenge' | 'oversized' | 'hour' | 'tail';
export interface AnaRuleBucket extends AnaAgg { key: AnaRuleKey; label: string }
export interface AnaBehaviour {
  /** Waterfall: rules kept, then each trade once under the first rule it broke, then net. */
  waterfall: { kept: AnaAgg; rules: AnaRuleBucket[]; total: AnaAgg } | null;
  score: DashBehaviour | null;
  /** One char per trade, oldest first ('1' passed, '0' failed), at most the last 300 trades. */
  strips: Array<{ key: 'discipline' | 'risk' | 'timing'; label: string; failed: number; bits: string }> | null;
  /** Grouped by losing trades in a row earlier that UTC day. size = mean volume ÷ usual size. */
  byLosses: Array<AnaAgg & { key: '0' | '1' | '2' | '3+'; size: number | null }>;
  /** Grouped by volume ÷ usual size on that symbol. avg in unit. */
  bySize: { unit: '$' | 'R'; rows: Array<AnaAgg & { key: 'normal' | 'up' | 'big'; label: string; avg: number }> } | null;
  tags: Array<AnaAgg & { label: string }>;
  emotions: Array<AnaAgg & { label: string }>;
  ai: { header: AiLine | null; waterfall: AiLine | null; score: AiLine | null; losses: AiLine | null; size: AiLine | null };
}

export interface AnaFix { key: string; label: string; /** Net kept by this rule on its own. */ alone: number; trades: number }
export interface AnaWhatIf {
  base: number;
  /** At most 5 fixes, the dashboard's leaks in rank order. */
  fixes: AnaFix[];
  /** gains[mask]: net kept by skipping the union of the chosen fixes' trades (each trade once). */
  gains: number[];
  /** removed[mask]: trades skipped for that union. */
  removed: number[];
  /** Fixes on by default: the top fix, plus the other fix that adds the most on top of it (if any). */
  defaultMask: number;
  /** Break-even once a loser reached +1R first (needs R and MAE/MFE). */
  breakEven: { gain: number; trades: number } | null;
  breakEvenNeeds: 'mae' | 'r' | null;
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
