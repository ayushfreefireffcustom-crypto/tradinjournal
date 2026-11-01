// Technical rating (E7): a Strong Sell … Strong Buy summary from two groups of
// votes, each shown with its reason so the rating is never a black box.
//   Moving averages: price above the average is a buy, below is a sell.
//   Oscillators: a buy or sell only at an extreme that is turning, or on a
//   momentum signal; otherwise neutral.
// Each group scores (buys − sells) / votes cast, from −1 to 1; the summary is
// the mean of the two. Indicators without enough history don't vote.
// Pure: pass closed bars, oldest first.
import type { Candle } from '../trader/types.js';
import { classifyTrend } from '../trader/indicators.js';
import * as s from './series.js';

export type Vote = 1 | 0 | -1;
export type RatingLabel = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';
export interface RatingComponent { name: string; value: number | null; vote: Vote; reason: string }
export interface RatingGroup { score: number | null; label: RatingLabel | null; buy: number; sell: number; neutral: number; components: RatingComponent[] }
export interface Rating { score: number | null; label: RatingLabel | null; ma: RatingGroup; osc: RatingGroup; price: number | null }

export const RATING_LABELS: Record<RatingLabel, string> = { strong_sell: 'Strong sell', sell: 'Sell', neutral: 'Neutral', buy: 'Buy', strong_buy: 'Strong buy' };

/** −1…1 to a label: beyond ±0.5 is strong, within ±0.1 is neutral. */
export function ratingLabel(score: number): RatingLabel {
  if (score > 0.5) return 'strong_buy';
  if (score > 0.1) return 'buy';
  if (score < -0.5) return 'strong_sell';
  if (score < -0.1) return 'sell';
  return 'neutral';
}

const last = (x: Array<number | null>, back = 0) => x[x.length - 1 - back] ?? null;

function group(components: RatingComponent[]): RatingGroup {
  const cast = components.filter((c) => c.value != null);
  const buy = cast.filter((c) => c.vote === 1).length;
  const sell = cast.filter((c) => c.vote === -1).length;
  const score = cast.length ? (buy - sell) / cast.length : null;
  return { score, label: score == null ? null : ratingLabel(score), buy, sell, neutral: cast.length - buy - sell, components };
}

/** A vote that needs this bar and the one before; null when either is missing. */
function turning(now: number | null, prev: number | null): { now: number; up: boolean; down: boolean } | null {
  if (now == null || prev == null) return null;
  return { now, up: now > prev, down: now < prev };
}

const none = (name: string): RatingComponent => ({ name, value: null, vote: 0, reason: 'Not enough history' });

