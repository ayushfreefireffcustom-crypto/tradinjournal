// Trade log v2: pure functions over an account's positions. The service loads
// the trades + journal and calls these; tests and Playwright mocks call them
// directly. Reuses the dashboard's helpers (sessions, trade context, process
// grade) from compute.ts without changing them.
//
//   • Grades and rule flags: the dashboard's process grade (compute.grade) with
//     the WHOLE account's closed history as the baseline, so filtering never
//     changes a trade's grade. Needs ≥ MIN_TRADES closed trades.
//   • Days: the viewer's calendar day (IANA tz) of the close.
//   • Stop / target prices only come from the closing deal's MT5 comment
//     ("[sl 1.0812]", "[tp 1.0845]"), i.e. when one was actually hit.
import type {
  AiLine, ProcessGrade, TlDay, TlExitReason, TlFlag, TlPath, TlReason, TlRow, TlRuleKey, TlSimilar,
  TlStripDay, TlSummary, TradelogDTO, TradelogQuery, TradelogTradeDTO,
} from '@tradinjournal/contracts';
import {
  agg, baseline, fmtMoney, grade as processGrade, hourOf, median, MIN_TRADES, OVERSIZE, R_TAIL, sample, sessionOf,
  tradeContext, windowFor, type Agg, type InsightTrade, type TradeContext,
} from './compute.js';
import { flagsFor, preEntryFlags, similarTrades as reviewSimilar } from './trade-review.js';
import { isUserRuleReason, USER_RULE_PREFIX, type UserRules } from './rules.js';
import { fundedBefore, opsOrStart, type BalanceOp } from './funding.js';

/** One position as the service hands it over (closed or still open). */
export interface TlTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  open: number;
  close: number | null;
  volume: number;
  entry: number;
  exit: number | null;
  net: number;
  gross: number;
  commission: number;
  swap: number;
  r: number | null;
  holdSecs: number | null;
  /** Comment on the deal that closed it (exit reason, hit SL/TP price). */
  closeComment: string | null;
  /** From recorded stop levels (trade-data); absent = unknown. */
  stopMove?: 'widened' | 'tightened' | null;
}

export interface TlJournal { id: string; body: string; emotion: string | null; tags: string[] }

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const GRADES: ProcessGrade[] = ['A', 'B', 'C', 'D', 'F'];

// ─── exit reason + hit price from the MT5 comment ────────────────────────────

