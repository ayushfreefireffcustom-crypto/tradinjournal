// The trader's own rules (Settings › Trading rules) as per-trade flags. Pure
// functions over the same InsightTrade list the dashboard uses; compute.ts
// attaches the hits to each trade's context so grades, the behaviour score,
// the plan, the trade log's "Rule broken" view and the Analytics waterfall
// all count them, labelled "Your rule". With no rules set nothing changes.
//
// Conventions (also in packages/contracts/src/schema/prefs.ts):
//   • UTC days and hours, by the trade's OPEN.
//   • Balance at a moment = starting balance + net of every trade closed
//     before it (deposits after the first trade aren't known here).
//   • maxRiskPct needs the risk at entry: |net ÷ R| from a stored R-multiple.
//     Trades without R are not checked (never flagged).
import type { RuleKey, RulesPreviewDTO, TradingRules } from '@tradinjournal/contracts';
import type { InsightTrade } from './compute.js';
import { fundedBefore, opsOrStart, type BalanceOp } from './funding.js';

export type RulePart = 'discipline' | 'risk' | 'timing';
export interface UserRuleHit {
  key: RuleKey;
  /** Which behaviour check it counts against. */
  part: RulePart;
  /** The rule itself: "Max 3 trades a day". */
  rule: string;
  /** This trade's number, 2–4 words: "Trade 4 today". */
  label: string;
  /** One line of evidence. */
  detail: string;
}
export interface UserRules { rules: TradingRules; startingBalance: number; balanceOps?: BalanceOp[] | null }

/** Prefix of a grade reason that came from one of the trader's own rules. */
export const USER_RULE_PREFIX = 'Your rule: ';
export const isUserRuleReason = (r: string) => r.startsWith(USER_RULE_PREFIX);

const DAY = 86_400_000;
const EPS = 1e-9;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const minuteOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const num = (v: number) => (Number.isInteger(v) ? String(v) : String(round(v, 2)));
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const signedPct = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const PART: Record<RuleKey, RulePart> = {
  maxTradesPerDay: 'discipline', tradingHours: 'timing', maxRiskPct: 'risk',
  stopAfterLosses: 'discipline', dailyLossCapPct: 'discipline', maxSizeX: 'risk',
};

/** The rules that are switched on, in display order. */
export function activeRules(r: TradingRules | null | undefined): RuleKey[] {
  if (!r) return [];
  const out: RuleKey[] = [];
  if (r.maxTradesPerDay != null) out.push('maxTradesPerDay');
  if (r.tradingHours) out.push('tradingHours');
  if (r.maxRiskPct != null) out.push('maxRiskPct');
  if (r.stopAfterLosses != null) out.push('stopAfterLosses');
  if (r.dailyLossCapPct != null) out.push('dailyLossCapPct');
  if (r.maxSizeX != null) out.push('maxSizeX');
  return out;
}
export const hasRules = (r: TradingRules | null | undefined) => activeRules(r).length > 0;

/** Short name of a rule as the trader set it. */
export function ruleName(key: RuleKey, r: TradingRules): string {
  switch (key) {
    case 'maxTradesPerDay': return `Max ${r.maxTradesPerDay} trade${r.maxTradesPerDay === 1 ? '' : 's'} a day`;
    case 'tradingHours': return `${r.tradingHours!.from}–${r.tradingHours!.to} UTC only`;
    case 'maxRiskPct': return `Risk ≤ ${num(r.maxRiskPct!)}% a trade`;
    case 'stopAfterLosses': return `Stop after ${r.stopAfterLosses} loss${r.stopAfterLosses === 1 ? '' : 'es'}`;
    case 'dailyLossCapPct': return `Daily loss cap ${num(r.dailyLossCapPct!)}%`;
    case 'maxSizeX': return `Max ${num(r.maxSizeX!)}× usual size`;
  }
}

/** Is a UTC minute-of-day inside [from, to)? Wraps past midnight when from > to. */
export function inHours(minute: number, from: string, to: string): boolean {
  const a = minuteOf(from), b = minuteOf(to);
  return a < b ? minute >= a && minute < b : minute >= a || minute < b;
}

