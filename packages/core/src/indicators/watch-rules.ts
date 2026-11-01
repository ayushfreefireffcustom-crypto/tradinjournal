// Watch rules (H12): a catalogue of well-known market conditions, each an
// indicator alert in one click, with a plain-English note on what it is, why
// traders watch it and where it misleads. Custom rules get an explanation
// built from their indicator, so every alert reads as more than a formula.
import { describeOperand, type Condition, type Operand } from './conditions.js';
import { indicatorById } from './registry.js';

export type WatchCategory = 'momentum' | 'trend' | 'volatility' | 'volume';
export interface Explanation { what: string; why: string; caution: string }
export interface WatchRule {
  id: string;
  name: string;
  category: WatchCategory;
  bias: 'bullish' | 'bearish' | 'neutral';
  condition: Condition;
  timeframe: '15m' | '1h' | '4h' | '1d';
  cooldownSec: number;
  explain: Explanation;
}

const ind = (id: string, output: string, params?: Record<string, number>): Operand & { kind: 'indicator' } => ({ kind: 'indicator', id, output, ...(params ? { params } : {}) });
const val = (value: number): Operand => ({ kind: 'value', value });
const close = ind('price', 'close');

export const WATCH_RULES: WatchRule[] = [
  {
    id: 'rsi-oversold-turn', name: 'RSI turns up from oversold', category: 'momentum', bias: 'bullish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('rsi', 'value', { length: 14 }), operator: 'crosses_above', right: val(30) },
    explain: { what: 'RSI(14) climbs back above 30 after selling pushed it below.', why: 'Selling pressure has started to fade; many dip buyers wait for this turn rather than buying while RSI is still falling.', caution: 'In a strong downtrend RSI can bounce off 30 and roll over again. Check the bigger trend first.' },
  },
  {
    id: 'rsi-overbought-turn', name: 'RSI turns down from overbought', category: 'momentum', bias: 'bearish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('rsi', 'value', { length: 14 }), operator: 'crosses_below', right: val(70) },
    explain: { what: 'RSI(14) drops back below 70 after a strong run took it above.', why: 'Buying momentum is cooling; a common moment to tighten stops or take some profit.', caution: 'Strong uptrends keep RSI above 60 for a long time, and a dip below 70 is often just a pause.' },
  },
  {
    id: 'golden-cross', name: 'Golden cross', category: 'trend', bias: 'bullish', timeframe: '1d', cooldownSec: 86_400,
    condition: { left: ind('sma', 'value', { length: 50 }), operator: 'crosses_above', right: ind('sma', 'value', { length: 200 }) },
    explain: { what: 'The 50-day average moves above the 200-day average.', why: 'A widely watched sign that the longer-term trend has turned up.', caution: 'Both averages are slow, so the cross comes late, often after much of the move. It whipsaws in sideways markets.' },
  },
  {
    id: 'death-cross', name: 'Death cross', category: 'trend', bias: 'bearish', timeframe: '1d', cooldownSec: 86_400,
    condition: { left: ind('sma', 'value', { length: 50 }), operator: 'crosses_below', right: ind('sma', 'value', { length: 200 }) },
    explain: { what: 'The 50-day average falls below the 200-day average.', why: 'Read as the longer-term trend turning down; many trend followers reduce longs.', caution: 'Like the golden cross it lags, and has often marked the low of a correction rather than the start of one.' },
  },
  {
    id: 'ema-trend-up', name: 'Short-term trend turns up', category: 'trend', bias: 'bullish', timeframe: '1h', cooldownSec: 4 * 3600,
    condition: { left: ind('ema', 'value', { length: 9 }), operator: 'crosses_above', right: ind('ema', 'value', { length: 21 }) },
    explain: { what: 'The 9-bar EMA crosses above the 21-bar EMA.', why: 'Recent prices are rising faster than the slightly longer average: an early sign of a new upswing.', caution: 'Fast averages cross often; in choppy markets most of these crosses go nowhere.' },
  },
  {
    id: 'ema-trend-down', name: 'Short-term trend turns down', category: 'trend', bias: 'bearish', timeframe: '1h', cooldownSec: 4 * 3600,
    condition: { left: ind('ema', 'value', { length: 9 }), operator: 'crosses_below', right: ind('ema', 'value', { length: 21 }) },
    explain: { what: 'The 9-bar EMA crosses below the 21-bar EMA.', why: 'Recent prices are falling faster than the slightly longer average: an early sign of a pullback or downswing.', caution: 'Expect false signals when price is moving sideways.' },
  },
  {
    id: 'macd-cross-up', name: 'MACD crosses up', category: 'momentum', bias: 'bullish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('macd', 'macd', { fast: 12, slow: 26, signal: 9 }), operator: 'crosses_above', right: ind('macd', 'signal', { fast: 12, slow: 26, signal: 9 }) },
    explain: { what: 'The MACD line crosses above its signal line.', why: 'Upward momentum is building relative to the recent past.', caution: 'Crosses far below zero are counter-trend and fail more often than crosses near or above zero.' },
  },
  {
    id: 'macd-cross-down', name: 'MACD crosses down', category: 'momentum', bias: 'bearish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('macd', 'macd', { fast: 12, slow: 26, signal: 9 }), operator: 'crosses_below', right: ind('macd', 'signal', { fast: 12, slow: 26, signal: 9 }) },
    explain: { what: 'The MACD line crosses below its signal line.', why: 'Momentum is fading compared with the recent past.', caution: 'In strong uptrends MACD crosses down during normal pullbacks and quickly crosses back.' },
  },
  {
    id: 'bb-break-up', name: 'Close above the upper Bollinger Band', category: 'volatility', bias: 'neutral', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: close, operator: 'crosses_above', right: ind('bb', 'upper', { length: 20, mult: 2 }) },
    explain: { what: 'Price closes above the band two standard deviations over its 20-bar average.', why: 'An unusually strong move: either a breakout starting or a stretch that tends to snap back.', caution: 'It says the move is big, not which way it goes next. Pair it with the trend or volume.' },
  },
  {
    id: 'bb-break-down', name: 'Close below the lower Bollinger Band', category: 'volatility', bias: 'neutral', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: close, operator: 'crosses_below', right: ind('bb', 'lower', { length: 20, mult: 2 }) },
    explain: { what: 'Price closes below the band two standard deviations under its 20-bar average.', why: 'An unusually sharp drop: capitulation that can bounce, or the start of a breakdown.', caution: 'Prices can "walk the band" lower in a selloff; this alone isn’t a reason to buy.' },
  },
  {
    id: 'supertrend-up', name: 'Supertrend flips up', category: 'trend', bias: 'bullish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('supertrend', 'direction', { length: 10, mult: 3 }), operator: 'crosses_above', right: val(0) },
    explain: { what: 'The Supertrend line moves from above price to below it.', why: 'A simple trend filter turning bullish; often used as a trailing stop level for longs.', caution: 'It flips back and forth in ranges; a wider multiplier means fewer but later flips.' },
  },
  {
    id: 'supertrend-down', name: 'Supertrend flips down', category: 'trend', bias: 'bearish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('supertrend', 'direction', { length: 10, mult: 3 }), operator: 'crosses_below', right: val(0) },
    explain: { what: 'The Supertrend line moves from below price to above it.', why: 'The trend filter turning bearish; many longs use it as their exit.', caution: 'Expect flips in sideways markets that reverse within a few bars.' },
  },
  {
    id: 'adx-trend-strong', name: 'Trend gets strong (ADX above 25)', category: 'trend', bias: 'neutral', timeframe: '1d', cooldownSec: 86_400,
    condition: { left: ind('adx', 'adx', { length: 14 }), operator: 'crosses_above', right: val(25) },
    explain: { what: 'ADX(14) rises above 25.', why: 'Whatever the direction, the market has started trending rather than drifting; trend strategies tend to work better from here.', caution: 'ADX says nothing about direction. Check which way price is moving.' },
  },
  {
    id: 'volume-surge', name: 'Volume surge', category: 'volume', bias: 'neutral', timeframe: '1h', cooldownSec: 3600,
    condition: { left: ind('volume', 'value'), operator: 'crosses_above', right: ind('volsma', 'value', { length: 20 }) },
    explain: { what: 'This bar’s volume rises above its 20-bar average.', why: 'More participation than usual: moves on high volume are more likely to continue than quiet ones.', caution: 'Fires often on low timeframes and around scheduled news. Use it as confirmation, not a signal on its own.' },
  },
  {
    id: 'mfi-oversold-turn', name: 'Money flow turns up from oversold', category: 'volume', bias: 'bullish', timeframe: '4h', cooldownSec: 4 * 3600,
    condition: { left: ind('mfi', 'value', { length: 14 }), operator: 'crosses_above', right: val(20) },
    explain: { what: 'The Money Flow Index climbs back above 20.', why: 'Like RSI but weighted by volume: selling on heavy volume is easing.', caution: 'In thin markets a few large trades can swing it.' },
  },
  {
    id: 'stoch-cross-up', name: 'Stochastic crosses up', category: 'momentum', bias: 'bullish', timeframe: '1h', cooldownSec: 2 * 3600,
    condition: { left: ind('stoch', 'k', { length: 14, k: 3, d: 3 }), operator: 'crosses_above', right: ind('stoch', 'd', { length: 14, k: 3, d: 3 }) },
    explain: { what: '%K crosses above %D on the 14-bar Stochastic.', why: 'Short-term momentum turning up; most useful when it happens below 20.', caution: 'It crosses very often. Without an oversold reading or a trend filter it is mostly noise.' },
  },
];

