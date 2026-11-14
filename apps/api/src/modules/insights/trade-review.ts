// Trade review: pure functions over one position and the account's history.
// Reuses the Dashboard v2 rules (compute.ts) so a trade's grade and flags mean
// the same thing on every page; nothing here changes how the dashboard works.
//
//   • Grade + flags: compute.ts `tradeContext`, `baseline`, `grade`, `checks`
//     with the whole closed history as the baseline (≥ MIN_TRADES trades).
//     Open positions get the pre-entry flags only (no result yet).
//   • What I would have done (no candles): your usual size on this symbol
//     (only when the trade was oversized; P&L scales with volume) and skipping
//     it (only when a rule was broken before entry).
//   • Similar trades: closed trades that match on symbol, side, session and
//     the same pre-entry flags, relaxed step by step until ≥ 3 match.
//   • Levels: the stop from a stored R-multiple only; the closing deal comment
//     ("[sl …]", "[tp …]", "so: …") tells how it closed and at what level.
import type { Deal, Trade } from '@tradinjournal/types';
import type { TradeExtra } from '../trade-data/enrich.js';
import type {
  ReviewDealDTO, ReviewFlagDTO, ReviewFlagKey, ReviewGradeDTO, ReviewNavDTO, ReviewTradeDTO, SameSetupDTO,
  SimilarDTO, TradeReviewDTO, WhatIfDTO, PositionLevelsDTO,
} from '@tradinjournal/contracts';
import {
  agg, badHour, baseline, checks, DAY, dayKey, fmtMoney, grade, hourOf, median, MIN_TRADES, OVERSIZE, R_TAIL,
  SESSION_LABEL, sessionOf, tradeContext, type Baseline, type InsightTrade, type TradeContext,
} from './compute.js';
import type { UserRules } from './rules.js';

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const ms = (s: string) => new Date(s).getTime();
const n = (s: string | number) => (typeof s === 'number' ? s : parseFloat(s) || 0);

export interface ReviewInput {
  now: number;
  /** Every position on the account (open and closed), as rebuilt from MT5 deals. */
  positions: Trade[];
  positionId: string;
  /** Stored R-multiple of this position (Trade table), if any. */
  storedR: number | null;
  /** Deposits and withdrawals (BALANCE deals): time (ms) and amount. */
  cash: Array<{ t: number; amount: number }>;
  /** The trader's own rules (rules.ts); absent = none. */
  user?: UserRules | null;
  /** Trade data per position (trade-data): R from the stop at entry, stop moves. */
  extras?: Map<string, Pick<TradeExtra, 'r' | 'risk' | 'stop' | 'move'>>;
  /** This position's stop / target levels for the editor. */
  levels?: PositionLevelsDTO;
  /** Value per point from trade-data (falls back to the contract spec). */
  pointValue?: TradeReviewDTO['pointValue'];
}

/** Closed positions as the dashboard sees them (R only for the one we know). */
export function toInsight(t: Trade, r: number | null = null): InsightTrade {
  return {
    id: t.positionId, symbol: t.symbol, side: t.direction, open: ms(t.openTime),
    close: t.closeTime ? ms(t.closeTime) : NaN, volume: t.volume, net: t.netPnl, r, mae: null, mfe: null, tags: [],
  };
}

// ─── navigation and the day ──────────────────────────────────────────────────

/** Neighbours in trade-log order (newest first; open positions on top): newer = ←, older = →. */
export function navFor(positions: Trade[], id: string): { newer: ReviewNavDTO | null; older: ReviewNavDTO | null } {
  const at = (t: Trade) => (t.closeTime ? ms(t.closeTime) : 8e15 + ms(t.openTime));
  const list = [...positions].sort((a, b) => at(b) - at(a));
  const i = list.findIndex(t => t.positionId === id);
  const dto = (t: Trade | undefined): ReviewNavDTO | null => (t ? { positionId: t.positionId, symbol: t.symbol, side: t.direction, status: t.status, net: round(t.netPnl) } : null);
  return { newer: i > 0 ? dto(list[i - 1]) : null, older: i >= 0 ? dto(list[i + 1]) : null };
}