/** Each trade's breaks of the trader's rules (trades with none are absent). */
export function userRuleHits(all: InsightTrade[], r: TradingRules, startingBalance: number, balanceOps?: BalanceOp[] | null): Map<string, UserRuleHit[]> {
  const out = new Map<string, UserRuleHit[]>();
  const keys = activeRules(r);
  if (!keys.length || !all.length) return out;
  const hit = (t: InsightTrade, key: RuleKey, label: string, detail: string) => {
    const h: UserRuleHit = { key, part: PART[key], rule: ruleName(key, r), label, detail };
    const xs = out.get(t.id);
    if (xs) xs.push(h); else out.set(t.id, [h]);
  };

  // Closes in order with running net, for "balance before" and "closed earlier today".
  const byClose = [...all].sort((a, b) => a.close - b.close);
  const cum: number[] = [];
  byClose.reduce((s, t, i) => (cum[i] = s + t.net), 0);
  /** Index of the first trade closed at or after ms. */
  const idxAt = (ms: number) => { let lo = 0, hi = byClose.length; while (lo < hi) { const m = (lo + hi) >> 1; if (byClose[m]!.close < ms) lo = m + 1; else hi = m; } return lo; };
  const ops = opsOrStart(balanceOps, startingBalance);
  const balanceBefore = (ms: number) => { const i = idxAt(ms); return fundedBefore(ops, ms) + (i > 0 ? cum[i - 1]! : 0); };

  // Trade number within its UTC day, by open.
  const nth = new Map<string, number>();
  if (r.maxTradesPerDay != null) {
    const byDay = new Map<string, InsightTrade[]>();
    for (const t of all) { const k = dayKey(t.open); const xs = byDay.get(k); if (xs) xs.push(t); else byDay.set(k, [t]); }
    for (const xs of byDay.values()) xs.sort((a, b) => a.open - b.open || (a.id < b.id ? -1 : 1)).forEach((t, i) => nth.set(t.id, i + 1));
  }
  const med = new Map<string, number | null>();
  if (r.maxSizeX != null) {
    const vols = new Map<string, number[]>();
    for (const t of all) { const xs = vols.get(t.symbol); if (xs) xs.push(t.volume); else vols.set(t.symbol, [t.volume]); }
    for (const [s, v] of vols) med.set(s, v.length >= 3 ? median(v) : null);
  }

  for (const t of all) {
    for (const key of keys) {
      switch (key) {
        case 'maxTradesPerDay': {
          const n = nth.get(t.id)!;
          if (n > r.maxTradesPerDay!) hit(t, key, `${ordinal(n)} trade that day`, `Trade ${n} opened that UTC day; your max is ${r.maxTradesPerDay}`);
          break;
        }
        case 'tradingHours': {
          const d = new Date(t.open);
          const m = d.getUTCHours() * 60 + d.getUTCMinutes();
          if (!inHours(m, r.tradingHours!.from, r.tradingHours!.to)) hit(t, key, `Opened ${hhmm(t.open)} UTC`, `Outside your ${r.tradingHours!.from}–${r.tradingHours!.to} UTC hours`);
          break;
        }
        case 'maxRiskPct': {
          if (t.r == null || !Number.isFinite(t.r) || Math.abs(t.r) < EPS || Math.abs(t.net) < EPS) break;
          const bal = balanceBefore(t.open);
          if (!(bal > 0)) break;
          const pct = (Math.abs(t.net / t.r) / bal) * 100;
          if (pct > r.maxRiskPct! + EPS) hit(t, key, `Risked ${pct.toFixed(1)}%`, `Stop risked ${pct.toFixed(1)}% of the balance; your max is ${num(r.maxRiskPct!)}%`);
          break;
        }
        case 'stopAfterLosses': {
          const from = idxAt(dayStart(t.open)), to = idxAt(t.open);
          let losses = 0;
          for (let i = from; i < to; i++) { const p = byClose[i]!; if (p.id !== t.id && p.net < 0) losses++; }
          if (losses >= r.stopAfterLosses!) hit(t, key, `After ${losses} loss${losses === 1 ? '' : 'es'}`, `${losses} losing trade${losses === 1 ? '' : 's'} closed earlier that UTC day; you stop at ${r.stopAfterLosses}`);
          break;
        }
        case 'dailyLossCapPct': {
          const ds = dayStart(t.open);
          const startBal = balanceBefore(ds);
          if (!(startBal > 0)) break;
          const from = idxAt(ds), to = idxAt(t.open);
          let day = 0;
          for (let i = from; i < to; i++) if (byClose[i]!.id !== t.id) day += byClose[i]!.net;
          const pct = (day / startBal) * 100;
          if (day < 0 && pct <= -r.dailyLossCapPct! + EPS) hit(t, key, `Day at ${signedPct(pct)}`, `The day was already ${signedPct(pct)} when it opened; your cap is ${num(r.dailyLossCapPct!)}%`);
          break;
        }
        case 'maxSizeX': {
          const m = med.get(t.symbol);
          if (m == null || !(m > 0)) break;
          const x = t.volume / m;
          if (x > r.maxSizeX! + EPS) hit(t, key, `${x.toFixed(1)}× size`, `${t.volume} lots vs your usual ${round(m, 2)} on ${t.symbol}; your max is ${num(r.maxSizeX!)}×`);
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Settings preview: how often each rule was broken over the last `days`
 * (by close) and what those trades netted. Rules are checked against the
 * whole history (a day's earlier trades count even before the window).
 */
export function rulesPreview(all: InsightTrade[], r: TradingRules, startingBalance: number, now: number, days: number, balanceOps?: BalanceOp[] | null): RulesPreviewDTO {
  const from = now - days * DAY;
  const T = all.filter(t => t.close >= from && t.close <= now);
  const ids = new Set(T.map(t => t.id));
  const hits = userRuleHits(all, r, startingBalance, balanceOps);
  const out: RulesPreviewDTO = { days, trades: T.length, rules: {}, any: { n: 0, net: 0 } };
  for (const key of activeRules(r)) {
    const broke = T.filter(t => hits.get(t.id)?.some(h => h.key === key));
    out.rules[key] = {
      n: broke.length, net: round(broke.reduce((s, t) => s + t.net, 0)),
      checked: key === 'maxRiskPct' ? T.filter(t => t.r != null && Math.abs(t.r) > EPS && Math.abs(t.net) > EPS).length : T.length,
    };
  }
  const any = T.filter(t => ids.has(t.id) && hits.has(t.id));
  out.any = { n: any.length, net: round(any.reduce((s, t) => s + t.net, 0)) };
  return out;
}

/** Stable short key of a rule set (cache keys). */
export function rulesKey(r: TradingRules | null | undefined): string {
  if (!hasRules(r)) return '-';
  return activeRules(r).map(k => `${k}=${JSON.stringify(r![k])}`).join(';');
}
