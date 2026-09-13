// Deterministic strategy backtester for Trader Master strategy builder.
// Rules are typed — LLM only parses intent into this shape; never executes.
import type { TraderCandle as Candle } from '@tradinjournal/core';

export const STRATEGY_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export type StrategyTimeframe = (typeof STRATEGY_TIMEFRAMES)[number];

export type StrategyRuleKind =
  | 'ema_cross'
  | 'rsi_threshold'
  | 'price_vs_ema'
  | 'breakout'
  | 'macd_cross';

export interface StrategyRules {
  kind: StrategyRuleKind;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  /** Bound instrument the paper cron will run. Set by backtest / create. */
  symbol?: string;
  timeframe?: StrategyTimeframe;
  /** EMA fast/slow for ema_cross / price_vs_ema */
  fast?: number;
  slow?: number;
  /** RSI period + threshold */
  rsiPeriod?: number;
  rsiAbove?: number;
  rsiBelow?: number;
  /** Breakout lookback (prior bars). */
  lookback?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  /** Exit: ATR stop multiple + R-multiple target */
  stopAtr?: number;
  targetR?: number;
  horizonBars?: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnlPct: number;
  reason: 'target' | 'stop' | 'horizon';
}

export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  expectancyPct: number | null;
  maxDrawdownPct: number | null;
  samples: BacktestTrade[];
}

export const PROMOTE_MIN_TRADES = 30;
export const PROMOTE_MAX_DD_PCT = 30;

export interface PromoteGate {
  ok: boolean;
  reasons: string[];
}

export interface WalkForwardBacktest {
  symbol: string;
  timeframe: StrategyTimeframe;
  asOf: string;
  /** Headline stats are the holdout — in-sample luck is not the number we show. */
  trades: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  expectancyPct: number | null;
  maxDrawdownPct: number | null;
  samples: BacktestTrade[];
  inSample: BacktestResult;
  holdout: BacktestResult;
  promote: PromoteGate;
}

const KINDS: StrategyRuleKind[] = [
  'ema_cross',
  'rsi_threshold',
  'price_vs_ema',
  'breakout',
  'macd_cross',
];

function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (period < 1 || closes.length < period) return out;
  const k = 2 / (period + 1);
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / (loss || 1e-12));
  }
  return out;
}

function macdSeries(
  closes: number[],
  fast: number,
  slow: number,
  signal: number,
): { macd: (number | null)[]; signal: (number | null)[] } {
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const macd: (number | null)[] = closes.map((_, i) =>
    ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null,
  );
  const signalLine: (number | null)[] = Array(closes.length).fill(null);
  const compact: number[] = [];
  const idxs: number[] = [];
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] != null) {
      compact.push(macd[i]!);
      idxs.push(i);
    }
  }
  const sig = emaSeries(compact, signal);
  for (let k = 0; k < idxs.length; k++) signalLine[idxs[k]!] = sig[k] ?? null;
  return { macd, signal: signalLine };
}

