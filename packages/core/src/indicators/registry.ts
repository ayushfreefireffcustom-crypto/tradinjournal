// The indicator catalogue (E1): what alerts, the screener and signals can use.
// Each entry declares typed params with min/max/default, its outputs, and a
// "scale" per output saying what it can sensibly be compared with:
//   price      — in price units, comparable with price and other price outputs
//   percent    — 0–100 oscillators (RSI, Stoch, MFI…), comparable with a number
//   centered   — swings around 0 (MACD, momentum, CCI…), compare with a number
//   volume     — in volume units
//   ratio      — a unitless ratio (BB width, CMF)
import type { Candle } from '../trader/types.js';
import * as s from './series.js';
import type { Series } from './series.js';

export type IndicatorGroup = 'trend' | 'oscillator' | 'volatility' | 'volume' | 'price';
export type OutputScale = 'price' | 'percent' | 'centered' | 'volume' | 'ratio';

export interface ParamSpec { key: string; label: string; min: number; max: number; default: number; step: number }
export interface OutputSpec { key: string; label: string; scale: OutputScale }
export interface IndicatorSpec {
  id: string;
  label: string;
  group: IndicatorGroup;
  params: ParamSpec[];
  outputs: OutputSpec[];
  compute: (c: Candle[], p: Record<string, number>) => Record<string, Series>;
}

const len = (def: number, label = 'Length', max = 500): ParamSpec => ({ key: 'length', label, min: 1, max, default: def, step: 1 });
const P = (key: string, label: string, def: number, min = 1, max = 500, step = 1): ParamSpec => ({ key, label, min, max, default: def, step });
const close = (c: Candle[]) => c.map((x) => x.close);
const one = (key: string, label: string, scale: OutputScale): OutputSpec[] => [{ key, label, scale }];

