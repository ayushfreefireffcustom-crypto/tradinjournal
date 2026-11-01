// Conditions over indicators (E3 alerts, E5 screener): "RSI(14) < 30",
// "EMA(20) crosses above EMA(50)", "close > Bollinger upper". Pure, so alerts
// and the screener evaluate exactly the same way.
import type { Candle } from '../trader/types.js';
import { indicatorById, resolveParams, warmup, type OutputScale } from './registry.js';

export type Operand =
  | { kind: 'indicator'; id: string; output: string; params?: Record<string, number> }
  | { kind: 'value'; value: number };

export const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'crosses_above', 'crosses_below'] as const;
export type Operator = (typeof OPERATORS)[number];

export interface Condition { left: Operand & { kind: 'indicator' }; operator: Operator; right: Operand }

/** "Equal" for prices and indicators: within 0.1 % (or 1e-9 near zero). */
const EQ_TOLERANCE = 0.001;
/** Per-bar volume and its average share units (a volume spike); OBV and A/D are running totals. */
const BAR_VOLUME = new Set(['volume', 'volsma']);

function scaleOf(o: Operand & { kind: 'indicator' }): OutputScale {
  const spec = indicatorById(o.id);
  if (!spec) throw new RangeError(`Unknown indicator "${o.id}".`);
  const out = spec.outputs.find((x) => x.key === o.output);
  if (!out) throw new RangeError(`${spec.label} has no "${o.output}" output.`);
  resolveParams(spec, o.params ?? {});
  return out.scale;
}

/**
 * Checks a condition can be evaluated and means something. Indicator against
 * indicator needs the same kind of number: price with price, a 0–100
 * oscillator with another, and other units only within the same indicator
 * (MACD vs its signal, not MACD vs ATR; volume vs its average). Throws a
 * readable RangeError.
 */
export function validateCondition(c: Condition): void {
  if (!(OPERATORS as readonly string[]).includes(c.operator)) throw new RangeError(`Unknown operator "${c.operator}".`);
  const ls = scaleOf(c.left);
  if (c.right.kind === 'value') {
    if (!Number.isFinite(c.right.value)) throw new RangeError('The value must be a number.');
    if (ls === 'percent' && (c.right.value < 0 || c.right.value > 100)) throw new RangeError(`${indicatorById(c.left.id)!.label} runs from 0 to 100; ${c.right.value} can never be reached.`);
    return;
  }
  const rs = scaleOf(c.right);
  const same = c.left.id === c.right.id || (BAR_VOLUME.has(c.left.id) && BAR_VOLUME.has(c.right.id));
  const ok = ls === rs && (ls === 'price' || ls === 'percent' || same);
  if (!ok) throw new RangeError(`${indicatorById(c.left.id)!.label} and ${indicatorById(c.right.id)!.label} aren't measured in the same units, so comparing them means nothing.`);
}

/** Bars of history a condition needs before it can be evaluated. */
export function conditionWarmup(c: Condition): number {
  const w = (o: Operand) => (o.kind === 'indicator' ? warmup(o.id, o.params ?? {}) : 0);
  return Math.max(w(c.left), w(c.right)) + 2;
}

function seriesFor(o: Operand, candles: Candle[]): Array<number | null> {
  if (o.kind === 'value') return candles.map(() => o.value);
  const spec = indicatorById(o.id)!;
  return spec.compute(candles, resolveParams(spec, o.params ?? {}))[o.output]!;
}

export interface Evaluation {
  /** null when there isn't enough data to say. */
  met: boolean | null;
  left: number | null;
  right: number | null;
  prevLeft: number | null;
  prevRight: number | null;
  /** Whether a level condition already held on the bar before (null for crosses or without data). */
  prevMet: boolean | null;
}

/** Evaluates the condition on the last candle given (pass closed bars only). */
export function evaluateCondition(c: Condition, candles: Candle[]): Evaluation {
  const L = seriesFor(c.left, candles);
  const R = seriesFor(c.right, candles);
  const i = candles.length - 1;
  const left = i >= 0 ? L[i] ?? null : null;
  const right = i >= 0 ? R[i] ?? null : null;
  const prevLeft = i >= 1 ? L[i - 1] ?? null : null;
  const prevRight = i >= 1 ? R[i - 1] ?? null : null;
  const level = (a: number | null, b: number | null): boolean | null => {
    if (a == null || b == null) return null;
    switch (c.operator) {
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      case 'eq': return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * EQ_TOLERANCE);
      default: return null;
    }
  };
  const crossing = c.operator === 'crosses_above' || c.operator === 'crosses_below';
  const base = { left, right, prevLeft, prevRight, prevMet: crossing ? null : level(prevLeft, prevRight) };
  if (left == null || right == null) return { met: null, ...base };
  if (!crossing) return { met: level(left, right), ...base };
  if (prevLeft == null || prevRight == null) return { met: null, ...base };
  return { met: c.operator === 'crosses_above' ? prevLeft <= prevRight && left > right : prevLeft >= prevRight && left < right, ...base };
}

/** "RSI(14)", "MACD Signal(12, 26, 9)", "30". */
export function describeOperand(o: Operand): string {
  if (o.kind === 'value') return String(o.value);
  const spec = indicatorById(o.id)!;
  const out = spec.outputs.find((x) => x.key === o.output)!;
  const p = resolveParams(spec, o.params ?? {});
  const args = spec.params.map((x) => p[x.key]).join(', ');
  // The price lines read as plain "Close", "High"; other multi-line indicators name both.
  const base = spec.id === 'price' ? out.label : spec.outputs.length > 1 ? `${spec.label} ${out.label}` : spec.label;
  return args ? `${base}(${args})` : base;
}

/** Numbers for people: "78,062.5" from 1000, 2 decimals from 1, 3 significant below. */
export function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3);
}

/**
 * Plain English. The rule: "RSI(14) crosses below 30". With values, what
 * happened: "RSI(14) crossed below 30 (now 28.4)".
 */
export function describeCondition(c: Condition, e?: Pick<Evaluation, 'left' | 'right'>): string {
  const cross = e ? 'crossed' : 'crosses';
  const ops: Record<Operator, string> = { gt: 'is above', gte: 'is at or above', lt: 'is below', lte: 'is at or below', eq: 'equals', crosses_above: `${cross} above`, crosses_below: `${cross} below` };
  const now = e?.left != null ? ` (now ${formatValue(e.left)}${c.right.kind === 'indicator' && e.right != null ? ` vs ${formatValue(e.right)}` : ''})` : '';
  return `${describeOperand(c.left)} ${ops[c.operator]} ${describeOperand(c.right)}${now}`;
}
