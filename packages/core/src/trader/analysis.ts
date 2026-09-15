// Deterministic analysis: direction from features, a full single-timeframe
// analysis, and top-down multi-timeframe reconciliation. This is BOTH the
// fallback when the LLM is off/failing AND the structured bundle the LLM sees.
// Pure — no I/O.
import type {
  AnalysisResult,
  TechnicalFeatures,
  TfFeatures,
  TimeframeRead,
  TraderDirection,
  Trend,
} from './types.js';
import { deriveLevels, roundPx } from './levels.js';

/** Rank timeframes so we can pick the highest (bias) and lowest (entry). */
const TF_RANK: Record<string, number> = { '15m': 1, '1h': 2, '4h': 3, '1d': 4 };
function tfRank(tf: string): number {
  return TF_RANK[tf] ?? 0;
}

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Direction from a single timeframe's features. Range → WAIT. */
export function directionFromFeatures(f: TechnicalFeatures): TraderDirection {
  if (f.trend === 'up') return 'LONG';
  if (f.trend === 'down') return 'SHORT';
  return 'WAIT';
}

/** Base confidence from EMA spread, RSI extremes and sample size (0–100). */
function baseConfidence(f: TechnicalFeatures, direction: TraderDirection): number {
  const spread = Math.abs(f.ema20 - f.ema50) / (f.ema50 || 1);
  let c = 45 + Math.min(spread * 4000, 40); // 45..85 by trend strength
  if (f.rsi >= 78 || f.rsi <= 22) c -= 12; // stretched → less confident
  if (f.bars < 60) c -= 10; // thin history
  if (direction === 'WAIT') c = Math.min(c, 45);
  return clamp01to100(c);
}

function trendWord(t: Trend): string {
  return t === 'up' ? 'uptrend' : t === 'down' ? 'downtrend' : 'range';
}

function tfRead(tf: string, f: TechnicalFeatures): TimeframeRead {
  const note =
    f.trend === 'range'
      ? `Ranging; RSI ${f.rsi.toFixed(0)}.`
      : `${trendWord(f.trend)}, EMA20 ${f.ema20 > f.ema50 ? 'above' : 'below'} EMA50; RSI ${f.rsi.toFixed(0)}.`;
  return { tf, trend: f.trend, rsi: roundPx(f.rsi), atr: roundPx(f.atr), note };
}

function topLevels(f: TechnicalFeatures): {
  support: { price: number; label: string }[];
  resistance: { price: number; label: string }[];
} {
  return {
    support: f.support.slice(0, 3).map((l) => ({ price: roundPx(l.price), label: l.label })),
    resistance: f.resistance.slice(0, 3).map((l) => ({ price: roundPx(l.price), label: l.label })),
  };
}

function invalidationText(direction: TraderDirection, stop: number): string {
  if (direction === 'LONG') return `A close below ${roundPx(stop)} invalidates the long thesis.`;
  if (direction === 'SHORT') return `A close above ${roundPx(stop)} invalidates the short thesis.`;
  return 'No active thesis — wait for a trend to establish before committing.';
}

const NFA = 'Not financial advice — for educational use only.';

/** Full deterministic analysis for ONE timeframe. */
export function buildTechnicalAnalysis(tf: string, f: TechnicalFeatures): AnalysisResult {
  const direction = directionFromFeatures(f);
  const levels = deriveLevels({
    price: f.price,
    atr: f.atr,
    direction,
    support: f.support,
    resistance: f.resistance,
  });
  const { support, resistance } = topLevels(f);
  const confidence = baseConfidence(f, direction);

  const rationale =
    direction === 'WAIT'
      ? `${tf} is ranging (RSI ${f.rsi.toFixed(0)}); no clean trend. Levels below are reference only. ${NFA}`
      : `${tf} shows a ${trendWord(f.trend)} with EMA20 ${f.ema20 > f.ema50 ? 'over' : 'under'} EMA50 and RSI ${f.rsi.toFixed(0)}. ${direction} bias into the entry zone; stop beyond structure, targets at prior swings / R-multiples. ${NFA}`;

  return {
    ...levels,
    support,
    resistance,
    confidence,
    rationale,
    invalidation: invalidationText(direction, levels.stop),
    detail: rationale,
    perTimeframe: [tfRead(tf, f)],
  };
}

/**
 * Reconcile 1..n timeframes top-down: the HIGHEST timeframe sets the directional
 * bias, the LOWEST sets entry/stop precision. Confidence scales with how many
 * timeframes agree. Handles a single timeframe as a trivial case.
 */
export function reconcileTimeframes(perTf: TfFeatures[]): AnalysisResult {
  if (!Array.isArray(perTf) || perTf.length === 0) {
    throw new Error('reconcileTimeframes: no timeframes');
  }
  const sorted = [...perTf].sort((a, b) => tfRank(a.tf) - tfRank(b.tf));
  const ltf = sorted[0]!; // lowest → entry precision
  const htf = sorted[sorted.length - 1]!; // highest → bias

  const direction = directionFromFeatures(htf.features);

  // Levels priced off the lowest timeframe (tighter entry/stop), in the HTF direction.
  const levels = deriveLevels({
    price: ltf.features.price,
    atr: ltf.features.atr,
    direction,
    support: ltf.features.support,
    resistance: ltf.features.resistance,
  });

  // Agreement: share of timeframes whose own direction matches the HTF bias.
  const dirs = sorted.map((t) => directionFromFeatures(t.features));
  const agree = direction === 'WAIT' ? 0 : dirs.filter((d) => d === direction).length / dirs.length;

  let confidence = baseConfidence(htf.features, direction);
  if (sorted.length > 1) confidence = clamp01to100(confidence * (0.6 + 0.4 * agree));

  const { support, resistance } = topLevels(ltf.features);
  const reads = sorted.map((t) => tfRead(t.tf, t.features));

  const tfList = sorted.map((t) => t.tf).join(' + ');
  const rationale =
    direction === 'WAIT'
      ? `Across ${tfList} the higher timeframe (${htf.tf}) is ranging — no clean bias. Reference levels only. ${NFA}`
      : `Higher timeframe (${htf.tf}) is in a ${trendWord(htf.features.trend)} → ${direction} bias; entry priced off ${ltf.tf}. ${dirs.filter((d) => d === direction).length}/${dirs.length} timeframes agree. Stop beyond ${ltf.tf} structure, targets at swings / R-multiples. ${NFA}`;

  const detail =
    reads.map((r) => `• ${r.tf}: ${r.note}`).join('\n') +
    `\n\nBias from ${htf.tf}; entry/stop from ${ltf.tf}. ${NFA}`;

  return {
    ...levels,
    support,
    resistance,
    confidence,
    rationale,
    invalidation: invalidationText(direction, levels.stop),
    detail,
    perTimeframe: reads,
  };
}
