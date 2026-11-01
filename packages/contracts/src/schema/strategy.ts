// Strategy spec v2 (Part F) over the wire. Mirrors the types in
// @tradinjournal/core/strategy; the API checks the two stay in step.
import { z } from 'zod';

export const STRATEGY_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export const STRATEGY_VENUES = ['delta_india', 'binance', 'bybit'] as const;
const OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'crosses_above', 'crosses_below'] as const;
const num = z.number().finite();
const params = z.record(z.string().max(32), num).optional();
const indicator = z.object({ kind: z.literal('indicator'), id: z.string().min(1).max(32), output: z.string().min(1).max(32), params }).strict();
const operand = z.discriminatedUnion('kind', [indicator, z.object({ kind: z.literal('value'), value: num }).strict()]);
const condition = z.object({
  left: indicator,
  operator: z.enum(OPS),
  right: operand,
  barsAgo: z.number().int().min(0).max(200).optional(),
  rightBarsAgo: z.number().int().min(0).max(200).optional(),
  timeframe: z.enum(STRATEGY_INTERVALS).optional(),
}).strict();
const group = z.object({ match: z.enum(['all', 'any']), conditions: z.array(condition).max(12) }).strict();
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30.');
const sizing = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('risk_pct'), value: num }).strict(),
  z.object({ mode: z.literal('equity_pct'), value: num }).strict(),
  z.object({ mode: z.literal('qty'), value: num }).strict(),
  z.object({ mode: z.literal('notional'), value: num }).strict(),
  z.object({ mode: z.literal('atr'), value: num, atrLength: z.number().int().min(1).max(500).optional() }).strict(),
  z.object({ mode: z.literal('kelly'), value: num, kellyFraction: z.number().min(0.05).max(1).optional() }).strict(),
]);

export const strategySpecSchema = z.object({
  version: z.literal(2),
  market: z.object({
    venue: z.enum(STRATEGY_VENUES),
    instrument: z.literal('perpetual'),
    symbols: z.array(z.object({ symbol: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9]{2,30}$/)), leverage: num.optional(), sizing: sizing.optional() }).strict()).max(20),
    direction: z.enum(['long', 'short', 'both']),
    marginMode: z.enum(['isolated', 'cross']),
    leverage: num,
  }).strict(),
  session: z.object({
    interval: z.enum(STRATEGY_INTERVALS),
    timezone: z.string().min(1).max(64),
    mode: z.enum(['24_7', 'windows']),
    windows: z.array(z.object({ days: z.array(z.number().int().min(0).max(6)).max(7), start: hm, end: hm }).strict()).max(10),
  }).strict(),
  entry: z.object({ long: group.nullable(), short: z.union([group, z.literal('mirror')]).nullable(), atTimes: z.array(hm).max(24).nullable() }).strict(),
  exit: z.object({ onOppositeSignal: z.boolean(), long: group.nullable(), short: z.union([group, z.literal('mirror')]).nullable() }).strict(),
  risk: z.object({
    takeProfit: z.object({ mode: z.enum(['pct', 'points', 'price', 'rr']), value: num }).strict().nullable(),
    stopLoss: z.object({ mode: z.enum(['pct', 'atr', 'points', 'price']), value: num, atrLength: z.number().int().min(1).max(500).optional() }).strict().nullable(),
    trailing: z.object({ mode: z.enum(['pct', 'atr']), value: num, atrLength: z.number().int().min(1).max(500).optional(), activateAtR: num.optional() }).strict().nullable(),
    timeStopBars: z.number().int().min(1).max(10_000).nullable(),
    partials: z.array(z.object({ atR: num, closePct: num }).strict()).max(5),
    breakEvenAtR: num.nullable(),
  }).strict(),
  sizing,
  advanced: z.object({
    entryType: z.enum(['market', 'limit']),
    limitOffsetPct: num,
    limitExpiryBars: z.number().int().min(1).max(500),
    reentryCooldownBars: z.number().int().min(0).max(10_000),
    maxTradesPerDay: z.number().int().min(1).max(500).nullable(),
  }).strict(),
  limits: z.object({ dailyLossPct: num.nullable(), maxConsecutiveLosses: z.number().int().min(1).max(100).nullable() }).strict(),
}).strict();
export type StrategySpecDto = z.infer<typeof strategySpecSchema>;

export const createStrategySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  spec: strategySpecSchema.optional(),
}).strict();
export const updateStrategySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  spec: strategySpecSchema.optional(),
  /** Why the rules changed, kept with the version. */
  note: z.string().trim().max(200).optional(),
  baselineBacktestId: z.string().max(40).nullable().optional(),
  status: z.enum(['draft', 'archived']).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export const backtestParamsSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  capital: z.number().min(100).max(100_000_000),
  slippageBps: z.number().min(0).max(500),
  fees: z.object({ takerBps: z.number().min(0).max(100), makerBps: z.number().min(-10).max(100) }).strict().optional(),
}).strict();
export type BacktestParamsDto = z.infer<typeof backtestParamsSchema>;
export const previewBacktestSchema = z.object({ spec: strategySpecSchema, params: backtestParamsSchema }).strict();
export const generateStrategySchema = z.object({
  prompt: z.string().trim().min(10).max(1000),
  symbol: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9]{2,30}$/)),
  interval: z.enum(STRATEGY_INTERVALS),
}).strict();