export function exitInfo(comment: string | null | undefined): { reason: TlExitReason; sl: number | null; tp: number | null } {
  const c = (comment ?? '').trim();
  const price = (m: RegExpMatchArray | null) => {
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  if (/^\[?\s*tp\b/i.test(c)) return { reason: 'tp', sl: null, tp: price(c.match(/^\[?\s*tp\s+([\d.]+)/i)) };
  if (/^\[?\s*sl\b/i.test(c)) return { reason: 'sl', sl: price(c.match(/^\[?\s*sl\s+([\d.]+)/i)), tp: null };
  if (/^so\s*:|stop[\s-]?out/i.test(c)) return { reason: 'stopout', sl: null, tp: null };
  return { reason: 'other', sl: null, tp: null };
}

// ─── days in the viewer's time zone ──────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function safeTz(tz: string | undefined | null): string {
  if (!tz) return 'UTC';
  if (fmtCache.has(tz)) return tz;
  try {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
    return tz;
  } catch { return 'UTC'; }
}
/** "YYYY-MM-DD" of `ms` in `tz` (must have passed safeTz). */
export function localDay(ms: number, tz: string): string {
  if (tz === 'UTC') return new Date(ms).toISOString().slice(0, 10);
  if (!fmtCache.has(tz)) safeTz(tz);
  const f = fmtCache.get(tz);
  return f ? f.format(ms) : new Date(ms).toISOString().slice(0, 10);
}

// ─── grades + flags (account-wide baseline) ──────────────────────────────────

const REASON_KEY: Record<string, TlRuleKey> = {
  'After 2 losses': 'after-losses',
  'Within 15 min of a loss': 'revenge',
  Oversized: 'oversized',
  'Losing hour': 'losing-hour',
  'Past −1.25R': 'r-tail',
};
export const RULE_SHORT: Record<TlRuleKey, string> = {
  'after-losses': 'After 2L', revenge: '≤15m after loss', oversized: 'Oversized', 'losing-hour': 'Losing hour', 'r-tail': 'Past −1.25R', 'user-rule': 'Your rule',
};
/** How each rule reads after "a trade …" (strip AI line). */
export const RULE_PHRASE: Record<TlRuleKey, string> = {
  'after-losses': 'after 2 losses', revenge: 'within 15 min of a loss', oversized: 'over 1.5× your usual size', 'losing-hour': 'in a losing hour', 'r-tail': 'past −1.25R', 'user-rule': 'breaking one of your rules',
};
export const RULE_NAME: Record<TlRuleKey, string> = {
  'after-losses': 'After 2 losses', revenge: 'Within 15 min of a loss', oversized: 'Oversized', 'losing-hour': 'Losing hour', 'r-tail': 'Past −1.25R', 'user-rule': 'Your rules',
};

export interface Graded { grade: ProcessGrade; flags: TlFlag[] }

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Process grade and rule flags per closed trade; null when there are too few trades. */
export function gradeAll(closed: TlTrade[], user?: UserRules | null): Map<string, Graded> | null {
  const T: InsightTrade[] = closed.filter(t => t.close != null).map(toInsight);
  if (T.length < MIN_TRADES) return null;
  const ctx = tradeContext(T, user);
  const hourNet = new Map<number, Agg>();
  const byHour = new Map<number, InsightTrade[]>();
  for (const t of T) (byHour.get(hourOf(t.open)) ?? byHour.set(hourOf(t.open), []).get(hourOf(t.open))!).push(t);
  for (const [h, ts] of byHour) hourNet.set(h, agg(ts));
  const base = { hourNet };
  // Median volume per symbol (same rule as tradeContext's "oversized").
  const vols = new Map<string, number[]>();
  for (const t of T) (vols.get(t.symbol) ?? vols.set(t.symbol, []).get(t.symbol)!).push(t.volume);
  const med = new Map([...vols].map(([s, v]) => { const x = [...v].sort((a, b) => a - b); const m = x.length >> 1; return [s, x.length % 2 ? x[m]! : (x[m - 1]! + x[m]!) / 2]; }));
  const lastLossClose = lossCloses(T);
  const out = new Map<string, Graded>();
  for (const t of T) {
    const c: TradeContext | undefined = ctx.get(t.id);
    const g = processGrade(t, c, base);
    const own = [...(c?.userRules ?? [])];
    const flags: TlFlag[] = g.reasons.map(r => {
      if (isUserRuleReason(r)) { const h = own.shift(); return { key: 'user-rule', short: RULE_SHORT['user-rule'], label: h ? h.label : r.slice(USER_RULE_PREFIX.length) }; }
      const key = REASON_KEY[r] ?? 'losing-hour';
      return { key, short: RULE_SHORT[key], label: flagLabel(key, t, c, hourNet.get(hourOf(t.open)), med.get(t.symbol), lastLossClose) };
    });
    out.set(t.id, { grade: g.grade, flags });
  }
  return out;
}

function lossCloses(T: InsightTrade[]): number[] {
  return T.filter(t => t.net < 0).map(t => t.close).sort((a, b) => a - b);
}

function flagLabel(key: TlRuleKey, t: InsightTrade, c: TradeContext | undefined, hour: Agg | undefined, med: number | undefined, lossCloses: number[]): string {
  switch (key) {
    case 'after-losses': return `After ${c?.priorLosses ?? 2} losses`;
    case 'revenge': {
      // Most recent losing close at or before the open.
      let lo = 0, hi = lossCloses.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (lossCloses[m]! < t.open) lo = m + 1; else hi = m; }
      const prev = lo > 0 ? lossCloses[lo - 1]! : null;
      const mins = prev != null ? Math.max(1, Math.round((t.open - prev) / 60_000)) : null;
      return mins != null && mins <= 15 ? `${mins} min after a loss` : 'Right after a loss';
    }
    case 'oversized': return med && med > 0 ? `${(t.volume / med).toFixed(1)}× size` : `Over ${OVERSIZE}× size`;
    case 'losing-hour': return hour ? `${hh(hourOf(t.open))} UTC hour · ${fmtMoney(hour.net)}` : 'Losing hour';
    case 'r-tail': return t.r != null ? `${t.r.toFixed(1).replace('-', '−')}R loss` : `Past ${String(R_TAIL).replace('-', '−')}R`;
    case 'user-rule': return RULE_SHORT['user-rule'];
  }
}

export function toInsight(t: TlTrade): InsightTrade {
  return { id: t.id, symbol: t.symbol, side: t.side, open: t.open, close: t.close ?? t.open, volume: t.volume, net: t.net, r: t.r, mae: null, mfe: null, tags: [], stopMove: t.stopMove ?? null };
}

// ─── base (rows decorated once per account data version) ─────────────────────

export interface TlBase {
  rows: TlRow[];
  /** Lower-cased search text per row (symbol, ticket, tags, emotion, note). */
  hay: string[];
  journal: Map<string, TlJournal>;
  graded: boolean;
  allClosed: number;
  startingBalance: number;
  /** Deposits and withdrawals with their times; absent = startingBalance up front. */
  balanceOps?: BalanceOp[] | null;
  tz: string;
  /** The trader's own rules (rules.ts), for the side panel's reasons. */
  user?: UserRules | null;
}

/** Merge journal entries per trade: newest entry first, tags/emotion unioned. */
export function journalByTrade(entries: Array<{ id: string; tradeId: string | null; body: string; emotion: string | null; tags: string[]; entryDate?: Date | string }>): Map<string, TlJournal> {
  const out = new Map<string, TlJournal>();
  const sorted = [...entries].filter(e => e.tradeId).sort((a, b) => +new Date(b.entryDate ?? 0) - +new Date(a.entryDate ?? 0));
  for (const e of sorted) {
    const prev = out.get(e.tradeId!);
    if (!prev) { out.set(e.tradeId!, { id: e.id, body: e.body ?? '', emotion: e.emotion ?? null, tags: [...new Set(e.tags ?? [])] }); continue; }
    if (!prev.body.trim() && e.body?.trim()) { prev.body = e.body; prev.id = e.id; }
    if (!prev.emotion && e.emotion) prev.emotion = e.emotion;
    for (const g of e.tags ?? []) if (!prev.tags.includes(g)) prev.tags.push(g);
  }
  return out;
}

export function buildBase(trades: TlTrade[], journal: Map<string, TlJournal>, opts: { tz?: string | null; startingBalance: number; balanceOps?: BalanceOp[] | null; grades?: Map<string, Graded> | null; user?: UserRules | null }): TlBase {
  const tz = safeTz(opts.tz);
  const closed = trades.filter(t => t.status === 'CLOSED' && t.close != null);
  const grades = opts.grades !== undefined ? opts.grades : gradeAll(closed, opts.user);
  const rows: TlRow[] = [];
  const hay: string[] = [];
  for (const t of trades) {
    const isClosed = t.status === 'CLOSED' && t.close != null;
    const x = exitInfo(isClosed ? t.closeComment : null);
    const g = isClosed ? grades?.get(t.id) : undefined;
    const j = journal.get(t.id);
    rows.push({
      id: t.id, symbol: t.symbol, side: t.side, status: isClosed ? 'CLOSED' : 'OPEN',
      openTime: t.open, closeTime: isClosed ? t.close : null, day: isClosed ? localDay(t.close!, tz) : 'open',
      session: sessionOf(t.open), volume: t.volume, entry: t.entry, exit: isClosed ? t.exit : null,
      net: round(t.net), gross: round(t.gross), commission: round(t.commission), swap: round(t.swap),
      r: t.r == null ? null : round(t.r), holdSecs: t.holdSecs, exitReason: isClosed ? x.reason : null, sl: x.sl, tp: x.tp,
      grade: g?.grade ?? null, flags: g?.flags ?? [],
      tags: j?.tags ?? [], emotion: j?.emotion ?? null, noted: !!j?.body.trim(),
      ...(t.stopMove ? { moved: t.stopMove } : {}),
    });
    hay.push([t.symbol, t.id, ...(j?.tags ?? []), j?.emotion ?? '', j?.body ?? ''].join('\n').toLowerCase());
  }
  return { rows, hay, journal, graded: !!grades, allClosed: closed.length, startingBalance: opts.startingBalance, balanceOps: opts.balanceOps ?? null, tz, user: opts.user ?? null };
}

// ─── filters ─────────────────────────────────────────────────────────────────

type Filters = Pick<TradelogQuery, 'symbol' | 'side' | 'session' | 'result' | 'tag' | 'grade' | 'rule' | 'q'>;
export type BigLoss = TradelogDTO['bigLoss'];

const closedRow = (r: TlRow) => r.status === 'CLOSED';
export const useRFor = (closed: TlRow[]) => { const k = closed.filter(t => t.r != null).length; return k >= 10 && k >= closed.length / 2; };

/** What counts as a "big loser" in this window: past −1R when R is known, else past 1.5× the average loss. */
export function bigLossOf(closed: TlRow[]): BigLoss {
  if (useRFor(closed)) return { unit: 'R', threshold: -1 };
  const losses = closed.filter(t => t.net < 0);
  if (losses.length < 3) return null;
  return { unit: '$', threshold: round(-OVERSIZE * (-sum(losses, t => t.net) / losses.length)) };
}
export const isBigLoss = (r: TlRow, b: BigLoss) => !!b && closedRow(r) && (b.unit === 'R' ? r.r != null && r.r < -1 : r.net < b.threshold);

export function inWindowRows(rows: TlRow[], w: { from: number | null; to: number | null }, now: number): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (r.closeTime == null) { if (w.to == null || w.to >= now) out.push(i); return; }
    if ((w.from == null || r.closeTime >= w.from) && (w.to == null || r.closeTime <= w.to)) out.push(i);
  });
  return out;
}