export const INDICATORS: IndicatorSpec[] = [
  // E1a — moving averages
  { id: 'sma', label: 'SMA', group: 'trend', params: [len(20)], outputs: one('value', 'SMA', 'price'), compute: (c, p) => ({ value: s.sma(close(c), p.length!) }) },
  { id: 'ema', label: 'EMA', group: 'trend', params: [len(20)], outputs: one('value', 'EMA', 'price'), compute: (c, p) => ({ value: s.ema(close(c), p.length!) }) },
  { id: 'wma', label: 'WMA', group: 'trend', params: [len(20)], outputs: one('value', 'WMA', 'price'), compute: (c, p) => ({ value: s.wma(close(c), p.length!) }) },
  { id: 'vwma', label: 'VWMA', group: 'trend', params: [len(20)], outputs: one('value', 'VWMA', 'price'), compute: (c, p) => ({ value: s.vwma(c, p.length!) }) },
  { id: 'hma', label: 'Hull MA', group: 'trend', params: [len(21)], outputs: one('value', 'Hull', 'price'), compute: (c, p) => ({ value: s.hma(close(c), p.length!) }) },
  { id: 'dema', label: 'DEMA', group: 'trend', params: [len(20)], outputs: one('value', 'DEMA', 'price'), compute: (c, p) => ({ value: s.dema(close(c), p.length!) }) },
  { id: 'tema', label: 'TEMA', group: 'trend', params: [len(20)], outputs: one('value', 'TEMA', 'price'), compute: (c, p) => ({ value: s.tema(close(c), p.length!) }) },
  // E1b — trend systems
  {
    id: 'macd', label: 'MACD', group: 'trend', params: [P('fast', 'Fast', 12), P('slow', 'Slow', 26), P('signal', 'Signal', 9)],
    outputs: [{ key: 'macd', label: 'MACD', scale: 'centered' }, { key: 'signal', label: 'Signal', scale: 'centered' }, { key: 'hist', label: 'Histogram', scale: 'centered' }],
    compute: (c, p) => s.macd(close(c), p.fast, p.slow, p.signal),
  },
  {
    id: 'adx', label: 'ADX', group: 'trend', params: [len(14)],
    outputs: [{ key: 'adx', label: 'ADX', scale: 'percent' }, { key: 'plusDi', label: '+DI', scale: 'percent' }, { key: 'minusDi', label: '−DI', scale: 'percent' }],
    compute: (c, p) => s.adx(c, p.length),
  },
  {
    id: 'supertrend', label: 'Supertrend', group: 'trend', params: [P('length', 'ATR length', 10), P('mult', 'Multiplier', 3, 0.1, 20, 0.1)],
    outputs: [{ key: 'line', label: 'Supertrend', scale: 'price' }, { key: 'direction', label: 'Direction (1 up, −1 down)', scale: 'centered' }],
    compute: (c, p) => s.supertrend(c, p.length, p.mult),
  },
  { id: 'psar', label: 'Parabolic SAR', group: 'trend', params: [P('step', 'Step', 0.02, 0.001, 1, 0.001), P('max', 'Max', 0.2, 0.01, 1, 0.01)], outputs: one('value', 'SAR', 'price'), compute: (c, p) => ({ value: s.psar(c, p.step, p.max) }) },
  {
    id: 'donchian', label: 'Donchian', group: 'trend', params: [len(20)],
    outputs: [{ key: 'upper', label: 'Upper', scale: 'price' }, { key: 'middle', label: 'Middle', scale: 'price' }, { key: 'lower', label: 'Lower', scale: 'price' }],
    compute: (c, p) => s.donchian(c, p.length),
  },
  // E1c — Ichimoku
  {
    id: 'ichimoku', label: 'Ichimoku', group: 'trend', params: [P('conv', 'Conversion', 9), P('base', 'Base', 26), P('spanB', 'Span B', 52), P('displacement', 'Displacement', 26)],
    outputs: [{ key: 'tenkan', label: 'Tenkan', scale: 'price' }, { key: 'kijun', label: 'Kijun', scale: 'price' }, { key: 'spanA', label: 'Span A', scale: 'price' }, { key: 'spanB', label: 'Span B', scale: 'price' }, { key: 'chikou', label: 'Chikou', scale: 'price' }],
    compute: (c, p) => s.ichimoku(c, p.conv, p.base, p.spanB, p.displacement),
  },
  // E1d — oscillators
  { id: 'rsi', label: 'RSI', group: 'oscillator', params: [len(14)], outputs: one('value', 'RSI', 'percent'), compute: (c, p) => ({ value: s.rsi(close(c), p.length!) }) },
  {
    id: 'stochrsi', label: 'Stoch RSI', group: 'oscillator', params: [P('rsi', 'RSI length', 14), P('stoch', 'Stoch length', 14), P('k', 'K', 3), P('d', 'D', 3)],
    outputs: [{ key: 'k', label: '%K', scale: 'percent' }, { key: 'd', label: '%D', scale: 'percent' }],
    compute: (c, p) => s.stochRsi(close(c), p.rsi, p.stoch, p.k, p.d),
  },
  {
    id: 'stoch', label: 'Stochastic', group: 'oscillator', params: [len(14), P('k', 'K smoothing', 3), P('d', 'D', 3)],
    outputs: [{ key: 'k', label: '%K', scale: 'percent' }, { key: 'd', label: '%D', scale: 'percent' }],
    compute: (c, p) => s.stochastic(c, p.length, p.k, p.d),
  },
  { id: 'cci', label: 'CCI', group: 'oscillator', params: [len(20)], outputs: one('value', 'CCI', 'centered'), compute: (c, p) => ({ value: s.cci(c, p.length!) }) },
  { id: 'willr', label: 'Williams %R', group: 'oscillator', params: [len(14)], outputs: one('value', '%R', 'centered'), compute: (c, p) => ({ value: s.williamsR(c, p.length!) }) },
  { id: 'mfi', label: 'MFI', group: 'oscillator', params: [len(14)], outputs: one('value', 'MFI', 'percent'), compute: (c, p) => ({ value: s.mfi(c, p.length!) }) },
  { id: 'roc', label: 'Rate of change', group: 'oscillator', params: [len(9)], outputs: one('value', 'ROC %', 'centered'), compute: (c, p) => ({ value: s.roc(close(c), p.length!) }) },
  { id: 'mom', label: 'Momentum', group: 'oscillator', params: [len(10)], outputs: one('value', 'Momentum', 'centered'), compute: (c, p) => ({ value: s.momentum(close(c), p.length!) }) },
  { id: 'ao', label: 'Awesome oscillator', group: 'oscillator', params: [P('fast', 'Fast', 5), P('slow', 'Slow', 34)], outputs: one('value', 'AO', 'centered'), compute: (c, p) => ({ value: s.awesome(c, p.fast, p.slow) }) },
  { id: 'uo', label: 'Ultimate oscillator', group: 'oscillator', params: [P('s1', 'Short', 7), P('s2', 'Medium', 14), P('s3', 'Long', 28)], outputs: one('value', 'UO', 'percent'), compute: (c, p) => ({ value: s.ultimate(c, p.s1, p.s2, p.s3) }) },
  // E1e — volatility
  { id: 'atr', label: 'ATR', group: 'volatility', params: [len(14)], outputs: one('value', 'ATR', 'centered'), compute: (c, p) => ({ value: s.atr(c, p.length) }) },
  {
    id: 'bb', label: 'Bollinger Bands', group: 'volatility', params: [len(20), P('mult', 'Std devs', 2, 0.1, 10, 0.1)],
    outputs: [{ key: 'upper', label: 'Upper', scale: 'price' }, { key: 'middle', label: 'Middle', scale: 'price' }, { key: 'lower', label: 'Lower', scale: 'price' }, { key: 'width', label: 'Width', scale: 'ratio' }],
    compute: (c, p) => s.bollinger(close(c), p.length, p.mult),
  },
  {
    id: 'keltner', label: 'Keltner Channels', group: 'volatility', params: [len(20), P('mult', 'Multiplier', 2, 0.1, 10, 0.1), P('atr', 'ATR length', 10)],
    outputs: [{ key: 'upper', label: 'Upper', scale: 'price' }, { key: 'middle', label: 'Middle', scale: 'price' }, { key: 'lower', label: 'Lower', scale: 'price' }],
    compute: (c, p) => s.keltner(c, p.length, p.mult, p.atr),
  },
  { id: 'stdev', label: 'Standard deviation', group: 'volatility', params: [len(20)], outputs: one('value', 'StdDev', 'centered'), compute: (c, p) => ({ value: s.stdev(close(c), p.length!) }) },
  // E1f — volume
  { id: 'volume', label: 'Volume', group: 'volume', params: [], outputs: one('value', 'Volume', 'volume'), compute: (c) => ({ value: c.map((x) => x.volume) }) },
  { id: 'volsma', label: 'Volume SMA', group: 'volume', params: [len(20)], outputs: one('value', 'Volume SMA', 'volume'), compute: (c, p) => ({ value: s.sma(c.map((x) => x.volume), p.length!) }) },
  { id: 'vwap', label: 'VWAP (daily)', group: 'volume', params: [], outputs: one('value', 'VWAP', 'price'), compute: (c) => ({ value: s.vwap(c) }) },
  { id: 'obv', label: 'On-balance volume', group: 'volume', params: [], outputs: one('value', 'OBV', 'volume'), compute: (c) => ({ value: s.obv(c) }) },
  { id: 'cmf', label: 'Chaikin money flow', group: 'volume', params: [len(20)], outputs: one('value', 'CMF', 'ratio'), compute: (c, p) => ({ value: s.cmf(c, p.length!) }) },
  { id: 'ad', label: 'Accumulation/distribution', group: 'volume', params: [], outputs: one('value', 'A/D', 'volume'), compute: (c) => ({ value: s.accDist(c) }) },
  // E1h — price references
  {
    id: 'price', label: 'Price', group: 'price', params: [],
    outputs: [{ key: 'open', label: 'Open', scale: 'price' }, { key: 'high', label: 'High', scale: 'price' }, { key: 'low', label: 'Low', scale: 'price' }, { key: 'close', label: 'Close', scale: 'price' }],
    compute: (c) => ({ open: c.map((x) => x.open), high: c.map((x) => x.high), low: c.map((x) => x.low), close: close(c) }),
  },
  { id: 'hh', label: 'Highest high', group: 'price', params: [len(20, 'Bars')], outputs: one('value', 'Highest high', 'price'), compute: (c, p) => ({ value: s.highest(c.map((x) => x.high), p.length!) }) },
  { id: 'll', label: 'Lowest low', group: 'price', params: [len(20, 'Bars')], outputs: one('value', 'Lowest low', 'price'), compute: (c, p) => ({ value: s.lowest(c.map((x) => x.low), p.length!) }) },
];

