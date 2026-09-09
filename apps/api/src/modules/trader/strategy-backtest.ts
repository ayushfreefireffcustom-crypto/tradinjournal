// Deterministic strategy backtester for Trader Master strategy builder.
// Rules are typed — LLM only parses intent into this shape; never executes.
import type { TraderCandle as Candle } from '@tradinjournal/core';

export type StrategyRuleKind = 'ema_cross' | 'rsi_threshold' | 'price_vs_ema';

export interface StrategyRules {
  kind: StrategyRuleKind;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  /** EMA fast/slow for ema_cross / price_vs_ema */
  fast?: number;
  slow?: number;
  /** RSI period + threshold */
  rsiPeriod?: number;
  rsiAbove?: number;
  rsiBelow?: number;
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

function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < period) return out;
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
  closes: number[],
  fastEma: (number | null)[],
  slowEma: (number | null)[],
  rsi: (number | null)[],
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
  return null;
}

/** Walk candles and simulate entries/exits from compiled rules. */
export function backtestStrategy(candles: Candle[], rules: StrategyRules): BacktestResult {
  const closes = candles.map((c) => c.close);
  const fast = rules.fast ?? 20;
  const slow = rules.slow ?? 50;
  const rsiP = rules.rsiPeriod ?? 14;
  const stopAtr = rules.stopAtr ?? 1.5;
  const targetR = rules.targetR ?? 2;
  const horizon = rules.horizonBars ?? 48;

  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const rsi = rsiSeries(closes, rsiP);

  const samples: BacktestTrade[] = [];
  let i = Math.max(slow, rsiP) + 1;
  while (i < candles.length - 2) {
    const side = signalAt(rules, i, closes, fastEma, slowEma, rsi);
    if (!side) {
      i += 1;
      continue;
    }
    const entry = closes[i]!;
    const atr = atrProxy(candles, i);
    const stop = side === 'LONG' ? entry - stopAtr * atr : entry + stopAtr * atr;
    const target = side === 'LONG' ? entry + targetR * stopAtr * atr : entry - targetR * stopAtr * atr;

    let exit = entry;
    let exitTime = candles[i]!.openTime;
    let reason: BacktestTrade['reason'] = 'horizon';
    let j = i + 1;
    const end = Math.min(candles.length - 1, i + horizon);
    for (; j <= end; j++) {
      const c = candles[j]!;
      if (side === 'LONG') {
        if (c.low <= stop) {
          exit = stop;
          reason = 'stop';
          exitTime = c.openTime;
          break;
        }
        if (c.high >= target) {
          exit = target;
          reason = 'target';
          exitTime = c.openTime;
          break;
        }
      } else {
        if (c.high >= stop) {
          exit = stop;
          reason = 'stop';
          exitTime = c.openTime;
          break;
        }
        if (c.low <= target) {
          exit = target;
          reason = 'target';
          exitTime = c.openTime;
          break;
        }
      }
      if (j === end) {
        exit = c.close;
        exitTime = c.openTime;
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

/** Best-effort parse of LLM / user JSON into StrategyRules with defaults. */
export function normalizeStrategyRules(raw: unknown): StrategyRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== 'ema_cross' && kind !== 'rsi_threshold' && kind !== 'price_vs_ema') return null;
  const direction = o.direction === 'SHORT' || o.direction === 'BOTH' || o.direction === 'LONG' ? o.direction : 'BOTH';
  return {
    kind,
    direction,
    fast: num(o.fast, 20),
    slow: num(o.slow, 50),
    rsiPeriod: num(o.rsiPeriod, 14),
    rsiAbove: o.rsiAbove != null ? Number(o.rsiAbove) : 70,
    rsiBelow: o.rsiBelow != null ? Number(o.rsiBelow) : 30,
    stopAtr: num(o.stopAtr, 1.5),
    targetR: num(o.targetR, 2),
    horizonBars: num(o.horizonBars, 48),
  };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