export function matches(r: TlRow, hay: string, f: Filters, big: BigLoss): boolean {
  if (f.symbol && r.symbol !== f.symbol) return false;
  if (f.side && r.side !== f.side) return false;
  if (f.session && r.session !== f.session) return false;
  if (f.tag && !r.tags.includes(f.tag) && r.emotion !== f.tag) return false;
  if (f.result) {
    const c = closedRow(r);
    switch (f.result) {
      case 'win': if (!c || r.net <= 0) return false; break;
      case 'loss': if (!c || r.net > 0) return false; break;
      case 'tp': case 'sl': case 'stopout': if (r.exitReason !== f.result) return false; break;
      case 'manual': if (r.exitReason !== 'other') return false; break;
      case 'bigloss': if (!isBigLoss(r, big)) return false; break;
      case 'open': if (c) return false; break;
    }
  }
  if (f.grade) { if (!r.grade || !f.grade.split(',').includes(r.grade)) return false; }
  if (f.rule) {
    if (f.rule === 'any') { if (!r.flags.length) return false; }
    else if (f.rule === 'none') { if (!r.grade || r.flags.length) return false; }
    else if (!r.flags.some(x => x.key === f.rule)) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q && !hay.includes(q)) return false;
  }
  return true;
}

export function sortRows(rows: TlRow[], sort: TradelogQuery['sort'], dir: 'asc' | 'desc'): TlRow[] {
  const s = dir === 'asc' ? 1 : -1;
  const time = (r: TlRow) => r.closeTime ?? Number.MAX_SAFE_INTEGER;
  const tie = (a: TlRow, b: TlRow) => s * (time(a) - time(b)) || s * (a.openTime - b.openTime) || (a.id < b.id ? -s : a.id > b.id ? s : 0);
  const out = [...rows];
  switch (sort) {
    case 'time': return out.sort(tie);
    case 'net': return out.sort((a, b) => s * (a.net - b.net) || tie(a, b));
    case 'hold': return out.sort((a, b) => s * ((a.holdSecs ?? -1) - (b.holdSecs ?? -1)) || tie(a, b));
    case 'symbol': return out.sort((a, b) => s * a.symbol.localeCompare(b.symbol) || tie(a, b));
    case 'r': return out.sort((a, b) => (a.r == null ? (b.r == null ? tie(a, b) : 1) : b.r == null ? -1 : s * (a.r - b.r) || tie(a, b)));
  }
}