function atrProxy(candles: Candle[], i: number, lookback = 14): number {
  const start = Math.max(1, i - lookback + 1);
  let sum = 0;
  let n = 0;
  for (let j = start; j <= i; j++) {
    const c = candles[j]!;
    const prev = candles[j - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
    n += 1;
  }
  return n > 0 ? sum / n : candles[i]!.close * 0.01;
}

function signalAt(
  rules: StrategyRules,
  i: number,
  candles: Candle[],
  closes: number[],
  fastEma: (number | null)[],
  slowEma: (number | null)[],
  rsi: (number | null)[],
  macd: (number | null)[],
  macdSig: (number | null)[],
): 'LONG' | 'SHORT' | null {
  if (rules.kind === 'ema_cross') {
    const f0 = fastEma[i - 1];
    const s0 = slowEma[i - 1];
    const f1 = fastEma[i];
    const s1 = slowEma[i];
    if (f0 == null || s0 == null || f1 == null || s1 == null) return null;
    if (f0 <= s0 && f1 > s1 && rules.direction !== 'SHORT') return 'LONG';
    if (f0 >= s0 && f1 < s1 && rules.direction !== 'LONG') return 'SHORT';
  }
  if (rules.kind === 'rsi_threshold') {
    const r = rsi[i];
    if (r == null) return null;
    if (rules.rsiBelow != null && r <= rules.rsiBelow && rules.direction !== 'SHORT') return 'LONG';
    if (rules.rsiAbove != null && r >= rules.rsiAbove && rules.direction !== 'LONG') return 'SHORT';
  }
  if (rules.kind === 'price_vs_ema') {
    const e = slowEma[i] ?? fastEma[i];
    if (e == null) return null;
    if (closes[i]! > e && rules.direction !== 'SHORT') return 'LONG';
    if (closes[i]! < e && rules.direction !== 'LONG') return 'SHORT';
  }
  if (rules.kind === 'breakout') {
    const n = Math.max(2, rules.lookback ?? 20);
    if (i < n) return null;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n; j < i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    if (closes[i]! > hh && rules.direction !== 'SHORT') return 'LONG';
    if (closes[i]! < ll && rules.direction !== 'LONG') return 'SHORT';
  }
  if (rules.kind === 'macd_cross') {
    const m0 = macd[i - 1];
    const s0 = macdSig[i - 1];
    const m1 = macd[i];
    const s1 = macdSig[i];
    if (m0 == null || s0 == null || m1 == null || s1 == null) return null;
    if (m0 <= s0 && m1 > s1 && rules.direction !== 'SHORT') return 'LONG';
    if (m0 >= s0 && m1 < s1 && rules.direction !== 'LONG') return 'SHORT';
  }
  return null;
}

function warmupBars(rules: StrategyRules): number {
  const slow = rules.slow ?? 50;
  const rsiP = rules.rsiPeriod ?? 14;
  const lookback = rules.lookback ?? 20;
  const macdSlow = rules.macdSlow ?? 26;
  const macdSig = rules.macdSignal ?? 9;
  return Math.max(slow, rsiP, lookback, macdSlow + macdSig) + 2;
}

interface Series {
  closes: number[];
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  rsi: (number | null)[];
  macd: (number | null)[];
  macdSig: (number | null)[];
}

function buildSeries(candles: Candle[], rules: StrategyRules): Series {
  const closes = candles.map((c) => c.close);
  const macd = macdSeries(closes, rules.macdFast ?? 12, rules.macdSlow ?? 26, rules.macdSignal ?? 9);
  return {
    closes,
    fastEma: emaSeries(closes, rules.fast ?? 20),
    slowEma: emaSeries(closes, rules.slow ?? 50),
    rsi: rsiSeries(closes, rules.rsiPeriod ?? 14),
    macd: macd.macd,
    macdSig: macd.signal,
  };
}

export function signalOnBar(
  candles: Candle[],
  rules: StrategyRules,
  i: number,
): 'LONG' | 'SHORT' | null {
  if (i < 1 || i >= candles.length) return null;
  const s = buildSeries(candles, rules);
  return signalAt(rules, i, candles, s.closes, s.fastEma, s.slowEma, s.rsi, s.macd, s.macdSig);
}

export function levelsForSignal(
  candles: Candle[],
  i: number,
  side: 'LONG' | 'SHORT',
  rules: StrategyRules,
): { entry: number; stop: number; target: number } {
  const entry = candles[i]!.close;
  const atr = atrProxy(candles, i);
  const risk = (rules.stopAtr ?? 1.5) * atr;
  const r = rules.targetR ?? 2;
  const stop = side === 'LONG' ? entry - risk : entry + risk;
  const target = side === 'LONG' ? entry + r * risk : entry - r * risk;
  return { entry, stop, target };
}

/** Index of the latest bar that has fully closed. Forming bar is ignored. */
export function lastClosedIndex(candles: Candle[], tfMs: number, now = Date.now()): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i]!.openTime + tfMs <= now) return i;
  }
  return -1;
}

function summarize(samples: BacktestTrade[]): BacktestResult {
  const wins = samples.filter((t) => t.pnlPct > 0).length;
  const losses = samples.filter((t) => t.pnlPct <= 0).length;
  const decided = wins + losses;
  const expectancyPct =
    samples.length > 0 ? samples.reduce((s, t) => s + t.pnlPct, 0) / samples.length : null;

  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of samples) {
    equity += t.pnlPct;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  return {
    trades: samples.length,
    wins,
    losses,
    hitRate: decided > 0 ? wins / decided : null,
    expectancyPct,
    maxDrawdownPct: samples.length > 0 ? maxDd : null,
    samples: samples.slice(-20),
  };
}