/** "Trade 3 of 5 that day" (UTC day of the open) and that day's closed net. */
export function dayPlace(positions: Trade[], target: Trade): { index: number; count: number; net: number } {
  const k = dayKey(ms(target.openTime));
  const same = positions.filter(t => dayKey(ms(t.openTime)) === k).sort((a, b) => ms(a.openTime) - ms(b.openTime) || a.positionId.localeCompare(b.positionId));
  return {
    index: same.findIndex(t => t.positionId === target.positionId) + 1,
    count: same.length,
    net: round(same.filter(t => t.status === 'CLOSED').reduce((a, t) => a + t.netPnl, 0)),
  };
}

/** Deposits plus closed P&L up to `at`; null when there were no deposits or it isn't positive. */
export function balanceAt(cash: ReviewInput['cash'], closed: InsightTrade[], at: number): number | null {
  if (!cash.length) return null;
  const v = cash.filter(c => c.t <= at).reduce((a, c) => a + c.amount, 0) + closed.filter(t => t.close <= at).reduce((a, t) => a + t.net, 0);
  return v > 0 ? round(v) : null;
}

// ─── levels ──────────────────────────────────────────────────────────────────

/** How the position closed, from the last closing deal's broker comment. */
export function exitFromDeals(deals: Deal[]): { reason: 'sl' | 'tp' | 'stopout' | null; level: number | null } {
  const out = deals.filter(d => d.entry !== 'IN' && d.type !== 'BALANCE').sort((a, b) => ms(a.dealTime) - ms(b.dealTime)).at(-1);
  const c = out?.comment?.trim() ?? '';
  const m = /\[(sl|tp)\s+([0-9]+(?:\.[0-9]+)?)\]/i.exec(c);
  if (m) {
    const level = parseFloat(m[2]!);
    return { reason: m[1]!.toLowerCase() as 'sl' | 'tp', level: Number.isFinite(level) && level > 0 ? level : null };
  }
  if (/^so[:\s]/i.test(c)) return { reason: 'stopout', level: null };
  return { reason: null, level: null };
}

