// Pure TradeAI signal computation — levels from price ± ATR, 1%-risk sizing.
// No I/O. Educational / paper-trading framing only.
import type { BiasResult, MacroAsset } from './types.js';

export type SignalDirection = 'LONG' | 'SHORT' | 'WAIT';

export interface OhlcBar {
  high: number;
  low: number;
  close: number;
}

export interface SignalInput {
  asset: MacroAsset;
  price: number;
  /** Wilder ATR (or proxy). Must be > 0 for actionable levels. */
  atr: number;
  bias: BiasResult;
  accountSize?: number; // default 100_000
  /** Short-term trend: +1 up, -1 down, 0 flat — softens WAIT vs bias. */
  trend?: -1 | 0 | 1;
}

export interface SignalResult {
  asset: MacroAsset;
  direction: SignalDirection;
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  confidence: number; // 0–100
  rationale: string;
  invalidation: string;
  accountSize: number;
  qty: number | null;
  riskAmount: number;
  /** Distance entry→stop (R). */
  r: number;
}

export const DEFAULT_ACCOUNT_SIZE = 100_000;
/** Risk fraction of account per trade (1%). */
export const RISK_FRACTION = 0.01;
/** Entry zone half-width in ATR. */
export const ENTRY_ATR_FRAC = 0.25;
/** Stop distance in ATR from mid entry. */
export const STOP_ATR_MULT = 1.5;
/** Target R-multiples. */
export const TARGET_R = [1, 2, 3.2] as const;

export function clamp01(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Wilder ATR from OHLC bars (oldest → newest). Needs ≥ period+1 bars ideally;
 * returns null if insufficient / non-finite data.
 */
export function computeAtr(bars: OhlcBar[], period = 14): number | null {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    if (![cur.high, cur.low, cur.close, prev.close].every(Number.isFinite)) return null;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) {
    // Fallback: simple mean of available TRs.
    if (trs.length === 0) return null;
    const avg = trs.reduce((a, b) => a + b, 0) / trs.length;
    return avg > 0 && Number.isFinite(avg) ? avg : null;
  }
  // First ATR = SMA of first `period` TRs; then Wilder smooth.
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }
  return atr > 0 && Number.isFinite(atr) ? atr : null;
}

/** Bias score + optional short-term trend → direction. */
export function directionFromBias(bias: BiasResult, trend: -1 | 0 | 1 = 0): SignalDirection {
  let score = bias.score;
  // Mild trend nudge (±3) without flipping strong bias.
  score += trend * 3;
  if (score >= 55) return 'LONG';
  if (score <= 45) return 'SHORT';
  return 'WAIT';
}

function roundPx(n: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n * 100) / 100;
  if (abs >= 1) return Math.round(n * 10000) / 10000;
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Build an educational signal card. WAIT still returns levels as neutral
 * reference zones but qty=null and confidence capped.
 */
export function computeSignal(input: SignalInput): SignalResult {
  const accountSize = input.accountSize ?? DEFAULT_ACCOUNT_SIZE;
  const price = input.price;
  const atr = input.atr;
  const direction = directionFromBias(input.bias, input.trend ?? 0);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(atr) || atr <= 0) {
    return {
      asset: input.asset,
      direction: 'WAIT',
      entryLow: price,
      entryHigh: price,
      stop: price,
      t1: price,
      t2: price,
      t3: price,
      confidence: 0,
      rationale: 'Insufficient price/ATR data — no actionable levels.',
      invalidation: 'N/A',
      accountSize,
      qty: null,
      riskAmount: accountSize * RISK_FRACTION,
      r: 0,
    };
  }

  const half = atr * ENTRY_ATR_FRAC;
  const stopDist = atr * STOP_ATR_MULT;
  const mid = price;

  let entryLow: number;
  let entryHigh: number;
  let stop: number;
  let t1: number;
  let t2: number;
  let t3: number;
  let r: number;

  if (direction === 'SHORT') {
    entryLow = mid - half;
    entryHigh = mid + half;
    const entry = (entryLow + entryHigh) / 2;
    stop = entry + stopDist;
    r = Math.abs(stop - entry);
    t1 = entry - TARGET_R[0] * r;
    t2 = entry - TARGET_R[1] * r;
    t3 = entry - TARGET_R[2] * r;
  } else {
    // LONG and WAIT use long-side geometry as reference.
    entryLow = mid - half;
    entryHigh = mid + half;
    const entry = (entryLow + entryHigh) / 2;
    stop = entry - stopDist;
    r = Math.abs(entry - stop);
    t1 = entry + TARGET_R[0] * r;
    t2 = entry + TARGET_R[1] * r;
    t3 = entry + TARGET_R[2] * r;
  }

  const riskAmount = accountSize * RISK_FRACTION;
  const qty = direction === 'WAIT' || r <= 0 ? null : riskAmount / r;

  const supporting = input.bias.supporting.slice(0, 3).join(', ') || 'balanced factors';
  const opposing = input.bias.opposing.slice(0, 2).join(', ') || 'none material';

  let confidence = clamp01(Math.abs(input.bias.score - 50) * 2);
  if (direction === 'WAIT') confidence = Math.min(confidence, 40);

  const rationale =
    direction === 'WAIT'
      ? `Bias ${input.bias.label} (${input.bias.score}) is near neutral — WAIT. Supporting: ${supporting}. Opposing: ${opposing}. Educational levels only.`
      : `${direction} from bias ${input.bias.label} (${input.bias.score}). Supporting: ${supporting}. Opposing: ${opposing}. Levels use ${STOP_ATR_MULT}×ATR stop and R-multiple targets. Not financial advice.`;

  const invalidation =
    direction === 'SHORT'
      ? `Daily close above stop ${roundPx(stop)} invalidates the short thesis.`
      : direction === 'LONG'
        ? `Daily close below stop ${roundPx(stop)} invalidates the long thesis.`
        : 'No active thesis — wait for bias to leave the neutral band.';

  return {
    asset: input.asset,
    direction,
    entryLow: roundPx(entryLow),
    entryHigh: roundPx(entryHigh),
    stop: roundPx(stop),
    t1: roundPx(t1),
    t2: roundPx(t2),
    t3: roundPx(t3),
    confidence,
    rationale,
    invalidation,
    accountSize,
    qty: qty == null || !Number.isFinite(qty) ? null : roundPx(qty),
    riskAmount,
    r: roundPx(r),
  };
}