function simulate(
  candles: Candle[],
  rules: StrategyRules,
  opts?: { fromIdx?: number; toIdx?: number },
): BacktestTrade[] {
  const stopAtr = rules.stopAtr ?? 1.5;
  const targetR = rules.targetR ?? 2;
  const horizon = rules.horizonBars ?? 48;
  const series = buildSeries(candles, rules);
  const start = Math.max(warmupBars(rules), opts?.fromIdx ?? 0);
  const endBound = opts?.toIdx ?? candles.length;

  const samples: BacktestTrade[] = [];
  let i = start;
  while (i < endBound - 2 && i < candles.length - 2) {
    const side = signalAt(
      rules,
      i,
      candles,
      series.closes,
      series.fastEma,
      series.slowEma,
      series.rsi,
      series.macd,
      series.macdSig,
    );
    if (!side) {
      i += 1;
      continue;
    }
    const entry = series.closes[i]!;
    const atr = atrProxy(candles, i);
    const risk = stopAtr * atr;
    const stop = side === 'LONG' ? entry - risk : entry + risk;
    const target = side === 'LONG' ? entry + targetR * risk : entry - targetR * risk;

    let exit = entry;
    let exitTime = candles[i]!.openTime;
    let reason: BacktestTrade['reason'] = 'horizon';
    let j = i + 1;
    const end = Math.min(candles.length - 1, i + horizon);
    for (; j <= end; j++) {
      const hit = barHit(side, stop, target, candles[j]!);
      if (hit) {
        exit = hit.exit;
        reason = hit.reason;
        exitTime = candles[j]!.openTime;
        break;
      }
      if (j === end) {
        exit = candles[j]!.close;
        exitTime = candles[j]!.openTime;
        reason = 'horizon';
      }
    }

    const pnlPct = side === 'LONG' ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
    samples.push({
      entryTime: candles[i]!.openTime,
      exitTime,
      side,
      entry,
      exit,
      pnlPct,
      reason,
    });
    i = Math.max(j, i + 1);
  }
  return samples;
}

/** Stop wins if both barriers print on the same bar. */
export function barHit(
  side: 'LONG' | 'SHORT',
  stop: number,
  target: number,
  c: Candle,
): { exit: number; reason: 'stop' | 'target' } | null {
  if (side === 'LONG') {
    if (c.low <= stop) return { exit: stop, reason: 'stop' };
    if (c.high >= target) return { exit: target, reason: 'target' };
  } else {
    if (c.high >= stop) return { exit: stop, reason: 'stop' };
    if (c.low <= target) return { exit: target, reason: 'target' };
  }
  return null;
}

/** Walk candles and simulate entries/exits from compiled rules. */
export function backtestStrategy(candles: Candle[], rules: StrategyRules): BacktestResult {
  return summarize(simulate(candles, rules));
}

