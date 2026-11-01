// Strategies (Part F): the v2 spec, versions, backtests and the AI generator.
// Trader Master strategies are imported into the v2 format the first time
// someone opens their strategies; the originals are left untouched.
import { createHash } from 'node:crypto';
import { prisma, type Strategy } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import {
  defaultSpec, describeStrategy, fromLegacy, INDICATORS, INTERVAL_MS, runBacktest, validateStrategy,
  type BacktestResult, type LegacyRules, type StrategySpec, type TraderCandle as Candle,
} from '@tradinjournal/core';
import { strategySpecSchema, type BacktestParamsDto } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { AiUnavailableError, ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { loadPublicCandlesWindow } from '../market/market.service.js';

export const MAX_STRATEGIES = 100;
const MAX_BARS = 20_000;
const PAGE = 1000;

export interface StrategyDeps {
  candles: (symbol: string, tf: string, fromMs: number, toMs: number, limit: number) => Promise<Candle[]>;
  now: () => number;
  ai: () => boolean;
  generate: (messages: ChatMessage[]) => Promise<unknown>;
}
export const defaultStrategyDeps: StrategyDeps = {
  candles: (s, tf, f, t, limit) => loadPublicCandlesWindow(s, tf as never, f, t, limit),
  now: () => Date.now(),
  ai: isAiEnabled,
  generate: (m) => getProvider().json(m, GENERATE_SCHEMA, { effort: 'medium', maxTokens: 6000 }),
};

const specOf = (s: Pick<Strategy, 'spec'>) => s.spec as unknown as StrategySpec;
/** JSON with object keys sorted: Postgres JSONB reorders keys, so plain JSON text can't be compared. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const sameSpec = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Parse and check a spec from anywhere (client, AI, legacy). Throws a readable 422. */
export function parseSpec(raw: unknown): StrategySpec {
  const r = strategySpecSchema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new ValidationError(`Strategy isn’t valid${first ? ` at ${first.path.join('.')}: ${first.message}` : ''}.`);
  }
  return r.data as StrategySpec;
}

export function inspect(spec: StrategySpec) {
  return { validation: validateStrategy(spec), readback: describeStrategy(spec) };
}

// ── Legacy import ─────────────────────────────────────────────────────────────

export async function importLegacy(userId: string): Promise<number> {
  const legacy = await prisma.traderStrategy.findMany({ where: { userId, status: { not: 'archived' } } });
  if (!legacy.length) return 0;
  const done = new Set((await prisma.strategy.findMany({ where: { legacyId: { in: legacy.map((l) => l.id) } }, select: { legacyId: true } })).map((x) => x.legacyId));
  let n = 0;
  for (const l of legacy.filter((x) => !done.has(x.id))) {
    try {
      const spec = fromLegacy(l.rules as unknown as LegacyRules);
      await prisma.strategy.create({
        data: {
          userId, name: l.name, description: l.prompt.slice(0, 500), spec: spec as object, source: 'legacy', legacyId: l.id,
          versions: { create: { version: 1, spec: spec as object, note: 'Imported from Trader Master' } },
        },
      });
      n += 1;
    } catch (err) {
      // A race with another request is fine (legacyId is unique); anything else is logged.
      if (!String((err as Error).message).includes('Unique constraint')) logger.warn(`[strategies] legacy import ${l.id} failed: ${(err as Error).message}`);
    }
  }
  return n;
}

// ── CRUD and versions ─────────────────────────────────────────────────────────

export async function listStrategies(userId: string) {
  await importLegacy(userId);
  const rows = await prisma.strategy.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  const latest = await prisma.strategyBacktest.findMany({
    where: { strategyId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: 'desc' },
    distinct: ['strategyId'],
    select: { strategyId: true, metrics: true, createdAt: true, version: true },
  });
  const byId = new Map(latest.map((b) => [b.strategyId, b]));
  return rows.map((r) => {
    const spec = specOf(r);
    const v = validateStrategy(spec);
    return {
      id: r.id, name: r.name, description: r.description, status: r.status, source: r.source, version: r.version,
      symbols: spec.market.symbols.map((s) => s.symbol), interval: spec.session.interval, direction: spec.market.direction,
      blockers: v.blockers.length, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      lastBacktest: byId.get(r.id) ? { metrics: byId.get(r.id)!.metrics, at: byId.get(r.id)!.createdAt.toISOString(), version: byId.get(r.id)!.version } : null,
    };
  });
}

