// Fed cut / hold / hike odds per FOMC meeting from 30-day Fed funds futures —
// the CME FedWatch method, pure (no I/O).
//
// A ZQ contract settles on 100 − the month's average effective Fed funds rate
// (EFFR), so each contract's price gives the market's average rate for its
// month: A = 100 − price. A meeting changes the rate from the day after it
// ends (the "effective" day). In the effective month, with N days and d days
// still at the old rate:
//     A = (d/N)·start + ((N − d)/N)·end
// For each meeting, in order (CME's preference):
//   end   = the next month's average when no meeting takes effect in it;
//         = else the next meeting's start, solved back from its own month when
//           that next meeting has a meeting-free month after it (more stable
//           than the forward solve when the meeting is late in its month);
//         = else solved forward from start.
//   start = the previous meeting's end; for the first meeting, the previous
//           month's average when no meeting took effect in it, else the
//           latest EFFR given by the caller, else solved back from `end`.
// The expected change at a meeting, (end − start) / 25 bp, is split between
// the two nearest 25 bp outcomes: −0.6 → 60 % a 25 bp cut, 40 % hold;
// −1.3 → 100 % a cut (30 % of it 50 bp). Cumulative cuts priced by a meeting
// = (start of the first meeting − end of this one) / 25 bp.
//
// FOMC dates: Board of Governors of the Federal Reserve System, "Meeting
// calendars and information",
// https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
// (page last updated 12 Nov 2026). The second day of each two-day meeting is
// the decision day. Tentative until confirmed at the meeting before.

export const FOMC_DECISIONS: readonly string[] = [
  // 2026
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  // 2027
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-11-17',
  // 2028 (first meeting, listed on the 2027 calendar)
  '2028-01-26',
];

import { shiftMonth } from './overview.js';

const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'] as const;

/** `2026-12` → Yahoo's CBOT 30-day Fed funds future, `ZQZ26.CBT`. */
export function zqSymbol(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `ZQ${MONTH_CODES[m - 1]}${String(y % 100).padStart(2, '0')}.CBT`;
}

const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const addMonths = shiftMonth;

export interface FomcMeetingSlot {
  /** Decision day, YYYY-MM-DD. */
  decision: string;
  /** Month the new rate takes effect (the day after the decision), YYYY-MM. */
  month: string;
  /** Days of that month still at the old rate. */
  d: number;
  /** Days in that month. */
  n: number;
}

function slot(decision: string): FomcMeetingSlot {
  const eff = new Date(Date.parse(`${decision}T00:00:00Z`) + 86_400_000);
  const month = eff.toISOString().slice(0, 7);
  return { decision, month, d: eff.getUTCDate() - 1, n: daysIn(month) };
}

/** Upcoming meetings (decision day on/after `today`, YYYY-MM-DD), at most `max`. */
export function upcomingMeetings(today: string, max = 8, dates: readonly string[] = FOMC_DECISIONS): FomcMeetingSlot[] {
  return dates.filter((d) => d >= today).slice(0, max).map(slot);
}

