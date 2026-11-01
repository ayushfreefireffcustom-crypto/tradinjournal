// Strategy spec v2 (F1): one typed document for the builder, the backtester,
// paper and live deployments. Conditions reuse the indicator-alert operands so
// every indicator in the catalogue works everywhere.
import type { Operand, Operator } from '../indicators/conditions.js';

export const STRATEGY_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type Interval = (typeof STRATEGY_INTERVALS)[number];
export const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export const VENUES = ['delta_india', 'binance', 'bybit'] as const;
export type Venue = (typeof VENUES)[number];
/** Taker / maker fees in basis points, and the highest leverage offered. */
export const VENUE_INFO: Record<Venue, { label: string; takerBps: number; makerBps: number; maxLeverage: number }> = {
  delta_india: { label: 'Delta Exchange India', takerBps: 5, makerBps: 2, maxLeverage: 100 },
  binance: { label: 'Binance USDⓈ-M', takerBps: 5, makerBps: 2, maxLeverage: 125 },
  bybit: { label: 'Bybit USDT perpetual', takerBps: 5.5, makerBps: 2, maxLeverage: 100 },
};

export interface StrategyCondition {
  left: Operand & { kind: 'indicator' };
  operator: Operator;
  right: Operand;
  /** Look at the bar this many bars back (0 = the bar that just closed). */
  barsAgo?: number;
  /** Shift only the right-hand side further back, e.g. close above the highest high of the bars before. */
  rightBarsAgo?: number;
  /** A higher timeframe for this condition; defaults to the strategy's interval. */
  timeframe?: Interval;
}
export interface SignalGroup { match: 'all' | 'any'; conditions: StrategyCondition[] }

export interface SessionWindow { days: number[]; start: string; end: string }
export type Sizing =
  | { mode: 'risk_pct'; value: number }
  | { mode: 'equity_pct'; value: number }
  | { mode: 'qty'; value: number }
  | { mode: 'notional'; value: number }
  | { mode: 'atr'; value: number; atrLength?: number }
  | { mode: 'kelly'; value: number; kellyFraction?: number };

export interface StrategySpec {
  version: 2;
  market: {
    venue: Venue;
    instrument: 'perpetual';
    symbols: Array<{ symbol: string; leverage?: number; sizing?: Sizing }>;
    direction: 'long' | 'short' | 'both';
    marginMode: 'isolated' | 'cross';
    leverage: number;
  };
  session: { interval: Interval; timezone: string; mode: '24_7' | 'windows'; windows: SessionWindow[] };
  entry: {
    long: SignalGroup | null;
    /** 'mirror' flips the long rules (above ↔ below, RSI 30 ↔ 70). */
    short: SignalGroup | 'mirror' | null;
    /** Time trigger: only enter on bars opening at these local times ("HH:MM"); conditions then act as filters. */
    atTimes: string[] | null;
  };
  exit: { onOppositeSignal: boolean; long: SignalGroup | null; short: SignalGroup | 'mirror' | null };
  risk: {
    takeProfit: { mode: 'pct' | 'points' | 'price' | 'rr'; value: number } | null;
    stopLoss: { mode: 'pct' | 'atr' | 'points' | 'price'; value: number; atrLength?: number } | null;
    trailing: { mode: 'pct' | 'atr'; value: number; atrLength?: number; activateAtR?: number } | null;
    timeStopBars: number | null;
    partials: Array<{ atR: number; closePct: number }>;
    breakEvenAtR: number | null;
  };
  sizing: Sizing;
  advanced: {
    entryType: 'market' | 'limit';
    /** Limit entries: how far below (long) or above (short) the signal close, %. */
    limitOffsetPct: number;
    limitExpiryBars: number;
    /** Bars to wait after an exit before entering the same symbol again. */
    reentryCooldownBars: number;
    maxTradesPerDay: number | null;
  };
  limits: { dailyLossPct: number | null; maxConsecutiveLosses: number | null };
}

/** Forex-style sessions for the entry-window picker (UTC). */
export const SESSION_PRESETS: Record<'london' | 'new_york' | 'tokyo' | 'london_ny_overlap', SessionWindow> = {
  tokyo: { days: [1, 2, 3, 4, 5], start: '00:00', end: '09:00' },
  london: { days: [1, 2, 3, 4, 5], start: '07:00', end: '16:00' },
  new_york: { days: [1, 2, 3, 4, 5], start: '12:00', end: '21:00' },
  london_ny_overlap: { days: [1, 2, 3, 4, 5], start: '12:00', end: '16:00' },
};

export function defaultSpec(symbol = 'BTCUSDT'): StrategySpec {
  return {
    version: 2,
    market: { venue: 'delta_india', instrument: 'perpetual', symbols: [{ symbol }], direction: 'long', marginMode: 'isolated', leverage: 3 },
    session: { interval: '1h', timezone: 'UTC', mode: '24_7', windows: [] },
    entry: {
      long: { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 20 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 50 } } }] },
      short: null,
      atTimes: null,
    },
    exit: { onOppositeSignal: false, long: null, short: null },
    risk: { takeProfit: { mode: 'rr', value: 2 }, stopLoss: { mode: 'atr', value: 2, atrLength: 14 }, trailing: null, timeStopBars: null, partials: [], breakEvenAtR: null },
    sizing: { mode: 'risk_pct', value: 1 },
    advanced: { entryType: 'market', limitOffsetPct: 0.2, limitExpiryBars: 3, reentryCooldownBars: 0, maxTradesPerDay: null },
    limits: { dailyLossPct: null, maxConsecutiveLosses: null },
  };
}

const FLIP: Record<Operator, Operator> = { gt: 'lt', gte: 'lte', lt: 'gt', lte: 'gte', eq: 'eq', crosses_above: 'crosses_below', crosses_below: 'crosses_above' };
// Oscillators with a fixed range mirror around their midpoint.
const MID: Record<string, number> = { rsi: 50, stoch: 50, stochrsi: 50, mfi: 50, uo: 50, adx: 50, willr: -50, cci: 0, roc: 0, mom: 0, ao: 0, macd: 0, cmf: 0 };

/** The short-side version of a long rule set. */
export function mirrorGroup(g: SignalGroup): SignalGroup {
  return {
    match: g.match,
    conditions: g.conditions.map((c) => {
      const mid = MID[c.left.id];
      const right = c.right.kind === 'value' && mid != null ? { kind: 'value' as const, value: 2 * mid - c.right.value } : c.right;
      return { ...c, operator: FLIP[c.operator], right };
    }),
  };
}

export const resolveShort = (g: SignalGroup | 'mirror' | null, long: SignalGroup | null) => (g === 'mirror' ? (long ? mirrorGroup(long) : null) : g);