// Params sorted by key: rules come back from Postgres JSONB with their keys reordered.
const sorted = (p: Record<string, number> | undefined) => Object.keys(p ?? {}).sort().map((k) => [k, p![k]]);
const key = (c: Condition) => JSON.stringify([c.left.id, c.left.output, sorted(c.left.params), c.operator, c.right.kind === 'value' ? c.right.value : [c.right.id, c.right.output, sorted(c.right.params)]]);
const BY_KEY = new Map(WATCH_RULES.map((r) => [key(r.condition), r]));

/** The catalogue rule a condition is, if it is one. */
export const watchRuleFor = (c: Condition): WatchRule | undefined => BY_KEY.get(key(c));

const GROUP_WHY: Record<string, string> = {
  trend: 'Trend tools help you trade with the market’s direction instead of against it.',
  oscillator: 'Momentum oscillators show when a move is stretched or starting to turn.',
  volatility: 'Volatility tools show when a move is unusually large for this market.',
  volume: 'Volume shows how much conviction is behind a move.',
  price: 'Price levels mark where buyers or sellers have stepped in before.',
};
const GROUP_CAUTION: Record<string, string> = {
  trend: 'Trend signals lag and misfire in sideways markets.',
  oscillator: 'Oscillators can stay stretched for a long time in a strong trend.',
  volatility: 'A big move says nothing about which way the next one goes.',
  volume: 'Volume spikes around news and on thin, low-timeframe charts.',
  price: 'Levels break, and a break can quickly reverse.',
};
const OP_TEXT: Record<string, string> = { gt: 'is above', gte: 'is at or above', lt: 'is below', lte: 'is at or below', eq: 'equals', crosses_above: 'crosses above', crosses_below: 'crosses below' };

/** A plain-English explanation for any alert: the catalogue's own for known rules, else one built from the indicator. */
export function explainCondition(c: Condition): Explanation {
  const rule = watchRuleFor(c);
  if (rule) return rule.explain;
  const group = indicatorById(c.left.id)?.group ?? 'price';
  const right = c.right.kind === 'value' ? String(c.right.value) : describeOperand(c.right);
  const event = c.operator.startsWith('crosses') ? `the moment ${describeOperand(c.left)} ${OP_TEXT[c.operator]} ${right}` : `whenever ${describeOperand(c.left)} ${OP_TEXT[c.operator]} ${right}`;
  return { what: `Fires on ${event}, checked at each bar close.`, why: GROUP_WHY[group] ?? GROUP_WHY.price!, caution: GROUP_CAUTION[group] ?? GROUP_CAUTION.price! };
}
