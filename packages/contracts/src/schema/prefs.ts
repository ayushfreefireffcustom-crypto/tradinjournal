// Trading prefs (GET/PUT /api/me/trading-prefs): the trader's own rules, the
// risk cap the Charts risk ruler uses, and saved dashboard layouts.
//
// Rules (all optional; null = off). Times are UTC, by the trade's OPEN:
//   • maxTradesPerDay   N    the (N+1)th trade opened in a UTC day breaks it
//   • tradingHours      from–to (HH:MM, UTC; wraps past midnight when from > to)
//   • maxRiskPct        X    risk at entry > X% of the balance (needs a stop / R)
//   • stopAfterLosses   N    opened after N losing trades closed earlier that UTC day
//   • dailyLossCapPct   X    opened when the day's closed P&L was already ≤ −X% of
//                            the balance at the start of the day
//   • maxSizeX          X    volume > X × your median volume on that symbol
//                            (symbols with 3+ trades)
import { z } from 'zod';

export const RULE_KEYS = ['maxTradesPerDay', 'tradingHours', 'maxRiskPct', 'stopAfterLosses', 'dailyLossCapPct', 'maxSizeX'] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

export const tradingRulesSchema = z.object({
  maxTradesPerDay: z.number().int().min(1).max(100).nullable().optional(),
  tradingHours: z.object({ from: hhmm, to: hhmm }).refine(h => h.from !== h.to, 'From and to must differ').nullable().optional(),
  maxRiskPct: z.number().min(0.05).max(25).nullable().optional(),
  stopAfterLosses: z.number().int().min(1).max(20).nullable().optional(),
  dailyLossCapPct: z.number().min(0.1).max(50).nullable().optional(),
  maxSizeX: z.number().min(1.1).max(10).nullable().optional(),
}).strict();
export type TradingRules = z.infer<typeof tradingRulesSchema>;

export const DEFAULT_RISK_CAP_PCT = 2;

// ── dashboard layouts ──

export const DASH_WIDGETS = ['equity', 'leaks', 'heatmap', 'mae', 'dist', 'rolling', 'behaviour', 'before', 'plan', 'symbols', 'recent'] as const;
export type DashWidgetId = (typeof DASH_WIDGETS)[number];
export const DASH_SPANS = [3, 4, 6, 8, 12] as const;
export const BUILTIN_LAYOUTS = ['overview', 'risk', 'execution'] as const;

/** "equity" or "equity:8" (widget id, optional column span out of 12). */
const widgetEntry = z.string().regex(new RegExp(`^(${DASH_WIDGETS.join('|')})(:(${DASH_SPANS.join('|')}))?$`));
export const dashLayoutSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(24),
  widgets: z.array(widgetEntry).min(1).max(DASH_WIDGETS.length)
    .refine(ws => new Set(ws.map(w => w.split(':')[0])).size === ws.length, 'Each widget once'),
}).strict();
export type DashLayout = z.infer<typeof dashLayoutSchema>;

export const tradingLayoutsSchema = z.object({
  dashboard: z.object({
    tabs: z.array(dashLayoutSchema).max(8).refine(ts => new Set(ts.map(t => t.id)).size === ts.length, 'Layout ids must be unique'),
  }).strict().optional(),
}).strict();
export type TradingLayouts = z.infer<typeof tradingLayoutsSchema>;

export const tradingPrefsUpdateSchema = z.object({
  rules: tradingRulesSchema.optional(),
  riskCapPct: z.number().min(0.1).max(10).optional(),
  layouts: tradingLayoutsSchema.optional(),
}).strict().refine(v => v.rules !== undefined || v.riskCapPct !== undefined || v.layouts !== undefined, 'Nothing to save');
export type TradingPrefsUpdate = z.infer<typeof tradingPrefsUpdateSchema>;

export interface TradingPrefsDTO {
  rules: TradingRules;
  riskCapPct: number;
  layouts: TradingLayouts;
  /** false until the trading_prefs table exists (defaults shown, saving returns 503). */
  persisted: boolean;
  updatedAt: string | null;
}

// ── live preview of rules on the trader's history (POST /api/insights/rules-preview) ──

export const rulesPreviewSchema = z.object({
  accountId: z.string().min(1).max(64),
  rules: tradingRulesSchema,
  days: z.number().int().min(7).max(365).default(90),
}).strict();
export type RulesPreviewInput = z.infer<typeof rulesPreviewSchema>;

export interface RulePreviewRow {
  /** Trades in the window that broke this rule. */
  n: number;
  /** Their net P&L. */
  net: number;
  /** Trades the rule could be checked on (maxRiskPct needs R; others = all). */
  checked: number;
}
export interface RulesPreviewDTO {
  days: number;
  /** Closed trades in the window. */
  trades: number;
  rules: Partial<Record<RuleKey, RulePreviewRow>>;
  /** Trades that broke at least one rule (each once). */
  any: { n: number; net: number };
}