const BY_ID = new Map(INDICATORS.map((i) => [i.id, i]));
export const indicatorById = (id: string): IndicatorSpec | undefined => BY_ID.get(id);

/** Params filled with defaults and checked against their ranges. Throws with a readable reason. */
export function resolveParams(spec: IndicatorSpec, given: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of spec.params) {
    const v = given[p.key] ?? p.default;
    if (!Number.isFinite(v) || v < p.min || v > p.max) throw new RangeError(`${spec.label} ${p.label.toLowerCase()} must be between ${p.min} and ${p.max}.`);
    if (p.step >= 1 && !Number.isInteger(v)) throw new RangeError(`${spec.label} ${p.label.toLowerCase()} must be a whole number.`);
    out[p.key] = v;
  }
  for (const k of Object.keys(given)) if (!spec.params.some((p) => p.key === k)) throw new RangeError(`${spec.label} has no "${k}" setting.`);
  if (spec.id === 'macd' && out.fast! >= out.slow!) throw new RangeError('MACD fast length must be shorter than slow.');
  return out;
}

/** Compute one indicator output for a candle series. */
export function computeIndicator(id: string, output: string, candles: Candle[], params: Record<string, number> = {}): Series {
  const spec = indicatorById(id);
  if (!spec) throw new RangeError(`Unknown indicator "${id}".`);
  if (!spec.outputs.some((o) => o.key === output)) throw new RangeError(`${spec.label} has no "${output}" output.`);
  return spec.compute(candles, resolveParams(spec, params))[output]!;
}

/** Bars needed before an output is defined (rough upper bound), for fetching enough history. */
export function warmup(id: string, params: Record<string, number> = {}): number {
  const spec = indicatorById(id);
  if (!spec) return 0;
  const p = resolveParams(spec, params);
  const biggest = Math.max(0, ...Object.values(p).filter((v) => Number.isInteger(v)));
  // Chained smoothings (DEMA/TEMA/MACD/ADX/StochRSI) need a few lengths; 3× plus slack covers them.
  return biggest * 3 + 10;
}
