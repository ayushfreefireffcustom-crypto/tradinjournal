// Derivations for the v6 dashboard cards. Everything here is computed from the
// trader's own closed trades and journal — no invented numbers. Week maths uses
// the viewer's local time with Monday as the first day.
import type { JournalEntry, Trade } from './api';
import { fmtDuration, fmtPct as pct, fmtUsd as usd, fmtUsdCompact as usdCompact } from './format';

const DAY_MS = 86400000;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const closedOnly = (trades: Trade[]) => trades.filter(t => t.status === 'CLOSED' && t.closeTime);

/** Local midnight of the Monday that starts the week containing `d`. */
export function weekStart(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (s.getDay() + 6) % 7; // Mon = 0
  s.setDate(s.getDate() - dow);
  return s;
}

/** ISO-8601 week number. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

export interface WeekDay {
  letter: string;
  name: string;
  date: number;
  net: number;
  trades: number;
  isToday: boolean;
  isFuture: boolean;
  isWeekend: boolean;
}

export interface WeekSummary {
  start: Date;
  days: WeekDay[];
  net: number;
  trades: Trade[];
  greenDays: number;
  redDays: number;
  /** Month name of the week's Thursday (the ISO rule for which month a week "belongs" to). */
  month: string;
}

/** Closed trades for the Monday–Sunday week `offset` weeks from the one holding `now`. */
export function weekSummary(trades: Trade[], now = new Date(), offset = 0): WeekSummary {
  const start = weekStart(now);
  start.setDate(start.getDate() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const inWeek = closedOnly(trades).filter(t => {
    const c = new Date(t.closeTime!).getTime();
    return c >= start.getTime() && c < end.getTime();
  });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days: WeekDay[] = DAY_LETTERS.map((letter, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayTrades = inWeek.filter(t => {
      const c = new Date(t.closeTime!).getTime();
      return c >= d.getTime() && c < next.getTime();
    });
    return {
      letter,
      name: DAY_NAMES[i]!,
      date: d.getDate(),
      net: dayTrades.reduce((s, t) => s + t.netPnl, 0),
      trades: dayTrades.length,
      isToday: d.getTime() === today,
      isFuture: d.getTime() > today,
      isWeekend: i >= 5,
    };
  });
  const thursday = new Date(start);
  thursday.setDate(thursday.getDate() + 3);
  return {
    start,
    days,
    net: inWeek.reduce((s, t) => s + t.netPnl, 0),
    trades: inWeek,
    greenDays: days.filter(d => d.trades > 0 && d.net > 0).length,
    redDays: days.filter(d => d.trades > 0 && d.net < 0).length,
    month: thursday.toLocaleDateString('en-US', { month: 'long' }),
  };
}

export interface WeeklyReview {
  week: number;
  /** "This week" or "Last week". */
  which: 'this' | 'last';
  total: number;
  journaled: number;
  /** Most recent closed trade in the week without a journal note; null when all are done. */
  nextTradeId: string | null;
  /** One honest line about the week, from its own trades. */
  line: string;
}

/**
 * The "Up next" review: this week's trades and how many have a journal note.
 * Falls back to last week when nothing has closed yet this week.
 */
export function weeklyReview(trades: Trade[], journal: JournalEntry[], now = new Date()): WeeklyReview | null {
  let which: WeeklyReview['which'] = 'this';
  let wk = weekSummary(trades, now, 0);
  if (wk.trades.length === 0) {
    which = 'last';
    wk = weekSummary(trades, now, -1);
  }
  if (wk.trades.length === 0) return null;
  const noted = new Set(journal.filter(e => e.tradeId && e.body.trim()).map(e => e.tradeId!));
  const ordered = [...wk.trades].sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!));
  const pending = ordered.filter(t => !noted.has(t.positionId));
  const traded = wk.days.filter(d => d.trades > 0);
  const worst = [...traded].sort((a, b) => a.net - b.net)[0]!;
  const best = [...traded].sort((a, b) => b.net - a.net)[0]!;
  const when = which === 'this' ? 'this week' : 'last week';
  const line = traded.length < 2
    ? `${wk.trades.length} trade${wk.trades.length === 1 ? '' : 's'} on ${best.name}, ${fmtUsd(best.net, 0)}.`
    : worst.net < 0
      ? `${worst.name} cost you the most ${when}, ${fmtUsd(worst.net, 0)}.`
      : `${best.name} was your best day ${when}, ${fmtUsd(best.net, 0)}.`;
  return {
    week: isoWeek(wk.start),
    which,
    total: wk.trades.length,
    journaled: wk.trades.length - pending.length,
    nextTradeId: pending[0]?.positionId ?? null,
    line,
  };
}

export interface SymbolBar { symbol: string; trades: number; grossWin: number; grossLoss: number; net: number; winRate: number }

