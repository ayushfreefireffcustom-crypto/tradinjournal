// Dashboard v2 numbers: pure functions over an account's closed trades.
// Everything is computed from real trades; a block that can't be computed
// honestly comes back null (or empty) and the page shows an empty state.
//
// Conventions (also on the page and in packages/contracts/src/schema/dashboard-v2.ts):
//   • Times are UTC. A trade belongs to the hour, weekday and session of its OPEN.
//   • Sessions: Asia 22:00–07:00, London 07:00–13:00, New York 13:00–22:00 (UTC),
//     the same cut-offs the AI coach uses (packages/core/src/analysis/context.ts).
//   • A win is net P&L > 0 (fees and swap included).
//   • R comes only from a stored R-multiple (needs a stop at entry). When fewer
//     than half the trades have one, the R widgets switch to $.
//
// Behaviour score (shown only with ≥ MIN_TRADES trades), three checks per trade:
//   discipline: not opened after 2+ losses in a row that UTC day, and not opened
//               within 15 minutes of a losing trade closing;
//   risk:       volume ≤ 1.5× your median volume on that symbol, and (when R is
//               known) the loss didn't run past −1.25R;
//   timing:     opened in a UTC hour that is net positive for you in this view
//               (hours with fewer than 3 trades always pass).
//   Each part = % of trades that pass; score = rounded mean of the three parts.
//   "Last 30" = the same checks on the 30 most recent trades.
// Process grade per trade (same checks, ≥ MIN_TRADES): count the flags
//   after 2 losses · within 15 min of a loss · oversized · losing hour · past −1.25R
//   0 → A, 1 → B, 2 → C, 3 → D, 4+ → F. The grade ignores the trade's result.
import type {
  AiLine, DashboardV2DTO, DashBehaviour, DashDistribution, DashEquity, DashHeatmap, DashKpis,
  DashMaeMfe, DashPlanRule, DashRecentTrade, DashRolling, DashSession, DashSymbolRow, EquityPointDTO,
  HourCellDTO, LeakDTO, ProcessGrade,
  TradingRules,
} from '@tradinjournal/contracts';
import { fundedBefore, opsOrStart, type BalanceOp } from './funding.js';
import { hasRules, USER_RULE_PREFIX, userRuleHits, type UserRuleHit, type UserRules } from './rules.js';

export interface InsightTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  open: number;
  close: number;
  volume: number;
  net: number;
  r: number | null;
  mae: number | null;
  mfe: number | null;
  tags: string[];
  /** From recorded stop levels (trade-data): the stop was moved after entry. Absent = unknown. */
  stopMove?: 'widened' | 'tightened' | null;
}

export interface DashFilters { symbol?: string; session?: DashSession; side?: 'LONG' | 'SHORT'; tag?: string }
export interface ComputeOptions {
  now: number;
  window: { from: number | null; to: number | null };
  filters: DashFilters;
  /** Net of every balance operation (deposits − withdrawals). Used as one
   *  opening deposit only when balanceOps is absent. */
  startingBalance: number;
  /** Deposits and withdrawals with their times (MT5 BALANCE deals), oldest first. */
  balanceOps?: BalanceOp[] | null;
  /** The trader's own rules (rules.ts); null/absent = none, nothing changes. */
  rules?: TradingRules | null;
}

export const MIN_TRADES = 20;
const HOUR = 3_600_000;
const DAY = 86_400_000;
export const REVENGE_MS = 15 * 60_000;
export const OVERSIZE = 1.5;
export const R_TAIL = -1.25;

// ─── small helpers ───────────────────────────────────────────────────────────

export const hourOf = (ms: number) => new Date(ms).getUTCHours();
export const weekdayOf = (ms: number) => new Date(ms).getUTCDay();
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function sessionOf(ms: number): DashSession {
  const h = hourOf(ms);
  if (h < 7 || h >= 22) return 'ASIA';
  if (h < 13) return 'LONDON';
  return 'NY';
}
export const SESSION_LABEL: Record<DashSession, string> = { ASIA: 'Asia', LONDON: 'London', NY: 'NY' };
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i]!;
}
/** Evenly spaced sample that always keeps the first and last value. */
export function sample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(xs[Math.round((k * (xs.length - 1)) / (max - 1))]!);
  return out;
}
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
}

export interface Agg { n: number; wins: number; net: number }
export const agg = (ts: InsightTrade[]): Agg => ({ n: ts.length, wins: ts.filter(t => t.net > 0).length, net: round(sum(ts, t => t.net)) });