/** Contract months needed for `meetings`: the month before the first through the month after the last. */
export function contractMonths(meetings: readonly FomcMeetingSlot[]): string[] {
  if (!meetings.length) return [];
  const first = addMonths(meetings[0]!.month, -1);
  const last = addMonths(meetings[meetings.length - 1]!.month, 1);
  const out: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface FedWatchMeeting {
  decision: string;
  /** Market-implied EFFR before and after the meeting, %. */
  start: number;
  end: number;
  /** Expected change at this meeting, bp (negative = cuts). */
  expectedBp: number;
  /** Probability (0..100) of a cut / no change / hike at this meeting. */
  cutPct: number;
  holdPct: number;
  hikePct: number;
  /** Of the cut (or hike) probability, the part priced as 50 bp or more (0..100). */
  bigMovePct: number;
  /** 25 bp cuts priced from now through this meeting (negative = hikes). */
  cumulativeCuts: number;
}

export interface FedWatchResult {
  /** Market-implied EFFR now (start of the first meeting), %. */
  impliedNow: number;
  meetings: FedWatchMeeting[];
}

const r2 = (x: number, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp + 0; // + 0 turns −0 into 0

/** Split an expected move (in 25 bp steps) into cut / hold / hike odds. */
export function moveOdds(steps: number): { cutPct: number; holdPct: number; hikePct: number; bigMovePct: number } {
  const a = Math.abs(steps);
  const one = Math.min(1, a);
  const big = a > 1 ? Math.min(1, a - 1) : 0;
  const pct = (x: number) => r2(x * 100, 1);
  if (steps < 0) return { cutPct: pct(one), holdPct: pct(1 - one), hikePct: 0, bigMovePct: pct(big) };
  return { cutPct: 0, holdPct: pct(1 - one), hikePct: pct(one), bigMovePct: pct(big) };
}

/**
 * Per-meeting odds from contract prices (month → price, e.g. `2026-12` → 95.925).
 * Meetings whose months aren't priced are dropped from the end (the chain needs
 * every earlier one). Returns null when the first meeting can't be priced.
 */
export function fedWatch(
  meetings: readonly FomcMeetingSlot[],
  prices: ReadonlyMap<string, number>,
  opts: { effr?: number | null; dates?: readonly string[] } = {},
): FedWatchResult | null {
  const avg = (m: string): number | null => {
    const p = prices.get(m);
    return p != null && Number.isFinite(p) && p > 50 && p <= 100 ? 100 - p : null;
  };
  // Every month a decision takes effect in, past ones included: a month holding
  // an earlier meeting's change is not a clean anchor either.
  const hasMeeting = new Set([...(opts.dates ?? FOMC_DECISIONS).map((d) => slot(d).month), ...meetings.map((m) => m.month)]);
  /** Average rate of a month no meeting takes effect in, or null. */
  const free = (m: string) => (hasMeeting.has(m) ? null : avg(m));
  /** Start rate of meeting j, solved back from its own month and a meeting-free month after it. */
  const backStart = (j: number): { v: number; w: number } | null => {
    const mt = meetings[j];
    if (!mt || mt.d === 0) return null;
    const a = avg(mt.month);
    const after = free(addMonths(mt.month, 1));
    if (a == null || after == null) return null;
    return { v: (a - ((mt.n - mt.d) / mt.n) * after) * (mt.n / mt.d), w: mt.d / mt.n };
  };

  const out: FedWatchMeeting[] = [];
  let start: number | null = null;
  let first: number | null = null;
  for (let i = 0; i < meetings.length; i++) {
    const mt = meetings[i]!;
    const a = avg(mt.month);
    if (a == null) break;
    if (i === 0) start = free(addMonths(mt.month, -1)) ?? (opts.effr != null && Number.isFinite(opts.effr) ? opts.effr : null);
    const fwdW = (mt.n - mt.d) / mt.n;
    const forward: number | null = start != null && fwdW > 0 ? (a - (mt.d / mt.n) * start) / fwdW : null;
    let end: number | null = mt.d === 0 ? a : free(addMonths(mt.month, 1));
    if (end == null) {
      const back = backStart(i + 1);
      if (back && (forward == null || back.w > fwdW)) end = back.v;
      else end = forward;
    }
    if (end == null) break;
    if (start == null) {
      // First meeting with no anchor before it: solve its start back from `end`.
      if (mt.d === 0) break;
      start = (a - fwdW * end) * (mt.n / mt.d);
    }
    if (first == null) first = start;
    const steps = (end - start) / 0.25;
    out.push({
      decision: mt.decision,
      start: r2(start, 4),
      end: r2(end, 4),
      expectedBp: r2((end - start) * 100, 1),
      ...moveOdds(steps),
      cumulativeCuts: r2((first - end) / 0.25, 2),
    });
    start = end;
  }
  if (!out.length || first == null) return null;
  return { impliedNow: r2(first, 4), meetings: out };
}