export function rateCandles(candles: Candle[]): Rating {
  const close = candles.map((c) => c.close);
  const price = close.at(-1) ?? null;
  if (price == null) return { score: null, label: null, ma: group([]), osc: group([]), price: null };

  // ── Moving averages ─────────────────────────────────────────────────────────
  const maVote = (name: string, v: number | null): RatingComponent => {
    if (v == null) return none(name);
    return price > v ? { name, value: v, vote: 1, reason: 'Price above' } : price < v ? { name, value: v, vote: -1, reason: 'Price below' } : { name, value: v, vote: 0, reason: 'Price on it' };
  };
  const ma: RatingComponent[] = [];
  for (const n of [10, 20, 30, 50, 100, 200]) {
    ma.push(maVote(`EMA (${n})`, last(s.ema(close, n))));
    ma.push(maVote(`SMA (${n})`, last(s.sma(close, n))));
  }
  ma.push(maVote('VWMA (20)', last(s.vwma(candles, 20))));
  ma.push(maVote('Hull MA (9)', last(s.hma(close, 9))));
  {
    const ich = s.ichimoku(candles);
    const a = last(ich.spanA);
    const b = last(ich.spanB);
    const t = last(ich.tenkan);
    const k = last(ich.kijun);
    if (a == null || b == null || t == null || k == null) ma.push(none('Ichimoku (9, 26, 52)'));
    else if (price > Math.max(a, b) && t > k) ma.push({ name: 'Ichimoku (9, 26, 52)', value: k, vote: 1, reason: 'Above the cloud, Tenkan over Kijun' });
    else if (price < Math.min(a, b) && t < k) ma.push({ name: 'Ichimoku (9, 26, 52)', value: k, vote: -1, reason: 'Below the cloud, Tenkan under Kijun' });
    else ma.push({ name: 'Ichimoku (9, 26, 52)', value: k, vote: 0, reason: 'Mixed' });
  }
  {
    // SignalX's own trend read (EMA 20/50 with a minimum spread).
    const e20 = last(s.ema(close, 20));
    const e50 = last(s.ema(close, 50));
    if (e20 == null || e50 == null) ma.push(none('SignalX trend (EMA 20/50)'));
    else {
      const t = classifyTrend(price, e20, e50);
      ma.push({ name: 'SignalX trend (EMA 20/50)', value: e20 - e50, vote: t === 'up' ? 1 : t === 'down' ? -1 : 0, reason: t === 'up' ? 'Uptrend' : t === 'down' ? 'Downtrend' : 'Range' });
    }
  }

  // ── Oscillators ─────────────────────────────────────────────────────────────
  const osc: RatingComponent[] = [];
  {
    const r = s.rsi(close, 14);
    const t = turning(last(r), last(r, 1));
    osc.push(!t ? none('RSI (14)')
      : t.now < 30 && t.up ? { name: 'RSI (14)', value: t.now, vote: 1, reason: 'Oversold, turning up' }
      : t.now > 70 && t.down ? { name: 'RSI (14)', value: t.now, vote: -1, reason: 'Overbought, turning down' }
      : { name: 'RSI (14)', value: t.now, vote: 0, reason: t.now < 30 ? 'Oversold, still falling' : t.now > 70 ? 'Overbought, still rising' : 'Between 30 and 70' });
  }
  {
    const st = s.stochastic(candles, 14, 3, 3);
    const k = last(st.k);
    const d = last(st.d);
    osc.push(k == null || d == null ? none('Stochastic %K (14, 3, 3)')
      : k < 20 && k > d ? { name: 'Stochastic %K (14, 3, 3)', value: k, vote: 1, reason: 'Below 20, %K over %D' }
      : k > 80 && k < d ? { name: 'Stochastic %K (14, 3, 3)', value: k, vote: -1, reason: 'Above 80, %K under %D' }
      : { name: 'Stochastic %K (14, 3, 3)', value: k, vote: 0, reason: 'No extreme cross' });
  }
  {
    const c = s.cci(candles, 20);
    const t = turning(last(c), last(c, 1));
    osc.push(!t ? none('CCI (20)')
      : t.now < -100 && t.up ? { name: 'CCI (20)', value: t.now, vote: 1, reason: 'Below −100, turning up' }
      : t.now > 100 && t.down ? { name: 'CCI (20)', value: t.now, vote: -1, reason: 'Above 100, turning down' }
      : { name: 'CCI (20)', value: t.now, vote: 0, reason: 'No turn at an extreme' });
  }
  {
    const a = s.adx(candles, 14);
    const t = turning(last(a.adx), last(a.adx, 1));
    const p = last(a.plusDi);
    const m = last(a.minusDi);
    osc.push(!t || p == null || m == null ? none('ADX (14)')
      : t.now > 20 && t.up && p > m ? { name: 'ADX (14)', value: t.now, vote: 1, reason: 'Strengthening, +DI leads' }
      : t.now > 20 && t.up && m > p ? { name: 'ADX (14)', value: t.now, vote: -1, reason: 'Strengthening, −DI leads' }
      : { name: 'ADX (14)', value: t.now, vote: 0, reason: t.now <= 20 ? 'Weak trend' : 'Trend fading' });
  }
  {
    const ao = s.awesome(candles);
    const t = turning(last(ao), last(ao, 1));
    osc.push(!t ? none('Awesome oscillator')
      : t.now > 0 && t.up ? { name: 'Awesome oscillator', value: t.now, vote: 1, reason: 'Above zero, rising' }
      : t.now < 0 && t.down ? { name: 'Awesome oscillator', value: t.now, vote: -1, reason: 'Below zero, falling' }
      : { name: 'Awesome oscillator', value: t.now, vote: 0, reason: 'Losing momentum' });
  }
  {
    const mo = s.momentum(close, 10);
    const t = turning(last(mo), last(mo, 1));
    osc.push(!t ? none('Momentum (10)')
      : t.up ? { name: 'Momentum (10)', value: t.now, vote: 1, reason: 'Rising' }
      : t.down ? { name: 'Momentum (10)', value: t.now, vote: -1, reason: 'Falling' }
      : { name: 'Momentum (10)', value: t.now, vote: 0, reason: 'Flat' });
  }
  {
    const m = s.macd(close, 12, 26, 9);
    const v = last(m.macd);
    const sig = last(m.signal);
    osc.push(v == null || sig == null ? none('MACD (12, 26, 9)')
      : v > sig ? { name: 'MACD (12, 26, 9)', value: v, vote: 1, reason: 'Above its signal line' }
      : v < sig ? { name: 'MACD (12, 26, 9)', value: v, vote: -1, reason: 'Below its signal line' }
      : { name: 'MACD (12, 26, 9)', value: v, vote: 0, reason: 'On its signal line' });
  }
  {
    const sr = s.stochRsi(close, 14, 14, 3, 3);
    const k = last(sr.k);
    const d = last(sr.d);
    osc.push(k == null || d == null ? none('Stoch RSI (3, 3, 14, 14)')
      : k < 20 && k > d ? { name: 'Stoch RSI (3, 3, 14, 14)', value: k, vote: 1, reason: 'Below 20, %K over %D' }
      : k > 80 && k < d ? { name: 'Stoch RSI (3, 3, 14, 14)', value: k, vote: -1, reason: 'Above 80, %K under %D' }
      : { name: 'Stoch RSI (3, 3, 14, 14)', value: k, vote: 0, reason: 'No extreme cross' });
  }
  {
    const w = s.williamsR(candles, 14);
    const t = turning(last(w), last(w, 1));
    osc.push(!t ? none('Williams %R (14)')
      : t.now < -80 && t.up ? { name: 'Williams %R (14)', value: t.now, vote: 1, reason: 'Oversold, turning up' }
      : t.now > -20 && t.down ? { name: 'Williams %R (14)', value: t.now, vote: -1, reason: 'Overbought, turning down' }
      : { name: 'Williams %R (14)', value: t.now, vote: 0, reason: 'No turn at an extreme' });
  }
  {
    const u = last(s.ultimate(candles, 7, 14, 28));
    osc.push(u == null ? none('Ultimate oscillator (7, 14, 28)')
      : u > 70 ? { name: 'Ultimate oscillator (7, 14, 28)', value: u, vote: 1, reason: 'Above 70' }
      : u < 30 ? { name: 'Ultimate oscillator (7, 14, 28)', value: u, vote: -1, reason: 'Below 30' }
      : { name: 'Ultimate oscillator (7, 14, 28)', value: u, vote: 0, reason: 'Between 30 and 70' });
  }

  const g1 = group(ma);
  const g2 = group(osc);
  const parts = [g1.score, g2.score].filter((x): x is number => x != null);
  const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  return { score, label: score == null ? null : ratingLabel(score), ma: g1, osc: g2, price };
}

/** Bars a full rating needs: SMA 200 plus a bar to compare. */
export const RATING_BARS = 201;