async function own(userId: string, id: string) {
  const s = await prisma.strategy.findFirst({ where: { id, userId } });
  if (!s) throw new NotFoundError('Strategy not found');
  return s;
}

export async function getStrategy(userId: string, id: string) {
  const s = await own(userId, id);
  const [versions, backtests] = await Promise.all([
    prisma.strategyVersion.findMany({ where: { strategyId: id }, orderBy: { version: 'desc' }, select: { version: true, note: true, createdAt: true } }),
    prisma.strategyBacktest.findMany({ where: { strategyId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, version: true, params: true, metrics: true, createdAt: true } }),
  ]);
  return {
    id: s.id, name: s.name, description: s.description, status: s.status, source: s.source, version: s.version, baselineBacktestId: s.baselineBacktestId,
    spec: specOf(s), ...inspect(specOf(s)),
    versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    backtests: backtests.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

export async function createStrategy(userId: string, input: { name: string; description?: string; spec?: unknown }, source: 'manual' | 'ai' = 'manual') {
  if ((await prisma.strategy.count({ where: { userId, status: { not: 'archived' } } })) >= MAX_STRATEGIES) throw new ConflictError(`You can keep up to ${MAX_STRATEGIES} strategies. Archive one first.`);
  const spec = input.spec ? parseSpec(input.spec) : defaultSpec();
  const s = await prisma.strategy.create({
    data: { userId, name: input.name, description: input.description ?? null, spec: spec as object, source, versions: { create: { version: 1, spec: spec as object, note: source === 'ai' ? 'Generated by AI' : 'Created' } } },
  });
  return getStrategy(userId, s.id);
}

export async function updateStrategy(userId: string, id: string, input: { name?: string; description?: string | null; spec?: unknown; note?: string; baselineBacktestId?: string | null; status?: 'draft' | 'archived' }) {
  const s = await own(userId, id);
  if (s.status === 'live' && input.status === 'archived') throw new ConflictError('Stop the live deployment before archiving.');
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;
  if (input.baselineBacktestId !== undefined) {
    if (input.baselineBacktestId && !(await prisma.strategyBacktest.findFirst({ where: { id: input.baselineBacktestId, strategyId: id } }))) throw new NotFoundError('Backtest not found');
    data.baselineBacktestId = input.baselineBacktestId;
  }
  if (input.spec !== undefined) {
    const spec = parseSpec(input.spec);
    if (!sameSpec(spec, s.spec)) {
      // Rule edits are a new version; open trades keep the rules they started with.
      const version = s.version + 1;
      await prisma.$transaction([
        prisma.strategyVersion.create({ data: { strategyId: id, version, spec: spec as object, note: input.note ?? null } }),
        prisma.strategy.update({ where: { id }, data: { ...data, spec: spec as object, version } }),
      ]);
      return getStrategy(userId, id);
    }
  }
  if (Object.keys(data).length) await prisma.strategy.update({ where: { id }, data });
  return getStrategy(userId, id);
}

export async function restoreVersion(userId: string, id: string, version: number) {
  await own(userId, id);
  const v = await prisma.strategyVersion.findUnique({ where: { strategyId_version: { strategyId: id, version } } });
  if (!v) throw new NotFoundError('Version not found');
  return updateStrategy(userId, id, { spec: v.spec, note: `Restored version ${version}` });
}

export async function duplicateStrategy(userId: string, id: string) {
  const s = await own(userId, id);
  return createStrategy(userId, { name: `${s.name} (copy)`.slice(0, 80), description: s.description ?? undefined, spec: s.spec });
}

// ── Backtests ─────────────────────────────────────────────────────────────────

/** Candles for [fromMs, toMs], paged 1000 at a time, oldest first, no repeats. */
async function loadRange(symbol: string, tf: string, fromMs: number, toMs: number, deps: StrategyDeps): Promise<Candle[]> {
  const ms = INTERVAL_MS[tf as keyof typeof INTERVAL_MS];
  const out = new Map<number, Candle>();
  for (let start = fromMs; start <= toMs; start += PAGE * ms) {
    const end = Math.min(toMs, start + (PAGE - 1) * ms);
    const page = await deps.candles(symbol, tf, start, end, PAGE);
    for (const c of page) if (c.openTime >= fromMs && c.openTime <= toMs) out.set(c.openTime, c);
    if (out.size > MAX_BARS * 1.2) break;
  }
  return [...out.values()].sort((a, b) => a.openTime - b.openTime);
}

export interface BacktestRun { result: BacktestResult; params: BacktestParamsDto; hash: string; cached: boolean; validation: ReturnType<typeof validateStrategy> }

export async function backtestSpec(spec: StrategySpec, params: BacktestParamsDto, deps = defaultStrategyDeps): Promise<BacktestRun> {
  const validation = validateStrategy(spec);
  if (validation.blockers.length) throw new ValidationError(`Fix this first: ${validation.blockers[0]!.message}`);
  const from = Date.parse(params.from);
  const to = Math.min(Date.parse(params.to), deps.now());
  if (!(from < to)) throw new ValidationError('The start must be before the end.');
  const ms = INTERVAL_MS[spec.session.interval];
  const bars = Math.ceil((to - from) / ms);
  if (bars > MAX_BARS) throw new ValidationError(`That’s ${bars.toLocaleString('en-US')} ${spec.session.interval} bars; at most ${MAX_BARS.toLocaleString('en-US')} per backtest. Shorten the range or use a longer interval.`);
  // Warm the indicators up on bars before the start, so the first signals are real.
  const warmFrom = from - (validation.warmupBars + 5) * ms;
  const data: Record<string, Candle[]> = {};
  for (const s of spec.market.symbols) {
    const c = await loadRange(s.symbol, spec.session.interval, warmFrom, to, deps);
    // Only closed bars.
    data[s.symbol] = c.filter((x) => x.openTime + ms <= deps.now());
  }
  const lastBars = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.at(-1)?.openTime ?? null]));
  const hash = createHash('sha1').update(canonical({ spec, params, lastBars })).digest('hex');
  const key = `strategy:bt:${hash}`;
  const hit = await cacheGet<BacktestResult>(key);
  if (hit) return { result: hit, params, hash, cached: true, validation };
  const result = runBacktest(spec, data, { capital: params.capital, slippageBps: params.slippageBps, fees: params.fees, from, to });
  if (!result.range.bars) throw new ValidationError('No market data in that range.');
  await cacheSet(key, result, 3600);
  return { result, params, hash, cached: false, validation };
}

