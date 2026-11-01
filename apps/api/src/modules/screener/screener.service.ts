// Screener (E5/E6): run filter groups over the most-traded crypto pairs.
// Indicator filters are the same conditions as indicator alerts, evaluated on
// the last closed bar so results don't flicker with the forming candle.
// Filters inside a group are ANDed; groups are ORed. Candles come from the
// shared market cache, one load per symbol, a few at a time.
import { createHash } from 'node:crypto';
import { prisma } from '@tradinjournal/db';
import {
  conditionWarmup,
  describeOperand,
  evaluateCondition,
  indicatorById,
  resolveParams,
  validateCondition,
  type Condition,
  type Operand,
  type TraderCandle as Candle,
} from '@tradinjournal/core';
import type { SaveScreenInput, ScreenDefinition, ScreenerFilter, UpdateScreenInput } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { loadFunding, loadUniverse, type FundingMap, type UniverseRow } from './universe.js';
import { assertWithinLimit } from '../../lib/plans.js';

const TF_MS: Record<string, number> = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const MAX_BARS = 1000;
const BUCKETS = [100, 300, 600, MAX_BARS];
const CONCURRENCY = 8;
const RESULT_TTL = 60;
export const MAX_SAVED_SCREENS = 20;

export interface ScreenerDeps {
  universe: (size: number) => Promise<UniverseRow[]>;
  funding: () => Promise<FundingMap>;
  loadCandles: (symbol: string, tf: string, limit: number) => Promise<Candle[]>;
  now: () => number;
  /** Result cache; tests turn it off. */
  cache: boolean;
}
export const defaultScreenerDeps: ScreenerDeps = {
  universe: loadUniverse,
  funding: loadFunding,
  loadCandles: (s, tf, limit) => loadPublicCandles(s, tf as never, limit),
  now: () => Date.now(),
  cache: true,
};

export interface ScreenColumn { key: string; label: string }
export interface ScreenRow {
  symbol: string;
  base: string;
  price: number;
  change24h: number;
  volume24h: number;
  funding: number | null;
  /** Open interest in USDT on the perpetual (Bybit), when there is one. */
  openInterest: number | null;
  /** One value per indicator column, at the last closed bar. */
  values: Array<number | null>;
}
export interface ScreenResult {
  timeframe: string;
  asOf: string;
  barTime: string | null;
  universe: number;
  scanned: number;
  matched: number;
  noData: string[];
  fundingSource: FundingMap['source'];
  columns: ScreenColumn[];
  rows: ScreenRow[];
}

const operandKey = (o: Operand & { kind: 'indicator' }) => {
  const spec = indicatorById(o.id);
  const p = spec ? resolveParams(spec, o.params ?? {}) : {};
  return `${o.id}:${o.output}:${JSON.stringify(p)}`;
};
const asCondition = (f: ScreenerFilter & { type: 'indicator' }): Condition => ({ left: f.left, operator: f.operator, right: f.right }) as Condition;

/** Checks every indicator filter makes sense; returns the history it needs. */
export function checkDefinition(def: ScreenDefinition): number {
  let need = 0;
  for (const g of def.groups) {
    for (const f of g) {
      if (f.type !== 'indicator') continue;
      try {
        validateCondition(asCondition(f));
      } catch (err) {
        if (err instanceof RangeError) throw new ValidationError(err.message);
        throw err;
      }
      need = Math.max(need, conditionWarmup(asCondition(f)));
    }
  }
  for (const c of def.columns ?? []) {
    if (!indicatorById(c.id)?.outputs.some((o) => o.key === c.output)) throw new ValidationError(`Unknown column ${c.id}/${c.output}.`);
    try {
      need = Math.max(need, conditionWarmup({ left: c, operator: 'gt', right: { kind: 'value', value: 0 } } as Condition));
    } catch (err) {
      if (err instanceof RangeError) throw new ValidationError(err.message);
      throw err;
    }
  }
  if (need > MAX_BARS) throw new ValidationError(`That needs ${need} bars of history; at most ${MAX_BARS} are loaded. Use shorter lengths.`);
  return need;
}

/** Indicator columns: every indicator a filter uses, then the extra columns, without repeats. */
export function columnsOf(def: ScreenDefinition): Array<{ key: string; operand: Operand & { kind: 'indicator' }; label: string }> {
  const out = new Map<string, { key: string; operand: Operand & { kind: 'indicator' }; label: string }>();
  const add = (o: Operand) => {
    if (o.kind !== 'indicator' || (o.id === 'price' && o.output === 'close')) return; // close is the price column
    const key = operandKey(o);
    if (!out.has(key)) out.set(key, { key, operand: o, label: describeOperand(o) });
  };
  for (const g of def.groups) for (const f of g) if (f.type === 'indicator') { add(f.left); add(f.right); }
  for (const c of def.columns ?? []) add(c);
  return [...out.values()].slice(0, 8);
}

const FIELD_OPS: Record<string, (a: number, b: number) => boolean> = { gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b };

/** Funding for a Binance symbol; Bybit lists some small coins per 1000 (1000PEPEUSDT). */
export const fundingFor = (f: FundingMap, symbol: string) => f.rates.get(symbol) ?? f.rates.get(`1000${symbol}`) ?? null;
export const oiFor = (f: FundingMap, symbol: string) => f.oi?.get(symbol) ?? f.oi?.get(`1000${symbol}`) ?? null;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

const SORTS: Record<string, (r: ScreenRow) => number | string | null> = {
  symbol: (r) => r.symbol, price: (r) => r.price, change24h: (r) => r.change24h, volume24h: (r) => r.volume24h, funding: (r) => r.funding, openInterest: (r) => r.openInterest,
};

