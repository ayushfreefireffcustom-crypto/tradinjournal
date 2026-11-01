// Risk-adjusted returns for a trading account (QW.3–QW.5), from the realised
// equity curve. Each one stays null until there's enough history for it to
// mean something, so the page shows "—" instead of a number built on a week.
import type { EquityPoint } from './api';

/** Trading days in a year (FX and indices trade weekdays). */
export const TRADING_DAYS = 252;
/** Fewest daily returns a Sharpe or Sortino is shown for. */
export const MIN_RETURNS = 10;
/** Fewest calendar days a growth rate is annualised over: a good month compounds into a silly yearly rate. */
export const MIN_CAGR_DAYS = 90;

export interface RiskMetrics {
  sharpe: number | null;
  sortino: number | null;
  /** Compound annual growth, in percent. */
  cagrPct: number | null;
  /** Net profit divided by the largest fall from a peak, in money. */
  recoveryFactor: number | null;
  /** Days with at least one closed trade. */
  tradingDays: number;
}

/** Equity at the end of each UTC day that had a close, oldest first. */
export function dailyCloses(curve: EquityPoint[]): Array<{ day: string; equity: number }> {
  const byDay = new Map<string, number>();
  for (const p of curve) if (p.time && Number.isFinite(p.equity)) byDay.set(new Date(p.time).toISOString().slice(0, 10), p.equity);
  return [...byDay].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, equity]) => ({ day, equity }));
}

/** Day-on-day returns, the first against the starting balance. */
export function dailyReturns(start: number, closes: number[]): number[] {
  const out: number[] = [];
  let prev = start;
  for (const c of closes) {
    if (prev > 0) out.push(c / prev - 1);
    prev = c;
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Annualised Sharpe (risk-free rate 0). Null with too few returns or none of them different. */
export function sharpe(rets: number[]): number | null {
  if (rets.length < MIN_RETURNS) return null;
  const m = mean(rets);
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1));
  return sd > 1e-12 ? round2((m / sd) * Math.sqrt(TRADING_DAYS)) : null;
}

/** Annualised Sortino: like Sharpe, but only losing days count as risk. Null with no losing day. */
export function sortino(rets: number[]): number | null {
  if (rets.length < MIN_RETURNS) return null;
  const downside = Math.sqrt(rets.reduce((a, r) => a + Math.min(0, r) ** 2, 0) / rets.length);
  return downside > 1e-12 ? round2((mean(rets) / downside) * Math.sqrt(TRADING_DAYS)) : null;
}

/** Compound annual growth in percent between two dates. Null under MIN_CAGR_DAYS or without positive equity. */
export function cagrPct(start: number, end: number, fromIso: string, toIso: string): number | null {
  const days = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
  if (!(days >= MIN_CAGR_DAYS) || !(start > 0) || !(end > 0)) return null;
  return Math.round(((end / start) ** (365 / days) - 1) * 1000) / 10;
}

/** Biggest fall from a running peak, in money. */
export function maxDrawdownAbs(curve: EquityPoint[], start: number): number {
  let peak = start;
  let worst = 0;
  for (const p of curve) {
    if (!Number.isFinite(p.equity)) continue;
    peak = Math.max(peak, p.equity);
    worst = Math.max(worst, peak - p.equity);
  }
  return worst;
}

/** Net profit over the worst drawdown. Null when there was no drawdown to recover from. */
export function recoveryFactor(netPnl: number, ddAbs: number): number | null {
  return ddAbs > 1e-9 ? round2(netPnl / ddAbs) : null;
}

export function riskMetrics(curve: EquityPoint[], startingBalance: number, netPnl: number): RiskMetrics {
  const closes = dailyCloses(curve);
  const rets = dailyReturns(startingBalance, closes.map((c) => c.equity));
  const first = curve.find((p) => p.time)?.time;
  const last = closes.at(-1);
  return {
    sharpe: sharpe(rets),
    sortino: sortino(rets),
    cagrPct: first && last ? cagrPct(startingBalance, last.equity, first, `${last.day}T23:59:59Z`) : null,
    recoveryFactor: recoveryFactor(netPnl, maxDrawdownAbs(curve, startingBalance)),
    tradingDays: closes.length,
  };
}