/** Saved run for a strategy, with run history (F14). Identical runs are reused. */
export async function backtestStrategy(userId: string, id: string, params: BacktestParamsDto, deps = defaultStrategyDeps) {
  const s = await own(userId, id);
  const run = await backtestSpec(specOf(s), params, deps);
  const existing = await prisma.strategyBacktest.findFirst({ where: { strategyId: id, hash: run.hash } });
  const row = existing ?? await prisma.strategyBacktest.create({
    data: {
      strategyId: id, userId, version: s.version, params: params as object, metrics: run.result.metrics as object, hash: run.hash,
      // Keep the stored result lean: the first 500 trades are plenty to inspect.
      result: { ...run.result, trades: run.result.trades.slice(0, 500), tradesTotal: run.result.trades.length } as object,
    },
  });
  return { id: row.id, version: s.version, createdAt: row.createdAt.toISOString(), ...run, result: { ...run.result, trades: run.result.trades.slice(0, 500) } };
}

export async function getBacktest(userId: string, strategyId: string, backtestId: string) {
  await own(userId, strategyId);
  const b = await prisma.strategyBacktest.findFirst({ where: { id: backtestId, strategyId } });
  if (!b) throw new NotFoundError('Backtest not found');
  return { id: b.id, version: b.version, params: b.params, metrics: b.metrics, result: b.result, createdAt: b.createdAt.toISOString() };
}

// ── AI generator (F21) ────────────────────────────────────────────────────────

const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short strategy name, at most 60 characters.' },
    description: { type: 'string', description: 'One or two sentences on the idea.' },
    spec: { type: 'object', description: 'The strategy in the v2 format described in the system prompt.' },
  },
  required: ['name', 'description', 'spec'],
} as const;

