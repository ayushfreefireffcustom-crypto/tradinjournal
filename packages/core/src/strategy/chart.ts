// The Chart layout of the strategy builder (F11): recent candles with the
// strategy drawn on them. Indicator lines from its conditions (price-scale ones
// on the candles, the rest in panes below), the fixed-number thresholds that
// can be dragged, where the entry signals fired, the trades a backtest of
// those bars takes, and where the stop and target would sit for a trade now.
import type { Candle } from '../trader/types.js';
import { indicatorById, type OutputScale } from '../indicators/registry.js';
import { describeOperand, type Operand } from '../indicators/conditions.js';
import { SignalEngine } from './signals.js';
import { runBacktest } from './backtest.js';
import { planEntry } from './plan.js';
import { resolveShort, type Interval, type SignalGroup, type StrategySpec } from './spec.js';

export type ChartGroup = 'long' | 'short' | 'exitLong' | 'exitShort';
export interface ChartSeries { key: string; label: string; pane: string; scale: OutputScale; values: Array<number | null> }
export interface ChartThreshold {
  group: ChartGroup;
  index: number;
  pane: string;
  /** The series the number is compared with. */
  seriesKey: string;
  label: string;
  operator: string;
  value: number;
  /** Derived from the long rules (short mirrors long): moves with them, not on its own. */
  mirrored: boolean;
}
export interface ChartPreview {
  symbol: string;
  interval: Interval;
  candles: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  series: ChartSeries[];
  panes: string[];
  thresholds: ChartThreshold[];
  /** Bar indexes (into candles) where the long / short entry rules were all met. */
  signals: { long: number[]; short: number[] };
  trades: Array<{ side: 'long' | 'short'; entryT: number; entryPrice: number; exitT: number | null; exitPrice: number | null; pnl: number | null; reason: string | null }>;
  /** A trade opened at the last close: where its stop and target would be. */
  risk: { side: 'long' | 'short'; entry: number; stop: number | null; target: number | null; atr: number | null } | null;
}

const keyOf = (o: Operand & { kind: 'indicator' }, tf: Interval | undefined) => `${tf ?? ''}|${o.id}|${o.output}|${JSON.stringify(o.params ?? {})}`;
const scaleOf = (o: Operand & { kind: 'indicator' }): OutputScale => indicatorById(o.id)?.outputs.find((x) => x.key === o.output)?.scale ?? 'centered';

export function chartPreview(spec: StrategySpec, symbol: string, candles: Candle[], params: { from: number; capital?: number }): ChartPreview {
  const interval = spec.session.interval;
  const eng = new SignalEngine(candles, interval);
  const first = Math.max(0, candles.findIndex((c) => c.openTime >= params.from));
  const shown = candles.slice(first);
  const series = new Map<string, ChartSeries>();
  const panes: string[] = ['price'];
  const thresholds: ChartThreshold[] = [];

  const add = (o: Operand & { kind: 'indicator' }, tf: Interval | undefined, pane: string) => {
    const key = keyOf(o, tf);
    if (series.has(key)) return series.get(key)!;
    // Close is the candles themselves.
    if (o.id === 'price' && o.output === 'close' && !tf) { const s: ChartSeries = { key, label: 'Close', pane: 'price', scale: 'price', values: [] }; series.set(key, s); return s; }
    const s: ChartSeries = { key, scale: scaleOf(o), label: `${describeOperand(o)}${tf && tf !== interval ? ` · ${tf}` : ''}`, pane, values: eng.aligned(o, tf ?? interval).slice(first) };
    series.set(key, s);
    if (!panes.includes(pane)) panes.push(pane);
    return s;
  };
  const longG = spec.market.direction !== 'short' ? spec.entry.long : null;
  const shortG = spec.market.direction !== 'long' ? resolveShort(spec.entry.short, spec.entry.long) : null;
  const groups: Array<[ChartGroup, SignalGroup | null, boolean]> = [
    ['long', longG, false],
    ['short', shortG, spec.entry.short === 'mirror'],
    ['exitLong', spec.market.direction !== 'short' ? spec.exit.long : null, false],
    ['exitShort', spec.market.direction !== 'long' ? resolveShort(spec.exit.short, spec.exit.long) : null, spec.exit.short === 'mirror'],
  ];
  for (const [group, g, mirrored] of groups) {
    g?.conditions.forEach((c, index) => {
      const pane = scaleOf(c.left) === 'price' ? 'price' : series.get(keyOf(c.left, c.timeframe))?.pane ?? `p${panes.length}`;
      const left = add(c.left, c.timeframe, pane);
      if (c.right.kind === 'indicator') add(c.right, c.timeframe, left.pane);
      else thresholds.push({ group, index, pane: left.pane, seriesKey: left.key, label: left.label, operator: c.operator, value: c.right.value, mirrored });
    });
  }

  const signals = { long: [] as number[], short: [] as number[] };
  for (let i = first; i < candles.length; i++) {
    if (eng.group(longG, i)) signals.long.push(i - first);
    if (eng.group(shortG, i)) signals.short.push(i - first);
  }

  const capital = params.capital ?? 10_000;
  const bt = shown.length ? runBacktest(spec, { [symbol]: candles }, { capital, slippageBps: 5, from: shown[0]!.openTime, keepOpen: true }) : null;
  const trades: ChartPreview['trades'] = [
    ...(bt?.trades ?? []).filter((t) => t.symbol === symbol).map((t) => ({ side: t.side, entryT: t.entryTime, entryPrice: t.entryPrice, exitT: t.exitTime, exitPrice: t.exitPrice, pnl: t.pnl, reason: t.reason as string })),
    ...(bt?.open ?? []).filter((t) => t.symbol === symbol).map((t) => ({ side: t.side, entryT: t.entryTime, entryPrice: t.entryPrice, exitT: null, exitPrice: null, pnl: null, reason: null })),
  ];

  let risk: ChartPreview['risk'] = null;
  const last = candles[candles.length - 1];
  if (last) {
    const side: 1 | -1 = spec.market.direction === 'short' ? -1 : 1;
    const atrLen = spec.risk.stopLoss?.atrLength ?? spec.risk.trailing?.atrLength ?? 14;
    const atr = eng.atr(candles.length - 1, atrLen);
    const plan = planEntry({ spec, symbol, side, price: last.close, atr, equity: capital, marginUsed: 0 });
    risk = 'skip' in plan ? { side: side === 1 ? 'long' : 'short', entry: last.close, stop: null, target: null, atr } : { side: side === 1 ? 'long' : 'short', entry: last.close, stop: plan.stop, target: plan.target, atr };
  }

  return {
    symbol, interval,
    candles: shown.map((c) => ({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close })),
    series: [...series.values()].filter((s) => s.values.length),
    panes, thresholds, signals, trades, risk,
  };
}
