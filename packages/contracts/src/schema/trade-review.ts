// Trade review (single trade, "D · AI"): one call that returns the trade, its
// fills, its neighbours and everything about it that can be computed from the
// account's real trades — process grade and rule flags, size vs usual, the
// non-candle "what I would have done" rows, similar trades and the same
// symbol/side by hour. Candle-based parts (the chart, best/worst while open,
// after-exit, usual-hold exit) are computed on the client from market candles.
//
// Honesty rules: nothing here is sample data. A block that can't be computed
// is null (or empty) and the page hides it. MT5 history does not keep the stop
// or target you set, nor stop changes. The only levels we know: the stop from a
// stored R-multiple, and the level a position closed at when the broker's
// closing deal says so ("[sl 1.0812]" / "[tp 1.0900]"; that stop may have been
// moved, so it's labelled "stop at exit", never "stop set").
// Sessions and hours are by the UTC hour of the trade's open (same cut-offs as
// Dashboard v2): Asia 22:00–07:00, London 07:00–13:00, New York 13:00–22:00.
import { z } from 'zod';
import type { DashSession, ProcessGrade } from './dashboard-v2.js';

export const tradeReviewQuerySchema = z.object({
  accountId: z.string().min(1).max(64),
  positionId: z.string().min(1).max(64),
});
export type TradeReviewQuery = z.infer<typeof tradeReviewQuerySchema>;

export interface ReviewDealDTO {
  ticket: string;
  type: 'BUY' | 'SELL' | 'BALANCE';
  entry: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: string;
}

export interface ReviewTradeDTO {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  openTime: string;
  closeTime: string | null;
  entry: number;
  exit: number | null;
  volume: number;
  gross: number;
  commission: number;
  swap: number;
  net: number;
  durationSecs: number | null;
  deals: ReviewDealDTO[];
}

/** A neighbour in trade-log order (newest first). */
export interface ReviewNavDTO {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  net: number;
}

export type ReviewFlagKey = 'after-losses' | 'revenge' | 'oversized' | 'losing-hour' | 'past-r';

/** One deterministic rule flag (the same flags Dashboard v2 grades with). */
export interface ReviewFlagDTO {
  key: ReviewFlagKey;
  /** Chip text, 2–4 words: "After 3 losses", "1.6× size", "12 min after a loss". */
  label: string;
  /** One line of evidence: "Your 15:00 UTC trades: −$420 on 6". */
  detail: string;
}

export interface ReviewGradeDTO {
  grade: ProcessGrade;
  flags: ReviewFlagDTO[];
  /** The three behaviour checks; null when the check can't apply (no R for past −1.25R). */
  checks: { discipline: boolean; risk: boolean; timing: boolean };
  /** Closed trades the baseline (losing hours, usual size) comes from. */
  basis: number;
}

/** A "what I would have done" row that needs no candles. */
export interface WhatIfDTO {
  key: 'actual' | 'normal-size' | 'skip';
  label: string;
  /** Net P&L in that case. */
  net: number;
  /** net − actual net: positive = that would have been better. */
  delta: number;
  /** How it is computed, one short line. */
  note: string;
}

export interface SimilarTradeDTO { positionId: string; symbol: string; side: 'LONG' | 'SHORT'; openTime: string; net: number }
export interface SimilarDTO {
  /** What matched, e.g. ["NAS100", "Short", "NY session", "After 2 losses"]. */
  criteria: string[];
  n: number;
  wins: number;
  net: number;
  /** Up to 12 most recent matches, oldest first. */
  trades: SimilarTradeDTO[];
}

export interface SameSetupDTO {
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** Every closed trade on this symbol and side (other than this one), by UTC open hour (fractional). */
  points: Array<{ positionId: string; hour: number; net: number }>;
  /** This trade's UTC open hour (fractional). */
  hour: number;
  /** Trades opened in the same UTC hour vs all other hours. */
  inHour: { n: number; wins: number; net: number };
  other: { n: number; wins: number; net: number };
}

export interface TradeReviewDTO {
  asOf: string;
  trade: ReviewTradeDTO;
  nav: { newer: ReviewNavDTO | null; older: ReviewNavDTO | null };
  /** This trade's place among the trades opened that UTC day. */
  day: { index: number; count: number; net: number };
  session: DashSession;
  /** Deposits + closed P&L up to the open; null when unknown or not positive. */
  balanceAtOpen: number | null;
  /** Volume vs your median volume on this symbol (needs ≥ 3 closed trades on it). */
  size: { median: number | null; ratio: number | null; trades: number };
  /** Only from a stored R-multiple (needs the stop at entry). */
  risk: { r: number; amount: number } | null;
  /** Initial stop price, derived from the stored risk and the point value; null otherwise. */
  stop: number | null;
  /** How the position closed, from the closing deal's comment (null = manual or unknown). */
  exitReason: 'sl' | 'tp' | 'stopout' | null;
  /** The stop or target level the broker closed at ("[sl …]" / "[tp …]"); null otherwise. */
  exitLevel: number | null;
  /** Money per 1.0 price move per 1 lot: from this trade's own fills, else learned from your trades on the symbol. */
  pointValue: { value: number; source: 'trade' | 'symbol' } | null;
  /** Median hold of your closed trades on this symbol (≥ 5 trades). */
  holdMedianSec: number | null;
  grade: ReviewGradeDTO | null;
  minTrades: number;
  closedTrades: number;
  whatIf: WhatIfDTO[];
  similar: SimilarDTO | null;
  sameSetup: SameSetupDTO | null;
}