// ─── summary, days, strip ────────────────────────────────────────────────────

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarize(rows: TlRow[], graded: boolean): TlSummary | null {
  const C = rows.filter(closedRow);
  const open = rows.length - C.length;
  if (!C.length) return null;
  const W = C.filter(t => t.net > 0), L = C.filter(t => t.net <= 0);
  const gp = sum(W, t => t.net), gl = -sum(C.filter(t => t.net < 0), t => t.net);
  const net = sum(C, t => t.net);
  const R = useRFor(C);
  const rs = C.filter(t => t.r != null);
  const hold = (ts: TlRow[]) => { const v = avg(ts.filter(t => t.holdSecs != null).map(t => t.holdSecs!)); return v == null ? null : Math.round(v); };
  const broken = C.filter(t => t.flags.length);
  const mix = { A: 0, B: 0, C: 0, D: 0, F: 0 } as Record<ProcessGrade, number>;
  for (const t of C) if (t.grade) mix[t.grade]++;
  const commission = sum(C, t => t.commission), swap = sum(C, t => t.swap);
  return {
    trades: C.length, wins: W.length, losses: L.length, open,
    net: round(net), perTrade: round(net / C.length), winRate: round(W.length / C.length, 4),
    profitFactor: gl > 0 ? round(gp / gl) : null,
    avgR: R ? round(sum(rs, t => t.r!) / rs.length) : null,
    avgWinR: R ? (avg(rs.filter(t => t.net > 0).map(t => t.r!)) ?? null) : null,
    avgLossR: R ? (avg(rs.filter(t => t.net <= 0).map(t => t.r!)) ?? null) : null,
    avgWin: W.length ? round(gp / W.length) : 0,
    avgLoss: C.some(t => t.net < 0) ? round(-gl / C.filter(t => t.net < 0).length) : 0,
    avgHoldSecs: hold(C), avgHoldWinSecs: hold(W), avgHoldLossSecs: hold(L),
    ruleBroken: graded ? { n: broken.length, net: round(sum(broken, t => t.net)) } : null,
    fees: round(commission + swap), commission: round(commission), swap: round(swap),
    gradeMix: graded ? mix : null,
  };
}