export function evaluatePromote(holdout: BacktestResult): PromoteGate {
  const reasons: string[] = [];
  if (holdout.trades < PROMOTE_MIN_TRADES) {
    reasons.push(`Holdout has ${holdout.trades} trades (need ${PROMOTE_MIN_TRADES})`);
  }
  if (holdout.expectancyPct == null || holdout.expectancyPct <= 0) {
    reasons.push('Holdout expectancy is not positive');
  }
  if (holdout.maxDrawdownPct == null || holdout.maxDrawdownPct >= PROMOTE_MAX_DD_PCT) {
    reasons.push(`Holdout drawdown is ${PROMOTE_MAX_DD_PCT}% or more`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Full-series simulation, then split trades by entry time.
 * Indicators see history before the holdout window (no cold start).
 */
export function walkForwardBacktest(
  candles: Candle[],
  rules: StrategyRules,
  symbol: string,
  timeframe: StrategyTimeframe,
  asOf = new Date().toISOString(),
): WalkForwardBacktest {
  const splitIdx = Math.max(1, Math.floor(candles.length * 0.7));
  const splitTime = candles[Math.min(splitIdx, candles.length - 1)]!.openTime;
  const all = simulate(candles, rules);
  const inTrades = all.filter((t) => t.entryTime < splitTime);
  const holdTrades = all.filter((t) => t.entryTime >= splitTime);
  const inSample = summarize(inTrades);
  const holdout = summarize(holdTrades);
  const promote = evaluatePromote(holdout);
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    asOf,
    trades: holdout.trades,
    wins: holdout.wins,
    losses: holdout.losses,
    hitRate: holdout.hitRate,
    expectancyPct: holdout.expectancyPct,
    maxDrawdownPct: holdout.maxDrawdownPct,
    samples: holdout.samples,
    inSample,
    holdout,
    promote,
  };
}

export interface PositionAdvance {
  status: 'open' | 'target' | 'stop' | 'expired';
  exit: number | null;
  exitTime: number | null;
  mfePct: number;
  maePct: number;
  pnlPct: number | null;
}

/** Resolve an open paper fill against subsequent closed bars. Stop wins ties. */
export function advancePosition(input: {
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  entryBarTime: number;
  horizonBars: number;
  candles: Candle[];
  tfMs: number;
  now?: number;
}): PositionAdvance {
  const now = input.now ?? Date.now();
  const after = input.candles.filter(
    (c) => c.openTime > input.entryBarTime && c.openTime + input.tfMs <= now,
  );
  let mfe = 0;
  let mae = 0;
  let bars = 0;
  for (const c of after) {
    bars += 1;
    const fav = input.side === 'LONG' ? ((c.high - input.entry) / input.entry) * 100 : ((input.entry - c.low) / input.entry) * 100;
    const adv = input.side === 'LONG' ? ((input.entry - c.low) / input.entry) * 100 : ((c.high - input.entry) / input.entry) * 100;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);
    const hit = barHit(input.side, input.stop, input.target, c);
    if (hit) {
      const pnl =
        input.side === 'LONG'
          ? ((hit.exit - input.entry) / input.entry) * 100
          : ((input.entry - hit.exit) / input.entry) * 100;
      return {
        status: hit.reason === 'stop' ? 'stop' : 'target',
        exit: hit.exit,
        exitTime: c.openTime,
        mfePct: mfe,
        maePct: mae,
        pnlPct: pnl,
      };
    }
    if (bars >= input.horizonBars) {
      const exit = c.close;
      const pnl =
        input.side === 'LONG'
          ? ((exit - input.entry) / input.entry) * 100
          : ((input.entry - exit) / input.entry) * 100;
      return {
        status: 'expired',
        exit,
        exitTime: c.openTime,
        mfePct: mfe,
        maePct: mae,
        pnlPct: pnl,
      };
    }
  }
  return { status: 'open', exit: null, exitTime: null, mfePct: mfe, maePct: mae, pnlPct: null };
}

function isTf(v: unknown): v is StrategyTimeframe {
  return v === '15m' || v === '1h' || v === '4h' || v === '1d';
}

/** Best-effort parse of LLM / user JSON into StrategyRules with defaults. */
export function normalizeStrategyRules(raw: unknown): StrategyRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (!KINDS.includes(kind as StrategyRuleKind)) return null;
  const direction = o.direction === 'SHORT' || o.direction === 'BOTH' || o.direction === 'LONG' ? o.direction : 'BOTH';
  const symbol = typeof o.symbol === 'string' && o.symbol.trim() ? o.symbol.trim().toUpperCase().slice(0, 32) : undefined;
  return {
    kind: kind as StrategyRuleKind,
    direction,
    ...(symbol ? { symbol } : {}),
    ...(isTf(o.timeframe) ? { timeframe: o.timeframe } : {}),
    fast: num(o.fast, 20),
    slow: num(o.slow, 50),
    rsiPeriod: num(o.rsiPeriod, 14),
    rsiAbove: o.rsiAbove != null ? Number(o.rsiAbove) : 70,
    rsiBelow: o.rsiBelow != null ? Number(o.rsiBelow) : 30,
    lookback: num(o.lookback, 20),
    macdFast: num(o.macdFast, 12),
    macdSlow: num(o.macdSlow, 26),
    macdSignal: num(o.macdSignal, 9),
    stopAtr: num(o.stopAtr, 1.5),
    targetR: num(o.targetR, 2),
    horizonBars: num(o.horizonBars, 48),
  };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