/** Money per 1.0 price move per lot from one closed trade's fills (gross ÷ move ÷ volume). */
export function tradePointValue(t: Trade): number | null {
  if (t.status !== 'CLOSED' || t.exitPrice == null || !(t.volume > 0)) return null;
  const move = (t.exitPrice - t.entryPrice) * (t.direction === 'LONG' ? 1 : -1);
  if (Math.abs(move) < Math.abs(t.entryPrice) * 1e-5 || Math.abs(t.grossPnl) < 0.01) return null;
  const v = t.grossPnl / (move * t.volume);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** This trade's own point value, else the median of your closed trades on the symbol when ≥ 2 agree within 25 %. */
export function pointValueFor(target: Trade, positions: Trade[]): TradeReviewDTO['pointValue'] {
  const own = tradePointValue(target);
  if (own != null) return { value: round(own, 6), source: 'trade' };
  const vals = positions.filter(t => t.symbol === target.symbol && t.positionId !== target.positionId).map(tradePointValue).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const m = median(vals);
  const agree = vals.filter(v => Math.abs(v - m) <= m * 0.25);
  return agree.length >= 2 ? { value: round(median(agree), 6), source: 'symbol' } : null;
}

/** Risk in money from a stored R (|net ÷ R|) and the stop price it implies. */
export function riskFromR(target: Trade, r: number | null, pv: number | null): { risk: TradeReviewDTO['risk']; stop: number | null } {
  if (r == null || !Number.isFinite(r) || Math.abs(r) < 1e-6 || target.status !== 'CLOSED' || Math.abs(target.netPnl) < 0.01) return { risk: null, stop: null };
  const amount = Math.abs(target.netPnl / r);
  const stop = pv && target.volume > 0 ? target.entryPrice + (target.direction === 'LONG' ? -1 : 1) * (amount / (target.volume * pv)) : null;
  return { risk: { r: round(r), amount: round(amount) }, stop: stop != null && stop > 0 ? stop : null };
}

// ─── grade and flags ─────────────────────────────────────────────────────────

const PRE_ENTRY: ReviewFlagKey[] = ['user-rule', 'after-losses', 'revenge', 'oversized', 'losing-hour'];
const FLAG_LABEL: Record<ReviewFlagKey, string> = {
  'user-rule': 'Your rule', 'after-losses': 'After 2 losses', revenge: 'Within 15 min of a loss', oversized: 'Oversized', 'losing-hour': 'Losing hour', 'past-r': 'Past −1.25R',
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Pre-entry flags of a trade (the dashboard's checks minus the result-based one). */
export function preEntryFlags(t: InsightTrade, c: TradeContext | undefined, b: Baseline): ReviewFlagKey[] {
  const out: ReviewFlagKey[] = c?.userRules?.length ? ['user-rule'] : [];
  if (c && c.priorLosses >= 2) out.push('after-losses');
  if (c?.revenge) out.push('revenge');
  if (c?.oversized) out.push('oversized');
  if (badHour(b, t)) out.push('losing-hour');
  return out;
}

/** Chips with the trade's own numbers, in the dashboard's reason order. */
export function flagsFor(t: InsightTrade, c: TradeContext | undefined, b: Baseline, closed: InsightTrade[], sizeMedian: number | null): ReviewFlagDTO[] {
  const out: ReviewFlagDTO[] = (c?.userRules ?? []).map(h => ({ key: 'user-rule' as const, label: `Your rule · ${h.label}`, detail: `${h.rule}: ${h.detail}` }));
  if (c && c.priorLosses >= 2) out.push({ key: 'after-losses', label: `After ${c.priorLosses} losses`, detail: `${c.priorLosses} losing trades in a row closed earlier that UTC day` });
  if (c?.revenge) {
    const prev = closed.filter(p => p.id !== t.id && p.close < t.open).sort((a, z) => z.close - a.close)[0];
    const min = prev ? Math.max(1, Math.round((t.open - prev.close) / 60_000)) : null;
    out.push({ key: 'revenge', label: min != null ? `${min} min after a loss` : 'Right after a loss', detail: prev ? `Opened ${min} min after a ${fmtMoney(prev.net)} ${prev.symbol} loss closed` : 'Opened within 15 min of a losing trade' });
  }
  if (c?.oversized && sizeMedian) {
    const ratio = t.volume / sizeMedian;
    out.push({ key: 'oversized', label: `${ratio.toFixed(1)}× size`, detail: `${t.volume} lots vs your usual ${round(sizeMedian, 2)} on ${t.symbol} (flag above ${OVERSIZE}×)` });
  }
  if (badHour(b, t)) {
    const a = b.hourNet.get(hourOf(t.open))!;
    out.push({ key: 'losing-hour', label: `Losing hour · ${hh(hourOf(t.open))}`, detail: `Your trades opened ${hh(hourOf(t.open))}–${hh((hourOf(t.open) + 1) % 24)} UTC: ${fmtMoney(a.net)} on ${a.n}` });
  }
  if (t.r != null && t.r < R_TAIL) out.push({ key: 'past-r', label: `${t.r.toFixed(1).replace('-', '−')}R loss`, detail: `Lost past your −1R stop (flag below ${String(R_TAIL).replace('-', '−')}R)` });
  return out;
}

// ─── what I would have done (no candles) ────────────────────────────────────

export function whatIfRows(target: Trade, flags: ReviewFlagDTO[], sizeMedian: number | null): WhatIfDTO[] {
  if (target.status !== 'CLOSED') return [];
  const net = target.netPnl;
  const rows: WhatIfDTO[] = [{ key: 'actual', label: 'You', net: round(net), delta: 0, note: 'What you took, fees and swap included' }];
  if (flags.some(f => f.key === 'oversized') && sizeMedian && target.volume > 0) {
    const v = net * (sizeMedian / target.volume);
    rows.push({ key: 'normal-size', label: 'Usual size', net: round(v), delta: round(v - net), note: `Same trade at your usual ${round(sizeMedian, 2)} lots (P&L scales with volume)` });
  }
  const pre = flags.find(f => PRE_ENTRY.includes(f.key));
  if (pre) rows.push({ key: 'skip', label: 'Skipped', net: 0, delta: round(-net), note: `A rule was broken before entry: ${pre.label.toLowerCase()}` });
  return rows;
}

// ─── similar trades and the same setup ──────────────────────────────────────

export function similarTrades(
  target: InsightTrade, flags: ReviewFlagKey[], closed: InsightTrade[], ctx: Map<string, TradeContext>, b: Baseline | null,
): SimilarDTO | null {
  const others = closed.filter(t => t.id !== target.id);
  if (!others.length) return null;
  const ses = sessionOf(target.open);
  const sideW = target.side === 'LONG' ? 'Longs' : 'Shorts';
  const flagsOf = new Map<string, ReviewFlagKey[]>();
  const fl = (t: InsightTrade) => flagsOf.get(t.id) ?? flagsOf.set(t.id, b ? preEntryFlags(t, ctx.get(t.id), b) : []).get(t.id)!;
  const hasAll = (t: InsightTrade) => flags.every(f => fl(t).includes(f));
  const sameMkt = (t: InsightTrade) => t.symbol === target.symbol && t.side === target.side;
  const fLabels = flags.map(f => FLAG_LABEL[f]);
  const tiers: Array<{ criteria: string[]; ok: (t: InsightTrade) => boolean; when: boolean }> = [
    { criteria: [target.symbol, sideW, `${SESSION_LABEL[ses]} session`, ...fLabels], ok: t => sameMkt(t) && sessionOf(t.open) === ses && hasAll(t), when: flags.length > 0 && !!b },
    { criteria: [target.symbol, sideW, `${SESSION_LABEL[ses]} session`], ok: t => sameMkt(t) && sessionOf(t.open) === ses, when: true },
    { criteria: ['Any symbol', ...fLabels], ok: hasAll, when: flags.length > 0 && !!b },
    { criteria: [target.symbol, sideW], ok: sameMkt, when: true },
  ];
  // First tier with at least 3 matches; else whatever the loosest (symbol + side) finds.
  let pick: { criteria: string[]; ts: InsightTrade[] } | null = null;
  for (const tier of tiers.filter(x => x.when)) {
    const ts = others.filter(tier.ok);
    if (ts.length >= 3) { pick = { criteria: tier.criteria, ts }; break; }
  }
  if (!pick) {
    const last = others.filter(sameMkt);
    if (!last.length) return null;
    pick = { criteria: [target.symbol, sideW], ts: last };
  }
  const a = agg(pick.ts);
  const recent = [...pick.ts].sort((x, y) => y.open - x.open).slice(0, 12).reverse();
  return {
    criteria: pick.criteria, n: a.n, wins: a.wins, net: a.net,
    trades: recent.map(t => ({ positionId: t.id, symbol: t.symbol, side: t.side, openTime: new Date(t.open).toISOString(), net: round(t.net) })),
  };
}

const hourFrac = (ms0: number) => { const d = new Date(ms0); return d.getUTCHours() + d.getUTCMinutes() / 60; };

export function sameSetup(target: InsightTrade, closed: InsightTrade[]): SameSetupDTO | null {
  const ts = closed.filter(t => t.id !== target.id && t.symbol === target.symbol && t.side === target.side);
  if (ts.length < 3) return null;
  const h = hourOf(target.open);
  return {
    symbol: target.symbol, side: target.side,
    points: ts.map(t => ({ positionId: t.id, hour: round(hourFrac(t.open), 3), net: round(t.net) })),
    hour: round(hourFrac(target.open), 3),
    inHour: agg(ts.filter(t => hourOf(t.open) === h)),
    other: agg(ts.filter(t => hourOf(t.open) !== h)),
  };
}

// ─── the one call ────────────────────────────────────────────────────────────

const dealDto = (d: Deal): ReviewDealDTO => ({
  ticket: d.dealTicket, type: d.type, entry: d.entry, volume: n(d.volume), price: n(d.price), profit: n(d.profit), commission: n(d.commission), swap: n(d.swap), time: d.dealTime,
});

export function tradeDto(t: Trade): ReviewTradeDTO {
  return {
    positionId: t.positionId, symbol: t.symbol, side: t.direction, status: t.status, openTime: t.openTime, closeTime: t.closeTime,
    entry: t.entryPrice, exit: t.exitPrice, volume: t.volume, gross: round(t.grossPnl), commission: round(t.commission), swap: round(t.swap), net: round(t.netPnl),
    durationSecs: t.durationSecs,
    deals: [...(t.deals ?? [])].sort((a, b) => ms(a.dealTime) - ms(b.dealTime)).map(dealDto),
  };
}

/** Null when the position isn't on the account. */
export function computeTradeReview(i: ReviewInput): TradeReviewDTO | null {
  const target = i.positions.find(t => t.positionId === i.positionId);
  if (!target) return null;
  const closedT = i.positions.filter(t => t.status === 'CLOSED' && t.closeTime);
  const isClosed = target.status === 'CLOSED' && !!target.closeTime;
  const rOf = (t: Trade) => i.extras?.get(t.positionId)?.r ?? (t.positionId === target.positionId ? i.storedR : null);
  const closed = closedT.map(t => ({ ...toInsight(t, rOf(t)), stopMove: i.extras?.get(t.positionId)?.move ?? null })).sort((a, b) => a.close - b.close);
  // An open position joins the context with a close in the future, so it never
  // counts as "closed before" anything and the usual-size median includes it
  // just as it would once closed.
  const me: InsightTrade = isClosed ? closed.find(t => t.id === target.positionId)! : { ...toInsight(target), close: Math.max(i.now, ms(target.openTime)) + DAY, r: null };
  const ctxAll = tradeContext(isClosed ? closed : [...closed, me], i.user);
  const ctx = ctxAll.get(me.id);

  const symVols = (isClosed ? closed : [...closed, me]).filter(t => t.symbol === target.symbol).map(t => t.volume);
  const sizeMedian = symVols.length >= 3 ? median(symVols) : null;
  const graded = closed.length >= MIN_TRADES;
  const b = graded ? baseline(closed) : null;

  let gradeDto: ReviewGradeDTO | null = null;
  let flags: ReviewFlagDTO[] = [];
  if (b) {
    flags = flagsFor(me, ctx, b, closed, sizeMedian);
    const g = grade(me, ctx, b);
    const c = checks(me, ctx, b);
    gradeDto = { grade: g.grade, flags, checks: c, basis: closed.length };
  }
  const pv = pointValueFor(target, i.positions) ?? i.pointValue ?? null;
  const x = i.extras?.get(target.positionId);
  let { risk, stop } = riskFromR(target, isClosed ? rOf(target) : null, pv?.value ?? null);
  let stopFrom: TradeReviewDTO['stopFrom'] = stop != null ? 'r' : null;
  // A recorded stop at entry beats the one implied by a stored R.
  if (x?.stop != null) {
    stop = x.stop; stopFrom = 'level';
    if (x.risk != null) risk = { r: isClosed && x.r != null ? round(x.r) : null, amount: x.risk };
  }
  const exit = isClosed ? exitFromDeals(target.deals ?? []) : { reason: null, level: null };
  const holds = closedT.filter(t => t.symbol === target.symbol && t.positionId !== target.positionId && t.durationSecs != null && t.durationSecs > 0).map(t => t.durationSecs!);
  // Similar trades use the dashboard's context over closed trades only (an open one isn't a match).
  const ctxClosed = isClosed ? ctxAll : tradeContext(closed, i.user);

  return {
    asOf: new Date(i.now).toISOString(),
    trade: tradeDto(target),
    nav: navFor(i.positions, target.positionId),
    day: dayPlace(i.positions, target),
    session: sessionOf(me.open),
    balanceAtOpen: balanceAt(i.cash, closed.filter(t => t.id !== me.id), me.open),
    size: { median: sizeMedian == null ? null : round(sizeMedian, 4), ratio: sizeMedian ? round(target.volume / sizeMedian, 3) : null, trades: symVols.length },
    risk, stop, stopFrom, levels: i.levels,
    exitReason: exit.reason, exitLevel: exit.level,
    pointValue: pv,
    holdMedianSec: holds.length >= 5 ? Math.round(median(holds)) : null,
    grade: gradeDto,
    minTrades: MIN_TRADES,
    closedTrades: closed.length,
    whatIf: whatIfRows(target, flags, sizeMedian),
    similar: similarTrades(me, flags.filter(f => PRE_ENTRY.includes(f.key)).map(f => f.key), closed, ctxClosed, b),
    sameSetup: sameSetup(me, closed),
  };
}