/** Top symbols by trade count with gross win, gross loss (positive number) and net. */
export function symbolBars(trades: Trade[], limit = 5): SymbolBar[] {
  const map = new Map<string, SymbolBar & { wins: number }>();
  for (const t of closedOnly(trades)) {
    const s = map.get(t.symbol) ?? { symbol: t.symbol, trades: 0, grossWin: 0, grossLoss: 0, net: 0, winRate: 0, wins: 0 };
    s.trades++;
    s.net += t.netPnl;
    if (t.netPnl > 0) { s.grossWin += t.netPnl; s.wins++; } else s.grossLoss += -t.netPnl;
    map.set(t.symbol, s);
  }
  return [...map.values()]
    .sort((a, b) => b.trades - a.trades || b.net - a.net)
    .slice(0, limit)
    .map(({ wins, ...s }) => ({ ...s, winRate: s.trades ? wins / s.trades : 0 }));
}

export interface HoldPoint { id: string; secs: number; pnl: number }
export interface HoldStudy {
  points: HoldPoint[];
  /** Average hold of winners divided by losers; null without both. */
  winnerToLoser: number | null;
  medianSecs: number | null;
  /** Win rate of trades held longer than the median. */
  longWinRate: number | null;
}

export function holdStudy(trades: Trade[]): HoldStudy {
  const pts = closedOnly(trades)
    .filter(t => t.durationSecs != null && t.durationSecs > 0)
    .map(t => ({ id: t.positionId, secs: t.durationSecs!, pnl: t.netPnl }));
  const avg = (a: HoldPoint[]) => (a.length ? a.reduce((s, p) => s + p.secs, 0) / a.length : null);
  const w = avg(pts.filter(p => p.pnl > 0));
  const l = avg(pts.filter(p => p.pnl <= 0));
  const sorted = pts.map(p => p.secs).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
  const long = median == null ? [] : pts.filter(p => p.secs > median);
  return {
    points: pts,
    winnerToLoser: w != null && l != null && l > 0 ? w / l : null,
    medianSecs: median,
    longWinRate: long.length ? long.filter(p => p.pnl > 0).length / long.length : null,
  };
}

export type SessionKey = 'Asia' | 'London' | 'New York';
/** Sessions by UTC entry hour: Asia 00–07, London 07–13, New York 13–21; 21–24 counts as Asia. */
export const SESSIONS: { key: SessionKey; from: number; to: number }[] = [
  { key: 'Asia', from: 0, to: 7 },
  { key: 'London', from: 7, to: 13 },
  { key: 'New York', from: 13, to: 21 },
];
export function sessionOf(utcHour: number): SessionKey {
  return SESSIONS.find(s => utcHour >= s.from && utcHour < s.to)?.key ?? 'Asia';
}

export interface SessionArc { id: string; from: number; to: number; pnl: number; session: SessionKey }
export interface SessionStudy {
  arcs: SessionArc[];
  stats: { key: SessionKey; trades: number; wins: number; net: number }[];
  best: { key: SessionKey; trades: number; wins: number; net: number } | null;
}

const utcHours = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

/** Entry→exit hour arcs (UTC) and per-session results by entry hour. */
export function sessionStudy(trades: Trade[]): SessionStudy {
  const closed = closedOnly(trades);
  const stats = SESSIONS.map(s => ({ key: s.key, trades: 0, wins: 0, net: 0 }));
  const arcs: SessionArc[] = [];
  for (const t of closed) {
    const from = utcHours(t.openTime);
    const session = sessionOf(Math.floor(from));
    const s = stats.find(x => x.key === session)!;
    s.trades++;
    s.net += t.netPnl;
    if (t.netPnl > 0) s.wins++;
    const to = utcHours(t.closeTime!);
    // Arcs only for trades that open and close inside one UTC day.
    const sameDay = new Date(t.openTime).toISOString().slice(0, 10) === new Date(t.closeTime!).toISOString().slice(0, 10);
    if (sameDay && to > from) arcs.push({ id: t.positionId, from, to, pnl: t.netPnl, session });
  }
  const traded = stats.filter(s => s.trades > 0);
  const best = traded.length ? [...traded].sort((a, b) => b.net - a.net)[0]! : null;
  return { arcs, stats, best };
}

// ─── formatting ────────────────────────────────────────────────────────────────


/** Signed money: "+$1,284", "−$118.20". */
export const fmtUsd = (v: number, digits = 2): string => usd(v, { digits, signed: true });

/** Compact money for axis labels: "$25k", "$1.2M". */
export const fmtUsdCompact = (v: number): string => usdCompact(v);

/** "48m", "2h 10m", "3d 4h". */
export const fmtHold = fmtDuration;

/** A 0–1 ratio as a percent: 0.512 → "51.2%". */
export const fmtPct = (v: number, digits = 1) => pct(v, { digits, ratio: true });
