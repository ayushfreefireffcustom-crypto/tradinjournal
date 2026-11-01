// Evaluates a strategy's signal groups bar by bar. Series are computed once per
// (operand, timeframe) and looked up by index. A condition on a higher
// timeframe reads the last higher-timeframe bar that had fully closed by the
// time the base bar closed, so a backtest never peeks at the future.
import type { Candle } from '../trader/types.js';
import { indicatorById, resolveParams } from '../indicators/registry.js';
import type { Operand } from '../indicators/conditions.js';
import { INTERVAL_MS, type Interval, type SignalGroup, type StrategyCondition } from './spec.js';

/** Group base candles into higher-timeframe candles on UTC boundaries. */
export function resample(candles: Candle[], ms: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const open = Math.floor(c.openTime / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.openTime === open) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else out.push({ openTime: open, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
  }
  return out;
}

export class SignalEngine {
  private series = new Map<string, Array<number | null>>();
  private frames = new Map<Interval, { candles: Candle[]; mapIdx: Int32Array }>();

  constructor(private readonly base: Candle[], private readonly interval: Interval) {}

  /** Higher-timeframe candles and, per base bar, the index of the last closed HTF bar (-1 if none). */
  private frame(tf: Interval) {
    const hit = this.frames.get(tf);
    if (hit) return hit;
    const ms = INTERVAL_MS[tf];
    const baseMs = INTERVAL_MS[this.interval];
    const candles = resample(this.base, ms);
    const mapIdx = new Int32Array(this.base.length).fill(-1);
    let j = -1;
    for (let i = 0; i < this.base.length; i++) {
      const closeAt = this.base[i]!.openTime + baseMs;
      while (j + 1 < candles.length && candles[j + 1]!.openTime + ms <= closeAt) j++;
      mapIdx[i] = j;
    }
    const f = { candles, mapIdx };
    this.frames.set(tf, f);
    return f;
  }

  private valueAt(o: Operand, tf: Interval, i: number): number | null {
    if (o.kind === 'value') return o.value;
    const htf = tf !== this.interval;
    const f = htf ? this.frame(tf) : null;
    const idx = f ? f.mapIdx[i]! : i;
    if (idx < 0) return null;
    const key = `${tf}|${o.id}|${o.output}|${JSON.stringify(o.params ?? {})}`;
    let s = this.series.get(key);
    if (!s) {
      const spec = indicatorById(o.id);
      if (!spec) return null;
      s = spec.compute(f ? f.candles : this.base, resolveParams(spec, o.params ?? {}))[o.output] ?? [];
      this.series.set(key, s);
    }
    return s[idx] ?? null;
  }

  /** One condition at base bar i; null when there isn't enough data. */
  condition(c: StrategyCondition, i: number): boolean | null {
    const tf = c.timeframe ?? this.interval;
    // barsAgo counts bars of the condition's own timeframe.
    const at = (k: number): number => {
      if (tf === this.interval) return i - k;
      if (k === 0) return i;
      const f = this.frame(tf);
      const target = f.mapIdx[i]! - k;
      if (target < 0) return -1;
      // The last base bar whose closed-HTF index is `target`.
      let b = i;
      while (b >= 0 && f.mapIdx[b]! > target) b--;
      return b;
    };
    const n = c.barsAgo ?? 0;
    const shift = c.rightBarsAgo ?? 0;
    const cur = at(n);
    const curR = at(n + shift);
    if (cur < 0 || curR < 0) return null;
    const l = this.valueAt(c.left, tf, cur);
    const r = this.valueAt(c.right, tf, curR);
    if (l == null || r == null) return null;
    switch (c.operator) {
      case 'gt': return l > r;
      case 'gte': return l >= r;
      case 'lt': return l < r;
      case 'lte': return l <= r;
      case 'eq': return Math.abs(l - r) <= Math.max(1e-9, Math.abs(r) * 0.001);
      case 'crosses_above':
      case 'crosses_below': {
        const prev = at(n + 1);
        const prevR = at(n + 1 + shift);
        if (prev < 0 || prevR < 0) return null;
        const pl = this.valueAt(c.left, tf, prev);
        const pr = this.valueAt(c.right, tf, prevR);
        if (pl == null || pr == null) return null;
        // On a higher timeframe the "previous" value must come from an earlier HTF bar.
        if (tf !== this.interval && this.frame(tf).mapIdx[prev] === this.frame(tf).mapIdx[cur]) return false;
        return c.operator === 'crosses_above' ? pl <= pr && l > r : pl >= pr && l < r;
      }
    }
  }

  /** A group at bar i: all/any of its conditions. Unknown counts as not met. */
  group(g: SignalGroup | null, i: number): boolean {
    if (!g || !g.conditions.length) return false;
    const results = g.conditions.map((c) => this.condition(c, i) === true);
    return g.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  /** Average true range at bar i on the base interval. */
  atr(i: number, length = 14): number | null {
    return this.valueAt({ kind: 'indicator', id: 'atr', output: 'value', params: { length } }, this.interval, i);
  }
}