function generatorPrompt(symbol: string, interval: string): string {
  const catalogue = INDICATORS.map((i) => `${i.id} (${i.label}): outputs ${i.outputs.map((o) => `${o.key}[${o.scale}]`).join(', ')}; params ${i.params.map((p) => `${p.key}=${p.default}`).join(', ') || 'none'}`).join('\n');
  return `You turn a trader's idea into a strategy for a backtester. Reply with JSON: {name, description, spec}.
spec follows this exact shape (TypeScript):
{ version: 2,
  market: { venue: 'delta_india', instrument: 'perpetual', symbols: [{ symbol: '${symbol}' }], direction: 'long'|'short'|'both', marginMode: 'isolated', leverage: number (1-10 unless asked) },
  session: { interval: '${interval}', timezone: 'UTC', mode: '24_7'|'windows', windows: [{ days: number[] (0=Sun), start: 'HH:MM', end: 'HH:MM' }] },
  entry: { long: Group|null, short: Group|'mirror'|null, atTimes: string[]|null },
  exit: { onOppositeSignal: boolean, long: Group|null, short: Group|'mirror'|null },
  risk: { takeProfit: {mode:'pct'|'points'|'price'|'rr', value}|null, stopLoss: {mode:'pct'|'atr'|'points'|'price', value, atrLength?}|null, trailing: {mode:'pct'|'atr', value, atrLength?, activateAtR?}|null, timeStopBars: number|null, partials: [{atR, closePct}], breakEvenAtR: number|null },
  sizing: { mode: 'risk_pct'|'equity_pct'|'qty'|'notional'|'atr'|'kelly', value: number },
  advanced: { entryType: 'market'|'limit', limitOffsetPct: number, limitExpiryBars: number, reentryCooldownBars: number, maxTradesPerDay: number|null },
  limits: { dailyLossPct: number|null, maxConsecutiveLosses: number|null } }
Group = { match: 'all'|'any', conditions: [{ left: Indicator, operator: 'gt'|'gte'|'lt'|'lte'|'eq'|'crosses_above'|'crosses_below', right: Indicator | { kind: 'value', value: number }, barsAgo?: number, rightBarsAgo?: number, timeframe?: interval (never shorter than ${interval}) }] }
Indicator = { kind: 'indicator', id, output, params? }. Use only these indicators; compare like with like (price with price, 0-100 oscillators with each other or a number):
${catalogue}
Rules: always include a stop loss. Default sizing risk_pct 1. Keep it as simple as the idea allows. Never invent indicators.`;
}

export async function generateStrategy(userId: string, input: { prompt: string; symbol: string; interval: string }, deps = defaultStrategyDeps) {
  if (!deps.ai()) throw new AiUnavailableError('The AI strategy generator needs AI switched on for this server.');
  const messages: ChatMessage[] = [
    { role: 'system', content: generatorPrompt(input.symbol, input.interval) },
    { role: 'user', content: input.prompt },
  ];
  let lastError = '';
  // One retry with the validation error, so the model can correct itself.
  for (let attempt = 0; attempt < 2; attempt++) {
    const j = (await deps.generate(attempt ? [...messages, { role: 'user', content: `That spec was rejected: ${lastError}. Return the corrected JSON.` }] : messages)) as { name?: unknown; description?: unknown; spec?: unknown };
    try {
      const spec = parseSpec(j?.spec);
      spec.market.symbols = [{ symbol: input.symbol }];
      spec.session.interval = input.interval as StrategySpec['session']['interval'];
      const v = validateStrategy(spec);
      if (v.blockers.length) throw new ValidationError(v.blockers.map((b) => b.message).join(' '));
      const name = typeof j.name === 'string' && j.name.trim() ? j.name.trim().slice(0, 80) : 'AI strategy';
      const description = typeof j.description === 'string' ? j.description.trim().slice(0, 500) : undefined;
      return createStrategy(userId, { name, description, spec }, 'ai');
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  throw new ValidationError(`The AI couldn’t turn that into a valid strategy: ${lastError} Try describing the entry and exit more plainly.`);
}