export function fmtMoney(v: number): string {
  const a = Math.abs(Math.round(v));
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}$${a.toLocaleString('en-US')}`;
}
export const pct0 = (v: number) => `${Math.round(v * 100)}%`;
/** "1 trade", "3 trades", "1 loss", "2 losses". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const line = (text: string, value: number | null, fmt: AiLine['fmt'], trades: number, tone?: AiLine['tone'], suffix?: string): AiLine => ({
  text, value: value == null ? null : round(value), fmt, trades,
  // A value that shows as $0.00 / 0.00R is flat, not a loss.
  tone: tone ?? (value == null || Math.abs(value) < 0.005 ? 'flat' : value > 0 ? 'up' : 'dn'),
  ...(suffix ? { suffix } : {}),
});

// ─── trade context (needs the whole account history, not just the view) ──────

export interface TradeContext {
  /** Losing trades in a row (same UTC day) closed before this one opened. */
  priorLosses: number;
  /** Opened within 15 minutes of a losing trade closing. */
  revenge: boolean;
  /** Volume > 1.5× the median volume on this symbol (symbols with ≥ 3 trades). */
  oversized: boolean;
  /** The trader's own rules this trade broke (rules.ts), when any are set. */
  userRules?: UserRuleHit[];
}

export function tradeContext(all: InsightTrade[], user?: UserRules | null): Map<string, TradeContext> {
  const byClose = [...all].sort((a, b) => a.close - b.close);
  const vols = new Map<string, number[]>();
  for (const t of all) (vols.get(t.symbol) ?? vols.set(t.symbol, []).get(t.symbol)!).push(t.volume);
  const med = new Map([...vols].map(([s, v]) => [s, v.length >= 3 ? median(v) : null]));
  const out = new Map<string, TradeContext>();
  for (const t of all) {
    // Last trade closed strictly before this one opened (binary search).
    let lo = 0, hi = byClose.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (byClose[m]!.close < t.open) lo = m + 1; else hi = m; }
    const day = dayKey(t.open);
    let losses = 0;
    for (let i = lo - 1; i >= 0; i--) {
      const p = byClose[i]!;
      if (p.id === t.id || dayKey(p.close) !== day || p.net >= 0) break;
      losses++;
    }
    const prev = lo > 0 ? byClose[lo - 1]! : null;
    const m = med.get(t.symbol);
    out.set(t.id, {
      priorLosses: losses,
      revenge: !!prev && prev.id !== t.id && prev.net < 0 && t.open - prev.close <= REVENGE_MS,
      oversized: m != null && m > 0 && t.volume > OVERSIZE * m,
    });
  }
  if (user && hasRules(user.rules)) for (const [id, hits] of userRuleHits(all, user.rules, user.startingBalance, user.balanceOps)) { const c = out.get(id); if (c) c.userRules = hits; }
  return out;
}

// ─── window + filters ────────────────────────────────────────────────────────

export function inWindow(ts: InsightTrade[], w: { from: number | null; to: number | null }): InsightTrade[] {
  return ts.filter(t => (w.from == null || t.close >= w.from) && (w.to == null || t.close <= w.to));
}
export function applyFilters(ts: InsightTrade[], f: DashFilters): InsightTrade[] {
  return ts.filter(t => (!f.symbol || t.symbol === f.symbol)
    && (!f.session || sessionOf(t.open) === f.session)
    && (!f.side || t.side === f.side)
    && (!f.tag || t.tags.includes(f.tag)));
}

// ─── blocks ──────────────────────────────────────────────────────────────────

interface Curve { pts: EquityPointDTO[]; dd: DashEquity['drawdown']; basis: DashEquity['basis']; start: number }
/**
 * Balance after each trade in T. Deposits and withdrawals (ops) land on the
 * first point at or after them (`flow`); ops after the last trade, up to the
 * end of the window, end the curve on one more point with no trade, so it
 * finishes on the real balance. Cash flows never count as drawdown: the
 * running peak moves with them.
 *
 * When the flows aren't known, or the curve would go below zero (deposits
 * missing from the history), it is plotted as cumulative P&L from 0 instead
 * (basis 'pnl'), never as a fake negative balance.
 */
function curve(T: InsightTrade[], start: number, ops: BalanceOp[], from: number, to: number): Curve {
  const later = ops.filter(o => o.t >= from && o.t <= to);
  // On the P&L basis there is no balance to take a percentage of.
  const build = (s: number, flows: BalanceOp[], withPct: boolean) => {
    let bal = s, peak = s, peakT = T[0]?.close ?? 0, peakI = -1, k = 0;
    let best: DashEquity['drawdown'] = null;
    const pts: EquityPointDTO[] = [];
    const note = (t: number, i: number) => {
      if (bal > peak) { peak = bal; peakT = t; peakI = i; }
      else if (peak > bal) {
        const pct = withPct && peak > 0 ? (peak - bal) / peak : null;
        const amount = peak - bal;
        const cur = best as DashEquity['drawdown'];
        const deeper = !cur || (pct != null && cur.pct != null ? pct > cur.pct : amount > cur.amount);
        if (deeper) best = { pct: pct == null ? null : round(pct, 4), amount: round(amount), peakT, troughT: t, trades: i - peakI };
      }
    };
    T.forEach((t, i) => {
      let flow = 0;
      while (k < flows.length && flows[k]!.t <= t.close) flow += flows[k++]!.amount;
      bal += flow + t.net;
      peak += flow;
      pts.push({ t: t.close, v: round(bal), pnl: round(t.net), ...(flow ? { flow: round(flow) } : {}) });
      note(t.close, i);
    });
    let flow = 0, lastT = 0;
    while (k < flows.length) { flow += flows[k]!.amount; lastT = flows[k++]!.t; }
    if (flow) { bal += flow; pts.push({ t: lastT, v: round(bal), pnl: 0, flow: round(flow) }); }
    return { pts, dd: best as DashEquity['drawdown'], low: pts.reduce((m, p) => Math.min(m, p.v), s) };
  };
  if (ops.length) {
    const b = build(start, later, true);
    if (b.low >= 0) return { pts: b.pts, dd: b.dd, basis: 'balance', start };
  }
  const p = build(0, [], false);
  return { pts: p.pts, dd: p.dd, basis: 'pnl', start: 0 };
}

/** Curve points merged per UTC day (last balance of the day, summed P&L and cash flow). */
function dailyPoints(pts: EquityPointDTO[]): EquityPointDTO[] {
  const out: EquityPointDTO[] = [];
  for (const p of pts) {
    const last = out.at(-1);
    if (last && dayKey(last.t) === dayKey(p.t)) {
      last.v = p.v; last.pnl = round(last.pnl + p.pnl); last.t = p.t;
      const flow = round((last.flow ?? 0) + (p.flow ?? 0));
      if (flow) last.flow = flow; else delete last.flow;
    } else {
      const { leak: _l, moved: _m, ...q } = p;
      out.push({ ...q });
    }
  }
  return out;
}

/** Like sample(), but a dropped point's cash flow moves onto the next kept point. */
export function sampleCurve(pts: EquityPointDTO[], max: number): EquityPointDTO[] {
  if (pts.length <= max) return pts;
  const keep = new Set(sample(pts.map((_, i) => i), max));
  const out: EquityPointDTO[] = [];
  let carry = 0;
  pts.forEach((p, i) => {
    carry += p.flow ?? 0;
    if (!keep.has(i)) return;
    const { flow: _f, ...q } = p;
    out.push(carry ? { ...q, flow: round(carry) } : q);
    carry = 0;
  });
  return out;
}

/** Ranked leaks: slices of trades decided before entry, worst net first. */
export function findLeaks(T: InsightTrade[], ctx: Map<string, TradeContext>): Array<LeakDTO & { ids: string[] }> {
  const cands: Array<LeakDTO & { ids: string[] }> = [];
  const add = (key: string, label: string, sub: string, ts: InsightTrade[]) => {
    if (ts.length < 3 || ts.length === T.length) return;
    const a = agg(ts);
    if (a.net < 0) cands.push({ key, label, sub, trades: a.n, wins: a.wins, net: a.net, ids: ts.map(t => t.id) });
  };
  // Late in the day: the cut-off hour (08–21 UTC) after which trading loses the most.
  let late: { h: number; ts: InsightTrade[]; net: number } | null = null;
  for (let h = 8; h <= 21; h++) {
    const ts = T.filter(t => hourOf(t.open) >= h);
    const net = sum(ts, t => t.net);
    if (ts.length >= 3 && ts.length < T.length && net < 0 && (!late || net < late.net)) late = { h, ts, net };
  }
  if (late) add('late', `After ${String(late.h).padStart(2, '0')}:00`, `${late.ts.length} trades · UTC`, late.ts);
  const after2 = T.filter(t => (ctx.get(t.id)?.priorLosses ?? 0) >= 2);
  add('after-losses', 'After 2 losses', `${after2.length} trades · same day`, after2);
  const revenge = T.filter(t => ctx.get(t.id)?.revenge);
  add('revenge', 'Revenge trades', `${revenge.length} · ≤15 min after a loss`, revenge);
  const big = T.filter(t => ctx.get(t.id)?.oversized);
  add('oversized', 'Oversized', `${big.length} trades · >1.5× size`, big);
  // Only when stop moves were recorded (trade_level rows): trades whose stop was widened.
  const widened = T.filter(t => t.stopMove === 'widened');
  add('moved-stop', 'Moved stop', `${widened.length} trades · stop widened`, widened);
  const worstOf = <K extends string | number>(keyOf: (t: InsightTrade) => K) => {
    const m = new Map<K, InsightTrade[]>();
    for (const t of T) (m.get(keyOf(t)) ?? m.set(keyOf(t), []).get(keyOf(t))!).push(t);
    let w: [K, InsightTrade[], number] | null = null;
    for (const [k, ts] of m) { const net = sum(ts, t => t.net); if (ts.length >= 3 && (!w || net < w[2])) w = [k, ts, net]; }
    return w;
  };
  const sym = worstOf(t => t.symbol);
  if (sym) add(`sym:${sym[0]}`, sym[0], `${sym[1].length} trades`, sym[1]);
  const ses = worstOf(t => sessionOf(t.open));
  if (ses) add(`ses:${ses[0]}`, `${SESSION_LABEL[ses[0]]} session`, `${ses[1].length} trades`, ses[1]);
  const wd = worstOf(t => weekdayOf(t.open));
  if (wd) add(`day:${wd[0]}`, `${DAY_LONG[wd[0]]}s`, `${wd[1].length} trades`, wd[1]);
  return cands.sort((a, b) => a.net - b.net).slice(0, 5);
}

/** Net you would have kept by skipping the trades of several leaks (each trade counted once). */
export function skipGain(T: InsightTrade[], leaks: Array<{ ids: string[] }>): { gain: number; trades: number } {
  const ids = new Set(leaks.flatMap(l => l.ids));
  const ts = T.filter(t => ids.has(t.id));
  return { gain: round(-sum(ts, t => t.net)), trades: ts.length };
}

export function heatmap(T: InsightTrade[]): DashHeatmap {
  const S: DashSession[] = ['ASIA', 'LONDON', 'NY'];
  const days = [1, 2, 3, 4, 5];
  if (T.some(t => weekdayOf(t.open) === 6)) days.push(6);
  if (T.some(t => weekdayOf(t.open) === 0)) days.push(0);
  const cells = S.flatMap(session => days.map(day => ({ session, day, ...agg(T.filter(t => sessionOf(t.open) === session && weekdayOf(t.open) === day)) })));
  const elig = cells.filter(c => c.n >= 2);
  const best = elig.filter(c => c.net > 0).sort((a, b) => b.net - a.net)[0];
  const worst = elig.filter(c => c.net < 0).sort((a, b) => a.net - b.net)[0];
  return {
    days, cells,
    sessions: S.map(session => ({ session, ...agg(T.filter(t => sessionOf(t.open) === session)) })),
    dayTotals: days.map(day => ({ day, ...agg(T.filter(t => weekdayOf(t.open) === day)) })),
    best: best ? { session: best.session, day: best.day } : null,
    worst: worst ? { session: worst.session, day: worst.day } : null,
  };
}

export function maeMfe(T: InsightTrade[]): DashMaeMfe | null {
  const ts = T.filter(t => t.mae != null && t.mfe != null);
  if (ts.length < 10 || ts.length < T.length * 0.3) return null;
  const gaveBack = (t: InsightTrade) => t.net < 0 && Math.abs(t.mfe!) >= Math.abs(t.net);
  const gave = ts.filter(gaveBack);
  return {
    unit: '$',
    points: ts.map(t => ({ mae: round(-Math.abs(t.mae!)), mfe: round(Math.abs(t.mfe!)), win: t.net > 0, ...(gaveBack(t) ? { gave: true } : {}) })),
    gaveBack: gave.length ? { trades: gave.length, net: round(sum(gave, t => t.net)) } : null,
  };
}

export const useR = (T: InsightTrade[]) => { const k = T.filter(t => t.r != null).length; return k >= 10 && k >= T.length / 2; };

export function distribution(T: InsightTrade[]): DashDistribution | null {
  if (T.length < 5) return null;
  if (useR(T)) {
    const rs = T.filter(t => t.r != null);
    const bins: DashDistribution['bins'] = [];
    for (let b = -3; b < 5; b += 0.5) bins.push({ from: b, to: b + 0.5, n: 0 });
    for (const t of rs) bins[Math.min(bins.length - 1, Math.max(0, Math.floor((t.r! + 3) / 0.5)))]!.n++;
    const tail = rs.filter(t => t.r! < R_TAIL);
    // Saved by cutting each tail loss at −1R: loss − 1R risk (risk = net / r).
    const excess = sum(tail, t => -(t.net / t.r!) - t.net);
    return { unit: 'R', bins, mean: round(sum(rs, t => t.r!) / rs.length), tail: tail.length >= 2 ? { threshold: R_TAIL, trades: tail.length, net: round(sum(tail, t => t.net)), excess: round(excess) } : null };
  }
  const v = T.map(t => t.net).sort((a, b) => a - b);
  const lo = quantile(v, 0.02), hi = quantile(v, 0.98);
  const step = niceStep(Math.max(1, (hi - lo) / 12));
  const a = Math.floor(Math.min(lo, 0) / step) * step, b = Math.ceil(Math.max(hi, 0) / step) * step || step;
  const bins: DashDistribution['bins'] = [];
  for (let x = a; x < b - 1e-9; x += step) bins.push({ from: round(x), to: round(x + step), n: 0 });
  for (const x of v) bins[Math.min(bins.length - 1, Math.max(0, Math.floor((x - a) / step)))]!.n++;
  const losses = T.filter(t => t.net < 0);
  const avgLoss = losses.length ? -sum(losses, t => t.net) / losses.length : 0;
  const thr = -OVERSIZE * avgLoss;
  const tail = losses.filter(t => t.net < thr);
  return {
    unit: '$', bins, mean: round(sum(T, t => t.net) / T.length),
    tail: tail.length >= 2 ? { threshold: round(thr), trades: tail.length, net: round(sum(tail, t => t.net)), excess: round(sum(tail, t => thr - t.net)) } : null,
  };
}

export function rolling(T: InsightTrade[], window = 20): DashRolling | null {
  const R = useR(T);
  const ts = R ? T.filter(t => t.r != null) : T;
  if (ts.length < window + 10) return null;
  const val = (t: InsightTrade) => (R ? t.r! : t.net);
  const all: DashRolling['points'] = [];
  let s = 0;
  ts.forEach((t, i) => {
    s += val(t);
    if (i >= window) s -= val(ts[i - window]!);
    if (i >= window - 1) all.push({ i, t: t.close, v: round(s / window, R ? 3 : 2) });
  });
  const low = all.reduce((m, p) => (p.v < m.v ? p : m), all[0]!);
  const pts = sample(all, 160);
  if (!pts.includes(low)) { pts.push(low); pts.sort((a, b) => a.i - b.i); }
  return { unit: R ? 'R' : '$', window, points: pts, now: all.at(-1)!.v, low };
}

export interface Baseline { hourNet: Map<number, Agg> }
export const baseline = (T: InsightTrade[]): Baseline => {
  const m = new Map<number, InsightTrade[]>();
  for (const t of T) (m.get(hourOf(t.open)) ?? m.set(hourOf(t.open), []).get(hourOf(t.open))!).push(t);
  return { hourNet: new Map([...m].map(([h, ts]) => [h, agg(ts)])) };
};
export const badHour = (b: Baseline, t: InsightTrade) => { const a = b.hourNet.get(hourOf(t.open)); return !!a && a.n >= 3 && a.net < 0; };

export function checks(t: InsightTrade, c: TradeContext | undefined, b: Baseline) {
  const own = (p: UserRuleHit['part']) => !!c?.userRules?.some(h => h.part === p);
  return {
    discipline: !(c && (c.priorLosses >= 2 || c.revenge)) && !own('discipline'),
    risk: !(c?.oversized) && !(t.r != null && t.r < R_TAIL) && !own('risk'),
    timing: !badHour(b, t) && !own('timing'),
  };
}

export function behaviour(T: InsightTrade[], ctx: Map<string, TradeContext>): DashBehaviour | null {
  if (T.length < MIN_TRADES) return null;
  const b = baseline(T);
  const score = (ts: InsightTrade[], k: 'discipline' | 'risk' | 'timing') => Math.round((100 * ts.filter(t => checks(t, ctx.get(t.id), b)[k]).length) / ts.length);
  const last = T.slice(-30);
  const parts: DashBehaviour['parts'] = (['discipline', 'risk', 'timing'] as const).map(key => ({
    key, label: key[0]!.toUpperCase() + key.slice(1), score: score(T, key), last30: score(last, key),
  }));
  return {
    score: Math.round(sum(parts, p => p.score) / 3),
    last30: Math.round(sum(parts, p => p.last30) / 3),
    parts,
  };
}

const GRADES: ProcessGrade[] = ['A', 'B', 'C', 'D', 'F'];
export function grade(t: InsightTrade, c: TradeContext | undefined, b: Baseline): { grade: ProcessGrade; reasons: string[] } {
  // The trader's own rules come first ("Your rule: …"), then the built-in flags.
  const reasons: string[] = (c?.userRules ?? []).map(h => USER_RULE_PREFIX + h.rule);
  if (c && c.priorLosses >= 2) reasons.push('After 2 losses');
  if (c?.revenge) reasons.push('Within 15 min of a loss');
  if (c?.oversized) reasons.push('Oversized');
  if (badHour(b, t)) reasons.push('Losing hour');
  if (t.r != null && t.r < R_TAIL) reasons.push('Past −1.25R');
  return { grade: GRADES[Math.min(4, reasons.length)]!, reasons };
}

/**
 * Grades use the account's whole closed history as the baseline (same as the
 * trade log and trade review), so a trade's grade never changes with the filter.
 */
export function recent(T: InsightTrade[], ctx: Map<string, TradeContext>, n = 6, history: InsightTrade[] = T): DashRecentTrade[] {
  const b = history.length >= MIN_TRADES ? baseline(history) : null;
  return [...T].sort((a, z) => z.close - a.close).slice(0, n).map(t => {
    const g = b ? grade(t, ctx.get(t.id), b) : null;
    return {
      id: t.id, symbol: t.symbol, side: t.side, openTime: new Date(t.open).toISOString(), closeTime: new Date(t.close).toISOString(),
      net: round(t.net), r: t.r == null ? null : round(t.r), grade: g?.grade ?? null, reasons: g?.reasons ?? [],
    };
  });
}

/** Best contiguous UTC hour window (3–10 hours, by open) when trading outside it loses. */
export function bestHours(T: InsightTrade[]): { from: number; to: number; inside: Agg; outside: Agg } | null {
  let best: { from: number; to: number; net: number } | null = null;
  for (let a = 0; a < 24; a++) for (let len = 3; len <= 10 && a + len <= 24; len++) {
    const net = sum(T.filter(t => { const h = hourOf(t.open); return h >= a && h < a + len; }), t => t.net);
    if (!best || net > best.net) best = { from: a, to: a + len, net };
  }
  if (!best) return null;
  const inside = T.filter(t => { const h = hourOf(t.open); return h >= best!.from && h < best!.to; });
  const outside = T.filter(t => !inside.includes(t));
  if (inside.length < 5 || outside.length < 3) return null;
  const o = agg(outside);
  return o.net < 0 ? { from: best.from, to: best.to, inside: agg(inside), outside: o } : null;
}

export function plan(T: InsightTrade[], ctx: Map<string, TradeContext>, leaks: LeakDTO[]): DashPlanRule[] {
  if (T.length < MIN_TRADES) return [];
  const rules: DashPlanRule[] = [];
  const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
  // The trader's own rules broken in this view first: what those trades cost.
  const own = new Map<string, { part: UserRuleHit['part']; key: string; ts: InsightTrade[] }>();
  for (const t of T) for (const h of ctx.get(t.id)?.userRules ?? []) (own.get(h.rule) ?? own.set(h.rule, { part: h.part, key: h.key, ts: [] }).get(h.rule)!).ts.push(t);
  for (const [rule, o] of [...own].sort((a, b) => agg(a[1].ts).net - agg(b[1].ts).net).slice(0, 2)) {
    rules.push({ icon: o.key === 'tradingHours' ? 'clock' : o.part === 'risk' ? 'scales' : o.key === 'dailyLossCapPct' ? 'lock' : 'hourglass', text: `Your rule · ${rule}`, value: agg(o.ts).net, fmt: 'money', tone: 'dn' });
  }
  const win = bestHours(T);
  if (win) rules.push({ icon: 'clock', text: `${hh(win.from)}–${hh(win.to)} UTC only`, value: win.inside.net, fmt: 'money', tone: 'up' });
  const bySym = symbolsAgg(T);
  const top = bySym.filter(s => s.a.n >= 5 && s.a.net > 0).sort((a, b) => b.a.net - a.a.net)[0];
  if (top) rules.push({ icon: 'target', text: `${top.symbol} first`, value: top.a.wins / top.a.n, fmt: 'pct', tone: 'up' });
  const big = leaks.find(l => l.key === 'oversized');
  if (big) rules.push({ icon: 'scales', text: 'Max 1.5× usual size', value: big.net, fmt: 'money', tone: 'dn' });
  const a2 = T.filter(t => (ctx.get(t.id)?.priorLosses ?? 0) >= 2);
  const all = agg(T);
  if (a2.length >= 3 && agg(a2).wins / a2.length < all.wins / all.n) rules.push({ icon: 'hourglass', text: 'Stop after 2 losses', value: agg(a2).wins / a2.length, fmt: 'pct', tone: 'dn' });
  const worst = bySym.filter(s => s.a.n >= 5 && s.a.net < 0).sort((a, b) => a.a.net - b.a.net)[0];
  if (worst) rules.push({ icon: 'lock', text: `No ${worst.symbol}`, value: worst.a.net, fmt: 'money', tone: 'dn' });
  return rules.slice(0, 5);
}

function symbolsAgg(T: InsightTrade[]) {
  const m = new Map<string, InsightTrade[]>();
  for (const t of T) (m.get(t.symbol) ?? m.set(t.symbol, []).get(t.symbol)!).push(t);
  return [...m].map(([symbol, ts]) => ({ symbol, ts, a: agg(ts) }));
}

export function symbols(T: InsightTrade[]): DashSymbolRow[] {
  const R = useR(T);
  const rows = symbolsAgg(T).map(({ symbol, ts, a }) => {
    const gp = sum(ts.filter(t => t.net > 0), t => t.net), gl = -sum(ts.filter(t => t.net < 0), t => t.net);
    const pf = gl > 0 ? gp / gl : null;
    const rs = ts.filter(t => t.r != null);
    let c = 0;
    const spark = sample([0, ...ts.map(t => (c += t.net))], 30).map(v => round(v));
    let tag: DashSymbolRow['tag'] = null;
    if (a.n >= 5 && a.net < 0 && (pf ?? 0) < 0.7) tag = { kind: 'pause' };
    return {
      symbol, trades: a.n, winRate: round(a.wins / a.n, 4), profitFactor: pf == null ? null : round(pf),
      avg: R ? (rs.length ? round(sum(rs, t => t.r!) / rs.length) : 0) : round(a.net / a.n), avgUnit: (R ? 'R' : '$') as '$' | 'R',
      net: a.net, spark, tag,
    };
  }).sort((a, b) => b.net - a.net);
  const lead = rows[0];
  // Share of the profit made by the symbols that made money (never over 100%,
  // which net-of-losers would give). Only worth a tag when two or more made money.
  const winners = rows.filter(r => r.net > 0);
  const made = sum(winners, r => r.net);
  if (winners.length >= 2 && lead && lead.net > 0 && lead.net / made >= 0.5 && !lead.tag) lead.tag = { kind: 'share', pct: round(lead.net / made, 4) };
  return rows;
}

export function hours(T: InsightTrade[]): HourCellDTO[] {
  const m = new Map<string, HourCellDTO>();
  for (const t of T) {
    const h = hourOf(t.open), k = `${t.symbol}|${t.side}|${h}`;
    const c = m.get(k) ?? m.set(k, { symbol: t.symbol, side: t.side, hour: h, n: 0, wins: 0, net: 0 }).get(k)!;
    c.n++; if (t.net > 0) c.wins++; c.net = round(c.net + t.net);
  }
  return [...m.values()];
}

function kpis(T: InsightTrade[], all: InsightTrade[], start: number, ops: BalanceOp[], c: Curve): DashKpis {
  const a = agg(T);
  const wins = T.filter(t => t.net > 0), losses = T.filter(t => t.net < 0);
  const gp = sum(wins, t => t.net), gl = -sum(losses, t => t.net);
  // Account balance and its peak: whole history, not the view, with every
  // deposit and withdrawal at its own time.
  let bal = 0, peak = -Infinity, k = 0;
  for (const t of [...all].sort((x, y) => x.close - y.close)) {
    while (k < ops.length && ops[k]!.t <= t.close) { bal += ops[k++]!.amount; peak = Math.max(peak, bal); }
    bal += t.net; peak = Math.max(peak, bal);
  }
  while (k < ops.length) { bal += ops[k++]!.amount; peak = Math.max(peak, bal); }
  if (peak === -Infinity) peak = bal;
  const byDay = new Map<string, number>();
  for (const t of T) byDay.set(dayKey(t.close), (byDay.get(dayKey(t.close)) ?? 0) + t.net);
  const last = [...byDay].sort((x, y) => (x[0] < y[0] ? -1 : 1)).slice(-30);
  const roll: number[] = [];
  for (let i = 19; i < T.length; i++) roll.push(round(T.slice(i - 19, i + 1).filter(t => t.net > 0).length / 20, 3));
  const rs = T.filter(t => t.r != null);
  return {
    netPnl: a.net, startBalance: round(start), returnPct: c.basis === 'balance' && start > 0 ? round(a.net / start, 4) : null,
    balance: round(bal), peakBalance: round(peak),
    last30: { net: round(sum(last, d => d[1])), days: last.length, green: last.filter(d => d[1] > 0).length },
    winRate: a.n ? round(a.wins / a.n, 4) : 0,
    rollingWinRate: sample(roll, 40),
    profitFactor: gl > 0 ? round(gp / gl) : null, grossProfit: round(gp), grossLoss: round(gl),
    expectancy: a.n ? round(a.net / a.n) : 0,
    expectancyR: useR(T) ? round(sum(rs, t => t.r!) / rs.length) : null,
    avgWin: wins.length ? round(gp / wins.length) : 0, avgLoss: losses.length ? round(-gl / losses.length) : 0,
    maxDrawdown: c.dd ? { pct: c.dd.pct, amount: c.dd.amount, at: new Date(c.dd.troughT).toISOString() } : null,
    equitySpark: sample([c.start, ...c.pts.map(p => p.v)], 40),
  };
}

// ─── the one call ────────────────────────────────────────────────────────────

export function computeDashboard(allTrades: InsightTrade[], o: ComputeOptions): DashboardV2DTO {
  const all = [...allTrades].sort((a, b) => a.close - b.close);
  const ctx = tradeContext(all, o.rules ? { rules: o.rules, startingBalance: o.startingBalance, balanceOps: o.balanceOps } : null);
  const win = inWindow(all, o.window);
  const T = applyFilters(win, o.filters);
  const ops = opsOrStart(o.balanceOps, o.startingBalance);
  // Balance carried into the view: cash in before it plus every trade closed
  // before it. "All time" starts on the first trade, so the first deposit is
  // the start rather than a jump.
  const anchor = o.window.from ?? (T[0]?.close ?? 0);
  const startBal = fundedBefore(ops, anchor) + sum(all.filter(t => o.window.from != null && t.close < o.window.from), t => t.net);

  const symCount = new Map<string, number>();
  for (const t of win) symCount.set(t.symbol, (symCount.get(t.symbol) ?? 0) + 1);
  const options = {
    symbols: [...symCount].sort((a, b) => b[1] - a[1]).map(([symbol, trades]) => ({ symbol, trades })),
    tags: [...new Set(win.flatMap(t => t.tags))].sort(),
  };
  const base: DashboardV2DTO = {
    asOf: new Date(o.now).toISOString(), window: o.window, options,
    counts: { trades: T.length, inWindow: win.length, allClosed: all.length, withR: T.filter(t => t.r != null).length, withMae: T.filter(t => t.mae != null && t.mfe != null).length },
    minTrades: MIN_TRADES,
    kpis: null, equity: null, leaks: { rows: [], ai: null }, heatmap: null, maeMfe: null, distribution: null, rolling: null,
    behaviour: null, plan: [], symbols: [], recent: [], hours: [],
    ai: { equity: null, heatmap: null, maeMfe: null, distribution: null, rolling: null, behaviour: null, plan: null, symbols: null },
  };
  if (!T.length) return base;

  const c = curve(T, startBal, ops, anchor, o.window.to ?? o.now);
  const leakRows = findLeaks(T, ctx);
  const top = leakRows[0];
  // c.pts[i] is T[i]; a trailing cash-flow point (if any) has no trade.
  if (top) { const ids = new Set(top.ids); T.forEach((t, i) => { if (ids.has(t.id)) c.pts[i]!.leak = 1; }); }
  T.forEach((t, i) => { if (t.stopMove === 'widened') c.pts[i]!.moved = 1; });
  const leakDays = new Set(top ? T.filter(t => top.ids.includes(t.id)).map(t => dayKey(t.close)) : []);
  const days = dailyPoints(c.pts).map(p => (leakDays.has(dayKey(p.t)) ? { ...p, leak: 1 as const } : p));
  const hm = heatmap(T);
  const mm = maeMfe(T);
  const dist = distribution(T);
  const roll = rolling(T);
  const beh = behaviour(T, ctx);
  const rules = plan(T, ctx, leakRows);
  const syms = symbols(T);

  // Top leak plus whichever other leak adds the most on top of it (same rule as Analytics' what-if).
  let fix = leakRows.length ? skipGain(T, [leakRows[0]!]) : null;
  let fixPartner = 0;
  for (let i = 1; i < leakRows.length; i++) {
    const both = skipGain(T, [leakRows[0]!, leakRows[i]!]);
    if (fix && both.gain > fix.gain + 1e-9) { fix = both; fixPartner = i; }
  }
  const worstCell = hm.worst ? hm.cells.find(x => x.session === hm.worst!.session && x.day === hm.worst!.day)! : null;
  const worstSym = [...syms].filter(s => s.net < 0 && s.trades >= 3).sort((a, b) => a.net - b.net)[0];

  return {
    ...base,
    kpis: kpis(T, all, startBal, ops, c),
    equity: { start: round(c.start), basis: c.basis, trades: sampleCurve(c.pts, 2000), days, drawdown: c.dd, dotLabel: top?.label ?? null },
    leaks: {
      rows: leakRows.map(({ ids: _ids, ...l }) => l),
      ai: fix && fix.gain > 0 ? line(fixPartner ? `Skip #1 + #${fixPartner + 1}:` : 'Skip #1:', fix.gain, 'money', fix.trades, 'up') : null,
    },
    heatmap: hm, maeMfe: mm, distribution: dist, rolling: roll, behaviour: beh, plan: rules, symbols: syms,
    recent: recent(T, ctx, 6, all), hours: hours(T),
    ai: {
      equity: top ? line(`${top.label}:`, top.net, 'money', top.trades, 'dn', `on ${top.trades} trades`) : null,
      heatmap: worstCell ? line(`${SESSION_LABEL[worstCell.session]} ${DAY_SHORT[worstCell.day]}: ${worstCell.wins}/${worstCell.n} won ·`, worstCell.net, 'money', worstCell.n) : null,
      maeMfe: mm?.gaveBack ? line(`${plural(mm.gaveBack.trades, 'loser')} ${mm.gaveBack.trades === 1 ? 'was' : 'were'} green first:`, mm.gaveBack.net, 'money', mm.gaveBack.trades) : null,
      distribution: dist?.tail
        ? dist.unit === 'R'
          ? line('Keep the −1R stop:', dist.tail.excess, 'money', dist.tail.trades, 'up')
          : line('Cap losses at 1.5× avg:', dist.tail.excess, 'money', dist.tail.trades, 'up')
        : null,
      rolling: roll ? line('Edge now', roll.now, roll.unit === 'R' ? 'r' : 'money', roll.window, undefined, roll.unit === '$' ? '/trade' : undefined) : null,
      behaviour: beh ? line('Last 30 trades:', beh.last30, 'int', Math.min(30, T.length), beh.last30 < beh.score ? 'dn' : beh.last30 > beh.score ? 'up' : 'flat') : null,
      plan: rules.length ? line('From', T.length, 'int', T.length, 'flat', 'trades') : null,
      symbols: worstSym ? line(`Drop ${worstSym.symbol}:`, -worstSym.net, 'money', worstSym.trades, 'up') : null,
    },
  };
}

export const RANGE_DAYS = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365, ALL: null } as const;
export function windowFor(range: keyof typeof RANGE_DAYS, from: number | undefined, to: number | undefined, now: number) {
  if (from != null || to != null) return { from: from ?? null, to: to ?? null };
  const d = RANGE_DAYS[range];
  return { from: d == null ? null : now - d * DAY, to: null };
}
export { HOUR, DAY };
