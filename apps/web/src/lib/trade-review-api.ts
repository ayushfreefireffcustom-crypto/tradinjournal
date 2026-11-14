// Trade review client (GET /api/insights/trade-review) and the pure candle maths
// behind the review chart: the window around the trade, best/worst while open,
// what price did after the exit, the candle-based "what I would have done"
// rows, and the facts handed to the coach for a draft note.
// Types mirror packages/contracts/src/schema/trade-review.ts — keep them in step.
// Mock mode is served by app/data/insights/trade-review (lib/mock-insights.ts).
import { useEffect, useState } from 'react';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { afterExit, heldFor, type AfterExit, type ChartTrade } from '@/components/charts/trade-math';
import type { PositionLevelsDTO } from '@/lib/trade-data-api';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

export class ReviewError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${PREFIX}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ReviewError(json?.error?.message ?? `Request failed: ${res.status}`, json?.error?.code, res.status);
  return json.data as T;
}

export const tradeReviewApi = {
  get: (accountId: string, positionId: string) =>
    call<TradeReviewDTO>(`/insights/trade-review?accountId=${encodeURIComponent(accountId)}&positionId=${encodeURIComponent(positionId)}`),
};

// ─── types (mirror of the contract) ─────────────────────────────────────────

export type ProcessGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ReviewSession = 'ASIA' | 'LONDON' | 'NY';
export interface ReviewDealDTO {
  ticket: string; type: 'BUY' | 'SELL' | 'BALANCE'; entry: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
  volume: number; price: number; profit: number; commission: number; swap: number; time: string;
}
export interface ReviewTradeDTO {
  positionId: string; symbol: string; side: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED';
  openTime: string; closeTime: string | null; entry: number; exit: number | null; volume: number;
  gross: number; commission: number; swap: number; net: number; durationSecs: number | null; deals: ReviewDealDTO[];
}
export interface ReviewNavDTO { positionId: string; symbol: string; side: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED'; net: number }
export type ReviewFlagKey = 'after-losses' | 'revenge' | 'oversized' | 'losing-hour' | 'past-r' | 'user-rule';
export interface ReviewFlagDTO { key: ReviewFlagKey; label: string; detail: string }
export interface ReviewGradeDTO { grade: ProcessGrade; flags: ReviewFlagDTO[]; checks: { discipline: boolean; risk: boolean; timing: boolean }; basis: number }
export interface WhatIfDTO { key: 'actual' | 'normal-size' | 'skip'; label: string; net: number; delta: number; note: string }
export interface SimilarTradeDTO { positionId: string; symbol: string; side: 'LONG' | 'SHORT'; openTime: string; net: number }
export interface SimilarDTO { criteria: string[]; n: number; wins: number; net: number; trades: SimilarTradeDTO[] }
export interface SameSetupDTO {
  symbol: string; side: 'LONG' | 'SHORT';
  points: Array<{ positionId: string; hour: number; net: number }>;
  hour: number;
  inHour: { n: number; wins: number; net: number };
  other: { n: number; wins: number; net: number };
}
export interface TradeReviewDTO {
  asOf: string;
  trade: ReviewTradeDTO;
  nav: { newer: ReviewNavDTO | null; older: ReviewNavDTO | null };
  day: { index: number; count: number; net: number };
  session: ReviewSession;
  balanceAtOpen: number | null;
  size: { median: number | null; ratio: number | null; trades: number };
  /** r is null while the position is open. */
  risk: { r: number | null; amount: number } | null;
  /** Stop at entry: a recorded level, else derived from a stored R. */
  stop: number | null;
  stopFrom?: 'level' | 'r' | null;
  /** Stop / target levels and the editor's state (trade-data). */
  levels?: PositionLevelsDTO;
  exitReason: 'sl' | 'tp' | 'stopout' | null;
  exitLevel: number | null;
  pointValue: { value: number; source: 'trade' | 'symbol' | 'spec' } | null;
  holdMedianSec: number | null;
  grade: ReviewGradeDTO | null;
  minTrades: number;
  closedTrades: number;
  whatIf: WhatIfDTO[];
  similar: SimilarDTO | null;
  sameSetup: SameSetupDTO | null;
}

// ─── the chart window ───────────────────────────────────────────────────────

export interface Bar { openTime: number; open: number; high: number; low: number; close: number }
export const REVIEW_TFS: Array<[MarketTimeframe, number]> = [['5m', 300e3], ['15m', 900e3], ['30m', 1800e3], ['1h', 3600e3], ['4h', 14400e3], ['1d', 86400e3]];
export interface ReviewWindow { from: number; to: number; tf: MarketTimeframe; tfMs: number }

/**
 * Candles around a trade: some context before the entry and, once closed, what
 * price did after the exit. 5-minute bars unless the window needs more than
 * `maxBars` of them, then the next timeframe up.
 */
export function reviewWindow(open: number, close: number | null, now: number, maxBars = 240): ReviewWindow {
  const end = close ?? now;
  const held = Math.max(end - open, 5 * 60e3);
  const pre = Math.max(held * 0.5, 75 * 60e3);
  const post = close == null ? 0 : Math.max(held * 0.6, 75 * 60e3);
  const from = open - pre;
  const to = Math.max(Math.min(now, end + post), end);
  const [tf, tfMs] = REVIEW_TFS.find(([, m]) => (to - from) / m <= maxBars) ?? REVIEW_TFS[REVIEW_TFS.length - 1]!;
  return { from: Math.floor(from / tfMs) * tfMs, to, tf, tfMs };
}

export type BarsState = { status: 'loading' } | { status: 'none' } | { status: 'ready'; bars: Bar[]; win: ReviewWindow };

/** Market candles for a trade's window (broker symbols route through the account). `none` = no provider covers it. */
export function useReviewBars(t: { symbol: string; openTime: string; closeTime: string | null; positionId: string } | null, accountId?: string): BarsState {
  const [state, setState] = useState<{ key: string; s: BarsState }>({ key: '', s: { status: 'loading' } });
  const key = t ? `${accountId ?? ''}:${t.positionId}:${t.symbol}:${t.closeTime ?? 'open'}` : '';
  useEffect(() => {
    if (!t) return;
    let alive = true;
    const win = reviewWindow(new Date(t.openTime).getTime(), t.closeTime ? new Date(t.closeTime).getTime() : null, Date.now());
    setState({ key, s: { status: 'loading' } });
    marketApi.candles({ symbol: t.symbol, tf: win.tf, from: Math.floor(win.from / 1000), to: Math.ceil(win.to / 1000), limit: 500, accountId })
      .then(r => {
        if (!alive) return;
        const bars = (r.candles as Candle[]).filter(c => c.openTime >= win.from - win.tfMs && c.openTime <= win.to).map(c => ({ openTime: c.openTime, open: c.open, high: c.high, low: c.low, close: c.close }));
        setState({ key, s: coversTrade(bars, new Date(t.openTime).getTime(), win.tfMs) ? { status: 'ready', bars, win } : { status: 'none' } });
      })
      .catch(() => { if (alive) setState({ key, s: { status: 'none' } }); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.s : { status: 'loading' };
}

/** At least a few bars, and one of them holds the entry (else the chart would mislead). */
export function coversTrade(bars: Bar[], open: number, tfMs: number): boolean {
  return bars.length >= 3 && bars.some(b => open >= b.openTime && open < b.openTime + tfMs);
}

/** Index of the bar that holds `time` (the last bar that opened at or before it). */
export function barAt(bars: Bar[], time: number): number {
  let k = -1;
  for (let i = 0; i < bars.length; i++) if (bars[i]!.openTime <= time) k = i; else break;
  return k;
}

// ─── while open and after the exit ──────────────────────────────────────────

export interface Excursion { best: number; worst: number; bestMove: number; worstMove: number; bestAt: number; worstAt: number; bestMoney: number | null; worstMoney: number | null }

/**
 * Best and worst price in the trade's favour while it was open, from the bars
 * that overlap it (bar precision: the entry and exit bars include prices just
 * before the entry / after the exit). Moves are ≥ 0 (best) and ≤ 0 (worst).
 */
export function excursion(t: { side: 'LONG' | 'SHORT'; entry: number; volume: number }, open: number, end: number, bars: Bar[], tfMs: number, pv: number | null): Excursion | null {
  const live = bars.filter(b => b.openTime + tfMs > open && b.openTime <= end);
  if (!live.length) return null;
  const long = t.side === 'LONG', dir = long ? 1 : -1;
  let bi = 0, wi = 0;
  live.forEach((b, i) => {
    if (long ? b.high > live[bi]!.high : b.low < live[bi]!.low) bi = i;
    if (long ? b.low < live[wi]!.low : b.high > live[wi]!.high) wi = i;
  });
  const best = long ? live[bi]!.high : live[bi]!.low;
  const worst = long ? live[wi]!.low : live[wi]!.high;
  const bestMove = Math.max(0, (best - t.entry) * dir);
  const worstMove = Math.min(0, (worst - t.entry) * dir);
  return {
    best, worst, bestMove, worstMove, bestAt: live[bi]!.openTime, worstAt: live[wi]!.openTime,
    bestMoney: pv ? bestMove * t.volume * pv : null, worstMoney: pv ? worstMove * t.volume * pv : null,
  };
}

/** What price did after the exit, until the end of the window (trade-math's replay maths). */
export function afterTheExit(t: ReviewTradeDTO, bars: Bar[], until: number, pv: number | null): AfterExit | null {
  if (t.status !== 'CLOSED' || t.exit == null || !t.closeTime) return null;
  const ct: ChartTrade = {
    id: t.positionId, source: 'mt5', symbol: t.symbol, side: t.side, status: 'CLOSED', openTime: new Date(t.openTime).getTime(),
    closeTime: new Date(t.closeTime).getTime(), entry: t.entry, exit: t.exit, volume: t.volume, netPnl: t.net, grossPnl: t.gross, stop: null, target: null, note: null,
  };
  return afterExit(ct, bars, until, pv);
}

// ─── what I would have done, from candles ───────────────────────────────────

export interface CandleWhatIf { key: 'usual-hold' | 'exit-1r' | 'be-after-1r'; label: string; net: number; delta: number; note: string }

/**
 * Rows that need the price path. Each one is only returned when it can be
 * computed honestly from the bars:
 *   • usual hold — exit at the close of the bar where your median hold on this
 *     symbol ended (needs ≥ 5 trades, a hold ≥ 30 % different, bars covering it);
 *     the price is the close of the bar that ended at that moment;
 *   • exit at +1R / stop to entry after +1R — need the stop at entry. A bar
 *     that touches both levels counts the stop first (the conservative read).
 * Costs (commission + swap) stay as they were.
 */
export function candleWhatIf(r: Pick<TradeReviewDTO, 'trade' | 'pointValue' | 'holdMedianSec' | 'stop'>, bars: Bar[], tfMs: number): CandleWhatIf[] {
  const t = r.trade;
  const pv = r.pointValue?.value ?? null;
  if (t.status !== 'CLOSED' || !t.closeTime || t.exit == null || !pv || !bars.length) return [];
  const open = new Date(t.openTime).getTime(), close = new Date(t.closeTime).getTime();
  const dir = t.side === 'LONG' ? 1 : -1;
  const costs = t.net - t.gross;
  const at = (price: number) => (price - t.entry) * dir * t.volume * pv + costs;
  const out: CandleWhatIf[] = [];
  const held = close - open;
  const med = r.holdMedianSec != null ? r.holdMedianSec * 1000 : null;
  if (med && med > 0 && Math.abs(held - med) / med >= 0.3) {
    // The close of the bar that ended at (or just before) that moment.
    const when = open + med;
    const last = bars[bars.length - 1]!;
    const i = barAt(bars, when - tfMs);
    if (i >= 0 && when <= last.openTime + tfMs && bars[i]!.openTime + tfMs > open) {
      const v = at(bars[i]!.close);
      out.push({ key: 'usual-hold', label: `Held ${heldFor(med)}`, net: round2(v), delta: round2(v - t.net), note: `Your usual hold on ${t.symbol}; exit at that bar's close` });
    }
  }
  if (r.stop != null && Math.abs(t.entry - r.stop) > 0) {
    const dist = Math.abs(t.entry - r.stop);
    const one = t.entry + dir * dist;
    const live = bars.filter(b => b.openTime + tfMs > open && b.openTime <= close);
    const hitStop = (b: Bar, lvl: number) => (dir > 0 ? b.low <= lvl : b.high >= lvl);
    const hitUp = (b: Bar, lvl: number) => (dir > 0 ? b.high >= lvl : b.low <= lvl);
    // Exit at +1R.
    let res1: number | null = null;
    for (const b of live) {
      if (hitStop(b, r.stop)) { res1 = at(r.stop); break; }
      if (hitUp(b, one)) { res1 = at(one); break; }
    }
    if (res1 != null && Math.abs(res1 - t.net) >= 0.01) out.push({ key: 'exit-1r', label: 'Exit at +1R', net: round2(res1), delta: round2(res1 - t.net), note: 'Take profit one risk-distance from entry; stop first when a bar hits both' });
    // Stop to entry once +1R traded.
    let res2: number | null = null, armed = false;
    for (const b of live) {
      if (hitStop(b, armed ? t.entry : r.stop)) { res2 = at(armed ? t.entry : r.stop); break; }
      if (!armed && hitUp(b, one)) armed = true;
    }
    if (res2 != null && Math.abs(res2 - t.net) >= 0.01) out.push({ key: 'be-after-1r', label: 'Break-even at +1R', net: round2(res2), delta: round2(res2 - t.net), note: 'Stop moved to entry from the bar after +1R traded' });
  }
  return out;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

// ─── draft note ─────────────────────────────────────────────────────────────

const MINUS = '−';
const usd = (v: number) => `${v < 0 ? MINUS : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Plain facts about the trade for the coach. Only computed values; no guesses. */
export function noteFacts(r: TradeReviewDTO, extra: { excursion?: Excursion | null; after?: AfterExit | null; price: (v: number) => string }): string {
  const t = r.trade;
  const open = new Date(t.openTime);
  const when = `${open.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} ${open.toISOString().slice(11, 16)} UTC`;
  const lines = [
    `${t.symbol} ${t.side === 'LONG' ? 'long' : 'short'}, opened ${when}, ${t.volume} lots${r.size.ratio && Math.abs(r.size.ratio - 1) >= 0.25 ? ` (${r.size.ratio.toFixed(1)}× my usual size)` : ''}, entry ${extra.price(t.entry)}.`,
    t.status === 'CLOSED' && t.exit != null
      ? `Closed at ${extra.price(t.exit)}${r.exitReason === 'sl' ? ' by the stop' : r.exitReason === 'tp' ? ' at the target' : r.exitReason === 'stopout' ? ' by a margin stop-out' : ''}, net ${usd(t.net)}${t.durationSecs != null ? `, held ${heldFor(t.durationSecs * 1000)}` : ''}.`
      : 'Still open.',
    `Trade ${r.day.index} of ${r.day.count} that day.`,
  ];
  if (r.grade) lines.push(r.grade.flags.length ? `Rules broken: ${r.grade.flags.map(f => f.label).join('; ')}. Process grade ${r.grade.grade}.` : `No rules broken. Process grade ${r.grade.grade}.`);
  if (extra.excursion?.bestMoney != null && t.status === 'CLOSED') lines.push(`Best point while open: ${usd(extra.excursion.bestMoney)} in my favour.`);
  if (extra.after?.leftMoney != null && extra.after.leftMoney > 0) lines.push(`After the exit price ran ${usd(extra.after.leftMoney)} further my way.`);
  if (r.similar && r.similar.n >= 3) lines.push(`Similar trades (${r.similar.criteria.join(', ')}): ${r.similar.n}, ${r.similar.wins} won, net ${usd(r.similar.net)}.`);
  return lines.join(' ');
}

export const draftPrompt = (facts: string) =>
  `Draft a journal note for this one trade, written as me, in at most 2 short sentences. Use only these facts; no advice, no headings, no lists, no markdown.\n\nFacts: ${facts}`;

/** First two sentences of a reply, plain text. */
export function twoSentences(text: string): string {
  const plain = text.replace(/[#*_`>]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  const parts = plain.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [plain];
  return parts.slice(0, 2).join('').trim();
}
