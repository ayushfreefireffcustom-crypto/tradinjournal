// Turns a Trader Master strategy (v1: one of five rule kinds) into a v2 spec,
// so old strategies open in the builder and backtest the same way.
import type { Operand } from '../indicators/conditions.js';
import { defaultSpec, type Interval, type SignalGroup, type StrategySpec } from './spec.js';

export interface LegacyRules {
  kind: 'ema_cross' | 'rsi_threshold' | 'price_vs_ema' | 'breakout' | 'macd_cross';
  direction: 'LONG' | 'SHORT' | 'BOTH';
  symbol?: string;
  timeframe?: string;
  fast?: number; slow?: number; rsiPeriod?: number; rsiAbove?: number; rsiBelow?: number; lookback?: number;
  macdFast?: number; macdSlow?: number; macdSignal?: number; stopAtr?: number; targetR?: number; horizonBars?: number;
}

const ema = (n: number): Operand & { kind: 'indicator' } => ({ kind: 'indicator', id: 'ema', output: 'value', params: { length: n } });
const close: Operand & { kind: 'indicator' } = { kind: 'indicator', id: 'price', output: 'close' };

export function fromLegacy(r: LegacyRules): StrategySpec {
  const spec = defaultSpec(r.symbol ?? 'BTCUSDT');
  const tf = (['15m', '1h', '4h', '1d'] as const).includes(r.timeframe as never) ? (r.timeframe as Interval) : '1h';
  spec.session.interval = tf;
  spec.market.direction = r.direction === 'LONG' ? 'long' : r.direction === 'SHORT' ? 'short' : 'both';
  let long: SignalGroup;
  switch (r.kind) {
    case 'ema_cross': long = { match: 'all', conditions: [{ left: ema(r.fast ?? 20), operator: 'crosses_above', right: ema(r.slow ?? 50) }] }; break;
    case 'price_vs_ema': long = { match: 'all', conditions: [{ left: close, operator: 'crosses_above', right: ema(r.slow ?? r.fast ?? 50) }] }; break;
    case 'rsi_threshold': long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: r.rsiPeriod ?? 14 } }, operator: 'crosses_above', right: { kind: 'value', value: r.rsiBelow ?? 30 } }] }; break;
    // Close above the highest high of the bars before this one.
    case 'breakout': long = { match: 'all', conditions: [{ left: close, operator: 'gt', right: { kind: 'indicator', id: 'hh', output: 'value', params: { length: r.lookback ?? 20 } }, rightBarsAgo: 1 }] }; break;
    case 'macd_cross': long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'macd', output: 'macd', params: { fast: r.macdFast ?? 12, slow: r.macdSlow ?? 26, signal: r.macdSignal ?? 9 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'macd', output: 'signal', params: { fast: r.macdFast ?? 12, slow: r.macdSlow ?? 26, signal: r.macdSignal ?? 9 } } }] }; break;
  }
  spec.entry.long = long;
  spec.entry.short = r.direction === 'LONG' ? null : 'mirror';
  spec.risk.stopLoss = { mode: 'atr', value: r.stopAtr ?? 1.5, atrLength: 14 };
  spec.risk.takeProfit = { mode: 'rr', value: r.targetR ?? 2 };
  spec.risk.timeStopBars = r.horizonBars ?? null;
  return spec;
}