function roundR(s: TlSummary): TlSummary {
  return { ...s, avgWinR: s.avgWinR == null ? null : round(s.avgWinR), avgLossR: s.avgLossR == null ? null : round(s.avgLossR) };
}

export function dayTotals(rows: TlRow[]): Map<string, TlDay> {
  const m = new Map<string, TlDay>();
  const byTime = rows.filter(closedRow).sort((a, b) => a.closeTime! - b.closeTime!);
  for (const r of byTime) {
    const d = m.get(r.day) ?? m.set(r.day, { day: r.day, n: 0, wins: 0, net: 0, ruleBroken: 0, results: [] }).get(r.day)!;
    d.n++; if (r.net > 0) d.wins++;
    d.net = round(d.net + r.net);
    if (r.flags.length) d.ruleBroken++;
    if (d.results.length < 12) d.results.push(r.net > 0 ? 'w' : 'l');
  }
  return m;
}

const BEHAVIOUR_RULES: TlRuleKey[] = ['after-losses', 'revenge', 'oversized', 'r-tail'];

/** Daily P&L for every day in the window, plus one AI line about the worst days. */
export function strip(windowRows: TlRow[], viewDays: Set<string>, graded: boolean): TradelogDTO['strip'] {
  const totals = dayTotals(windowRows);
  const days: TlStripDay[] = [...totals.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map(d => ({ day: d.day, net: d.net, n: d.n, inView: viewDays.has(d.day) }));
  let ai: TradelogDTO['strip']['ai'] = null;
  const red = days.filter(d => d.net < 0).sort((a, b) => a.net - b.net);
  const K = Math.min(8, red.length);
  if (graded && days.length >= 10 && K >= 4) {
    const worst = new Set(red.slice(0, K).map(d => d.day));
    const onWorst = windowRows.filter(r => closedRow(r) && worst.has(r.day));
    let best: { key: TlRuleKey; days: number } | null = null;
    for (const key of BEHAVIOUR_RULES) {
      const n = new Set(onWorst.filter(r => r.flags.some(f => f.key === key)).map(r => r.day)).size;
      if (!best || n > best.days) best = { key, days: n };
    }
    if (best && best.days >= Math.ceil(K / 2)) {
      ai = {
        text: `${best.days} of your ${K} worst days had a trade ${RULE_PHRASE[best.key]}`, value: null, fmt: 'text', tone: 'dn',
        trades: onWorst.length, rule: best.key,
      } satisfies AiLine & { rule: TlRuleKey };
    }
  }
  return { days, ai };
}

// ─── the list call ───────────────────────────────────────────────────────────

export function queryLog(base: TlBase, q: TradelogQuery, now: number): TradelogDTO {
  const win = windowFor(q.range, q.from, q.to, now);
  const wIdx = inWindowRows(base.rows, win, now);
  const wRows = wIdx.map(i => base.rows[i]!);
  const wClosed = wRows.filter(closedRow);
  const big = bigLossOf(wClosed);
  const f: Filters = { symbol: q.symbol, side: q.side, session: q.session, result: q.result, tag: q.tag, grade: q.grade, rule: q.rule, q: q.q };
  const matched: TlRow[] = [];
  for (const i of wIdx) { const r = base.rows[i]!; if (matches(r, base.hay[i]!, f, big)) matched.push(r); }
  const sorted = sortRows(matched, q.sort, q.dir);
  const page = sorted.slice(q.offset, q.offset + q.limit);
  const totals = dayTotals(matched);
  const pageDays = [...new Set(page.map(r => r.day))].filter(d => totals.has(d)).map(d => totals.get(d)!);

  const symCount = new Map<string, number>();
  for (const r of wRows) symCount.set(r.symbol, (symCount.get(r.symbol) ?? 0) + 1);
  const tags = new Set<string>();
  for (const r of wRows) { for (const t of r.tags) tags.add(t); if (r.emotion) tags.add(r.emotion); }
  const s = summarize(matched, base.graded);

  return {
    asOf: new Date(now).toISOString(), window: win, tz: base.tz,
    counts: { matching: matched.length, inWindow: wRows.length, allClosed: base.allClosed, all: base.rows.length, withR: wClosed.filter(t => t.r != null).length },
    minTrades: MIN_TRADES, graded: base.graded, useR: useRFor(wClosed), bigLoss: big,
    options: { symbols: [...symCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([symbol, trades]) => ({ symbol, trades })), tags: [...tags].sort((a, b) => a.localeCompare(b)) },
    views: {
      all: wRows.length,
      ruleBroken: base.graded ? wClosed.filter(r => r.flags.length).length : null,
      gradeDF: base.graded ? wClosed.filter(r => r.grade === 'D' || r.grade === 'F').length : null,
      bigLosers: big ? wClosed.filter(r => isBigLoss(r, big)).length : null,
    },
    summary: s ? roundR(s) : null,
    strip: strip(wRows, new Set(matched.map(r => r.day)), base.graded),
    rows: page, days: pageDays, offset: q.offset, limit: q.limit, hasMore: q.offset + page.length < sorted.length,
  };
}

/** Every matching row (CSV export). */
export function exportRows(base: TlBase, q: Omit<TradelogQuery, 'offset' | 'limit'>, now: number): TlRow[] {
  const win = windowFor(q.range, q.from, q.to, now);
  const wIdx = inWindowRows(base.rows, win, now);
  const big = bigLossOf(wIdx.map(i => base.rows[i]!).filter(closedRow));
  const out: TlRow[] = [];
  for (const i of wIdx) { const r = base.rows[i]!; if (matches(r, base.hay[i]!, q, big)) out.push(r); }
  return sortRows(out, q.sort, q.dir);
}

// ─── one trade (side panel / review) ─────────────────────────────────────────

const rowInsight = (r: TlRow): InsightTrade => ({ id: r.id, symbol: r.symbol, side: r.side, open: r.openTime, close: r.closeTime!, volume: r.volume, net: r.net, r: r.r, mae: null, mfe: null, tags: [] });

/**
 * Side panel for one trade. Reasons and similar trades come from the full
 * trade review's functions (insights/trade-review.ts) so the panel and
 * /trades/[id] always say the same thing.
 */
export function tradeDetail(base: TlBase, id: string): TradelogTradeDTO | null {
  const row = base.rows.find(r => r.id === id);
  if (!row) return null;
  const j = base.journal.get(id) ?? null;
  const closedRows = base.rows.filter(closedRow).sort((a, b) => a.closeTime! - b.closeTime!);
  let balanceBefore: number | null = null;
  let reasons: TlReason[] = [];
  let similar: TlSimilar | null = null;
  if (row.status === 'CLOSED') {
    // Cash in before this trade closed, plus every trade closed before it.
    balanceBefore = round(fundedBefore(opsOrStart(base.balanceOps, base.startingBalance), row.closeTime!) + sum(closedRows.filter(r => r.closeTime! < row.closeTime!), r => r.net));
    const closed = closedRows.map(rowInsight);
    const me = closed.find(t => t.id === id)!;
    const ctx = tradeContext(closed, base.user);
    const b = base.graded ? baseline(closed) : null;
    const vols = closed.filter(t => t.symbol === me.symbol).map(t => t.volume);
    const sizeMedian = vols.length >= 3 ? median(vols) : null;
    if (b) reasons = flagsFor(me, ctx.get(id), b, closed, sizeMedian).map(f => ({ key: (f.key === 'past-r' ? 'r-tail' : f.key) as TlRuleKey, label: f.label, detail: f.detail }));
    const s = reviewSimilar(me, b ? preEntryFlags(me, ctx.get(id), b) : [], closed, ctx, b);
    if (s) similar = { criteria: s.criteria, n: s.n, wins: s.wins, net: s.net, results: s.trades.map(t => t.net), ids: s.trades.map(t => t.positionId) };
  }
  return { row, graded: base.graded, reasons, similar, note: j ? { id: j.id, body: j.body, emotion: j.emotion, tags: j.tags } : null, balanceBefore };
}

// ─── price paths for the mini charts ─────────────────────────────────────────

export const PATH_TFS: Array<[string, number]> = [['1m', 60_000], ['5m', 300_000], ['15m', 900_000], ['30m', 1_800_000], ['1h', 3_600_000], ['4h', 14_400_000], ['1d', 86_400_000]];
export const MAX_PATH_POINTS = 48;

/** Finest timeframe that covers the trade in ≤ 90 bars. */
export function pathTf(openMs: number, closeMs: number): { tf: string; ms: number } {
  const span = Math.max(0, closeMs - openMs);
  const hit = PATH_TFS.find(([, ms]) => span / ms <= 90) ?? PATH_TFS[PATH_TFS.length - 1]!;
  return { tf: hit[0], ms: hit[1] };
}

/** What buildPath needs from a closed trade. */
export function pathInput(t: TlTrade): Pick<TlRow, 'id' | 'openTime' | 'closeTime' | 'entry' | 'exit' | 'sl' | 'tp'> {
  const x = exitInfo(t.closeComment);
  return { id: t.id, openTime: t.open, closeTime: t.close, entry: t.entry, exit: t.exit, sl: x.sl, tp: x.tp };
}

export interface PathCandle { openTime: number; high: number; low: number; close: number }

/**
 * Entry fill → closes of the bars inside the trade → exit fill. Null when the
 * candles don't cover the trade or don't look like the same instrument (a
 * broker CFD priced differently from the public feed), so no fake path is drawn.
 */
export function buildPath(row: Pick<TlRow, 'id' | 'openTime' | 'closeTime' | 'entry' | 'exit' | 'sl' | 'tp'>, candles: PathCandle[], tf: { tf: string; ms: number }): TlPath | null {
  if (row.closeTime == null || row.exit == null) return null;
  const bars = candles.filter(c => c.openTime + tf.ms > row.openTime && c.openTime <= row.closeTime!).sort((a, b) => a.openTime - b.openTime);
  if (!bars.length) return null;
  const lo = Math.min(...bars.map(b => b.low)), hi = Math.max(...bars.map(b => b.high));
  const tol = Math.max((hi - lo) * 0.5, Math.abs(row.entry) * 0.002);
  const off = (p: number) => p < lo - tol || p > hi + tol;
  if (off(row.entry) || off(row.exit)) return null;
  const inside = bars.filter(b => b.openTime >= row.openTime && b.openTime + tf.ms <= row.closeTime!).map(b => b.close);
  const mid = sample(inside, MAX_PATH_POINTS - 2);
  const points = [row.entry, ...mid, row.exit].map(v => round(v, 6));
  return {
    id: row.id, tf: tf.tf, points,
    lo: round(Math.min(lo, row.entry, row.exit), 6), hi: round(Math.max(hi, row.entry, row.exit), 6),
    entry: row.entry, exit: row.exit, sl: row.sl, tp: row.tp,
  };
}

export { GRADES };