export async function runScreen(def: ScreenDefinition, deps = defaultScreenerDeps): Promise<ScreenResult> {
  const need = checkDefinition(def);
  const cacheKey = `screener:run:${createHash('sha1').update(JSON.stringify(def)).digest('hex')}`;
  if (deps.cache) {
    const hit = await cacheGet<ScreenResult>(cacheKey);
    if (hit) return hit;
  }
  const now = deps.now();
  const tfMs = TF_MS[def.timeframe]!;
  const cols = columnsOf(def);
  const usesIndicators = cols.length > 0 || def.groups.some((g) => g.some((f) => f.type === 'indicator'));
  const [universe, funding] = await Promise.all([
    deps.universe(def.universe),
    deps.funding().catch((): FundingMap => ({ source: null, rates: new Map() })),
  ]);
  const limit = BUCKETS.find((b) => b >= need + 5) ?? MAX_BARS;

  const noData: string[] = [];
  let barTime: number | null = null;
  const evaluated = await pool(universe, CONCURRENCY, async (u): Promise<ScreenRow | null> => {
    const fund = fundingFor(funding, u.symbol);
    const oi = oiFor(funding, u.symbol);
    let closed: Candle[] = [];
    if (usesIndicators) {
      try {
        const all = await deps.loadCandles(u.symbol, def.timeframe, limit);
        let end = all.length;
        while (end > 0 && all[end - 1]!.openTime + tfMs > now) end -= 1;
        closed = all.slice(0, end);
      } catch {
        closed = [];
      }
      if (!closed.length) { noData.push(u.symbol); return null; }
      barTime = Math.max(barTime ?? 0, closed.at(-1)!.openTime);
    }
    const series = new Map<string, Array<number | null>>();
    const valueOf = (o: Operand & { kind: 'indicator' }): number | null => {
      const k = operandKey(o);
      if (!series.has(k)) {
        const spec = indicatorById(o.id)!;
        series.set(k, spec.compute(closed, resolveParams(spec, o.params ?? {}))[o.output] ?? []);
      }
      return series.get(k)!.at(-1) ?? null;
    };
    const fieldValue = (f: ScreenerFilter & { type: 'field' }) => (f.field === 'funding' ? fund : f.field === 'openInterest' ? oi : f.field === 'price' ? u.price : f.field === 'change24h' ? u.change24h : u.volume24h);
    const passes = (g: ScreenerFilter[]) => g.every((f) => {
      if (f.type === 'field') {
        const v = fieldValue(f);
        return v != null && FIELD_OPS[f.operator]!(v, f.value);
      }
      return evaluateCondition(asCondition(f), closed).met === true;
    });
    // No groups = everything matches (a plain ranking such as top gainers).
    const nonEmpty = def.groups.filter((g) => g.length > 0);
    if (nonEmpty.length && !nonEmpty.some(passes)) return null;
    return { symbol: u.symbol, base: u.base, price: u.price, change24h: u.change24h, volume24h: u.volume24h, funding: fund, openInterest: oi, values: cols.map((c) => valueOf(c.operand)) };
  });
  const rows = evaluated.filter((r): r is ScreenRow => r !== null);

  // Sort: a field, or col:<i>. Unknowns always last.
  const by = def.sort?.by ?? 'volume24h';
  const dir = def.sort?.dir === 'asc' ? 1 : -1;
  const colIdx = by.startsWith('col:') ? Number(by.slice(4)) : -1;
  const get = colIdx >= 0 ? (r: ScreenRow) => r.values[colIdx] ?? null : SORTS[by] ?? SORTS.volume24h!;
  rows.sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * dir;
  });

  const result: ScreenResult = {
    timeframe: def.timeframe,
    asOf: new Date(now).toISOString(),
    barTime: barTime != null ? new Date(barTime).toISOString() : null,
    universe: universe.length,
    scanned: universe.length - noData.length,
    matched: rows.length,
    noData: noData.sort(),
    fundingSource: funding.source,
    columns: cols.map((c) => ({ key: c.key, label: c.label })),
    rows,
  };
  if (deps.cache) await cacheSet(cacheKey, result, RESULT_TTL);
  return result;
}

// ── Saved screens ─────────────────────────────────────────────────────────────

const screenDto = (s: { id: string; name: string; definition: unknown; createdAt: Date; updatedAt: Date }) => ({
  id: s.id, name: s.name, definition: s.definition as ScreenDefinition, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
});

export async function listScreens(userId: string) {
  return (await prisma.savedScreen.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })).map(screenDto);
}

export async function saveScreen(userId: string, input: SaveScreenInput) {
  checkDefinition(input.definition);
  await assertWithinLimit(userId, 'savedScreens', await prisma.savedScreen.count({ where: { userId } }), 'Delete one to save another.');
  return screenDto(await prisma.savedScreen.create({ data: { userId, name: input.name, definition: input.definition as object } }));
}

export async function updateScreen(userId: string, id: string, input: UpdateScreenInput) {
  if (input.definition) checkDefinition(input.definition);
  const res = await prisma.savedScreen.updateMany({ where: { id, userId }, data: { ...(input.name ? { name: input.name } : {}), ...(input.definition ? { definition: input.definition as object } : {}) } });
  if (res.count === 0) throw new NotFoundError('Screen not found');
  return screenDto(await prisma.savedScreen.findUniqueOrThrow({ where: { id } }));
}

export async function deleteScreen(userId: string, id: string) {
  const res = await prisma.savedScreen.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new NotFoundError('Screen not found');
  return { ok: true };
}
