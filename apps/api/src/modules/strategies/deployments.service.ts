// Strategy deployments (F15-F18). A deployment runs a frozen copy of one
// strategy version, so editing the strategy never changes what is running.
//
// Paper: every tick replays the backtest engine from the start, with pauses
// and the stop time as blocked ranges and size changes from their time on.
// Paper results therefore always match what a backtest of the same period
// would show, and nothing can drift.
//
// Live: on each closed bar, per market, the runner reads the account, records
// exits the exchange made (stop or target orders), checks exit rules, moves
// trailing and break-even stops, and enters on a signal with a market order
// that carries its stop and target. Order ids are deterministic per bar, so a
// repeated tick never sends a second order. Everything it does or skips is
// written to the activity feed in plain words.
import { prisma, type StrategyDeployment } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import {
  INTERVAL_MS, SignalEngine, inSession, planEntry, resolveShort, runBacktest, validateStrategy, zonedParts,
  type BacktestResult, type StrategySpec, type TraderCandle as Candle,
} from '@tradinjournal/core';
import type { PlaceTicketResultDto, TicketQuoteDto } from '@tradinjournal/contracts';
import { ForbiddenError, ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { closePosition } from '../trading/trading.service.js';
import { setProtection } from '../trading/protection.service.js';
import { placeTicket, ticketQuote, tradableInstruments } from '../trading/ticket.service.js';
import { defaultStrategyDeps, loadRange, type StrategyDeps } from './strategies.service.js';
import { assertWithinLimit, requireFeatureFor } from '../../lib/plans.js';

export const MAX_RUNNING = 10;
const PAPER_SLIPPAGE_BPS = 5;
const ACTIVE = ['running', 'paused', 'stopping'];

type Pause = { from: number; to: number | null };
type SizeStep = { from: number; multiplier: number };
const specOf = (d: Pick<StrategyDeployment, 'spec'>) => d.spec as unknown as StrategySpec;
const pausesOf = (d: Pick<StrategyDeployment, 'pauses'>) => (d.pauses as unknown as Pause[]) ?? [];
const sizesOf = (d: Pick<StrategyDeployment, 'sizeSchedule'>) => (d.sizeSchedule as unknown as SizeStep[]) ?? [];
const lastClosedOpen = (interval: StrategySpec['session']['interval'], now: number) => Math.floor(now / INTERVAL_MS[interval]) * INTERVAL_MS[interval] - INTERVAL_MS[interval];

async function event(deploymentId: string, at: Date, kind: string, message: string, symbol?: string, data?: object) {
  await prisma.deploymentEvent.create({ data: { deploymentId, at, kind, message, symbol: symbol ?? null, data: data ?? undefined } });
}

async function syncStrategyStatus(strategyId: string) {
  const running = await prisma.strategyDeployment.findMany({ where: { strategyId, status: { in: ACTIVE } }, select: { mode: true, status: true } });
  const s = await prisma.strategy.findUnique({ where: { id: strategyId }, select: { status: true } });
  if (!s || s.status === 'archived') return;
  const status = running.some((r) => r.mode === 'live' && r.status !== 'paused') ? 'live'
    : running.some((r) => r.mode === 'paper' && r.status !== 'paused') ? 'paper'
    : running.length ? 'paused' : 'draft';
  if (status !== s.status) await prisma.strategy.update({ where: { id: strategyId }, data: { status } });
}

// ── Live dependencies (injected in tests) ─────────────────────────────────────

export interface LiveDeps {
  quote: (userId: string, connectionId: string, symbol: string) => Promise<TicketQuoteDto>;
  place: (userId: string, t: Parameters<typeof placeTicket>[1]) => Promise<PlaceTicketResultDto>;
  close: (userId: string, connectionId: string, symbol: string) => Promise<{ avgFillPrice: number | null; message: string }>;
  protect: (userId: string, connectionId: string, symbol: string, stopLoss: number) => Promise<{ ok: boolean; message: string }>;
  instruments: (userId: string) => ReturnType<typeof tradableInstruments>;
}
export const defaultLiveDeps: LiveDeps = {
  quote: (u, c, s) => ticketQuote(u, c, s),
  place: (u, t) => placeTicket(u, t),
  close: async (u, c, s) => { const r = await closePosition(u, { connectionId: c, symbol: s }); return { avgFillPrice: r.order.avgFillPrice, message: r.message }; },
  protect: async (u, c, s, stopLoss) => { const r = await setProtection(u, { connectionId: c, symbol: s, stopLoss }); return { ok: true, message: (r as { message?: string }).message ?? 'Stop moved' }; },
  instruments: (u) => tradableInstruments(u),
};

// ── Create ────────────────────────────────────────────────────────────────────

export interface DeployInput { mode: 'paper' | 'live'; capital?: number; connectionId?: string; sizeMultiplier?: number; confirmLive?: boolean }

export async function createDeployment(userId: string, strategyId: string, input: DeployInput, live = defaultLiveDeps, opts: { fromSubscription?: boolean } = {}) {
  const s = await prisma.strategy.findFirst({ where: { id: strategyId, userId } });
  if (!s) throw new NotFoundError('Strategy not found');
  // A marketplace copy runs only through its subscription (exchange allowlist, one run each).
  if (s.source === 'template' && !opts.fromSubscription) throw new ForbiddenError('Run marketplace strategies from Subscriptions.');
  if (s.status === 'archived') throw new ConflictError('Unarchive the strategy first.');
  const spec = s.spec as unknown as StrategySpec;
  const v = validateStrategy(spec);
  if (v.blockers.length) throw new ValidationError(`Fix this first: ${v.blockers[0]!.message}`);
  await assertWithinLimit(userId, 'runningDeployments', await prisma.strategyDeployment.count({ where: { userId, status: { in: ACTIVE } } }), 'Stop one first.');
  if (input.mode === 'live') await requireFeatureFor(userId, 'strategies.live', 'Running strategies live');
  const multiplier = input.sizeMultiplier ?? 1;
  if (!(multiplier > 0 && multiplier <= 10)) throw new ValidationError('The size multiplier must be between 0.01 and 10.');
  const now = Date.now();
  let capital = input.capital ?? 10_000;
  let snapshot: object | undefined;
  if (input.mode === 'live') {
    if (!env.TRADING_ENABLED) throw new ConflictError('Live trading isn’t switched on for this server.');
    if (v.live.length) throw new ValidationError(v.live[0]!.message);
    // Not yet supported live; honest rather than half-done.
    if (spec.risk.partials.length) throw new ValidationError('Partial exits run on paper only for now. Remove them to go live.');
    if (spec.advanced.entryType === 'limit') throw new ValidationError('Limit entries run on paper only for now. Use market entries to go live.');
    if (!input.connectionId) throw new ValidationError('Pick the exchange account to trade.');
    const conn = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId } });
    if (!conn) throw new NotFoundError('Exchange account not found');
    if (conn.status !== 'ACTIVE' || !conn.canTrade) throw new ConflictError('That exchange key can’t trade right now. Check it on the Exchanges page.');
    if (conn.environment === 'LIVE' && !env.EXCHANGE_LIVE_ENABLED) throw new ConflictError('Real-money trading isn’t switched on yet. Use a testnet account.');
    if (conn.environment === 'LIVE' && !input.confirmLive) throw new ValidationError('Confirm that this strategy will place real orders with real money.');
    if (spec.market.venue !== 'delta_india' || conn.exchange !== 'DELTA_INDIA') throw new ValidationError('Live strategies run on Delta Exchange India accounts for now. Set the strategy’s exchange to Delta.');
    // Map each market to the account's perpetual for the same coin.
    const accts = await live.instruments(userId);
    const insts = accts.find((a) => a.connectionId === conn.id)?.instruments ?? [];
    const map: Record<string, string> = {};
    for (const x of spec.market.symbols) {
      const base = x.symbol.replace(/USDT$|USD$/, '');
      const inst = insts.find((i) => i.base === base);
      if (!inst) throw new ValidationError(`${conn.label} has no live perpetual for ${base}.`);
      map[x.symbol] = inst.symbol;
    }
    const q = await live.quote(userId, conn.id, Object.values(map)[0]!);
    capital = q.equityUsd;
    snapshot = { live: { symbols: Object.fromEntries(spec.market.symbols.map((x) => [x.symbol, { exSymbol: map[x.symbol], pos: null }])) } };
  } else if (!(capital >= 100 && capital <= 100_000_000)) throw new ValidationError('Paper capital must be between 100 and 100,000,000 USDT.');

  const d = await prisma.strategyDeployment.create({
    data: {
      userId, strategyId, version: s.version, spec: spec as object, name: s.name, mode: input.mode, connectionId: input.mode === 'live' ? input.connectionId! : null,
      capital, sizeSchedule: [{ from: now, multiplier }], pauses: [], snapshot, startedAt: new Date(now),
    },
  });
  await event(d.id, new Date(now), 'started', input.mode === 'live'
    ? `Started live on version ${s.version} with ${multiplier}× size. It will act on the next ${spec.session.interval} bar close.`
    : `Started on paper with ${capital.toLocaleString('en-US')} USDT on version ${s.version}. It acts on each ${spec.session.interval} bar close.`);
  await syncStrategyStatus(strategyId);
  return getDeployment(userId, d.id);
}

// ── Read ──────────────────────────────────────────────────────────────────────

function summary(d: StrategyDeployment, closedPnl: number, trades: number) {
  const snap = (d.snapshot ?? {}) as { metrics?: BacktestResult['metrics']; open?: BacktestResult['open']; equity?: Array<{ t: number; equity: number }>; killed?: boolean; live?: unknown };
  const openPnl = (snap.open ?? []).reduce((a, p) => a + p.unrealized, 0);
  return {
    id: d.id, strategyId: d.strategyId, name: d.name, version: d.version, mode: d.mode, status: d.status, capital: d.capital,
    multiplier: sizesOf(d).at(-1)?.multiplier ?? 1, connectionId: d.connectionId,
    startedAt: d.startedAt.toISOString(), stoppedAt: d.stoppedAt?.toISOString() ?? null, stopReason: d.stopReason,
    lastEvaluatedAt: d.lastEvaluatedAt?.toISOString() ?? null, lastBarTime: d.lastBarTime?.toISOString() ?? null, error: d.error,
    closedPnl, openPnl, tradeCount: trades, open: snap.open ?? [], killed: !!snap.killed,
    spark: (snap.equity ?? []).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 40)) === 0).map((p) => p.equity),
  };
}

export async function listDeployments(userId: string, strategyId?: string) {
  const rows = await prisma.strategyDeployment.findMany({ where: { userId, ...(strategyId ? { strategyId } : {}) }, orderBy: { startedAt: 'desc' } });
  const agg = await prisma.deploymentTrade.groupBy({ by: ['deploymentId'], where: { deploymentId: { in: rows.map((r) => r.id) } }, _sum: { pnl: true }, _count: { _all: true } });
  const by = new Map(agg.map((a) => [a.deploymentId, a]));
  const recent = await prisma.deploymentTrade.findMany({ where: { deploymentId: { in: rows.map((r) => r.id) } }, orderBy: { exitTime: 'desc' }, take: 200 });
  return rows.map((r) => ({
    ...summary(r, by.get(r.id)?._sum.pnl ?? 0, by.get(r.id)?._count._all ?? 0),
    recentTrades: recent.filter((t) => t.deploymentId === r.id).slice(0, 3).map(tradeDto),
  }));
}

const tradeDto = (t: { symbol: string; side: string; qty: number; entryPrice: number; entryTime: Date; exitPrice: number; exitTime: Date; pnl: number; pnlPct: number; fees: number; rMultiple: number | null; reason: string }) => ({
  ...t, entryTime: t.entryTime.toISOString(), exitTime: t.exitTime.toISOString(),
});

export async function getDeployment(userId: string, id: string) {
  const d = await prisma.strategyDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new NotFoundError('Deployment not found');
  const [trades, events, strat] = await Promise.all([
    prisma.deploymentTrade.findMany({ where: { deploymentId: id }, orderBy: { exitTime: 'desc' }, take: 300 }),
    prisma.deploymentEvent.findMany({ where: { deploymentId: id }, orderBy: [{ at: 'desc' }, { createdAt: 'desc' }], take: 150 }),
    prisma.strategy.findUnique({ where: { id: d.strategyId }, select: { version: true, name: true, source: true } }),
  ]);
  const snap = (d.snapshot ?? {}) as { metrics?: BacktestResult['metrics']; equity?: Array<{ t: number; equity: number }>; pending?: BacktestResult['pending'] };
  // A marketplace run: the rules and the condition values behind each check stay private.
  const isPrivate = strat?.source === 'template';
  return {
    ...summary(d, trades.reduce((a, t) => a + t.pnl, 0), trades.length),
    strategyVersion: strat?.version ?? d.version, strategyName: strat?.name ?? d.name,
    private: isPrivate,
    // Bar size isn't a secret; the page says when it next acts.
    interval: specOf(d).session.interval,
    spec: isPrivate ? null : specOf(d), metrics: snap.metrics ?? null, equity: snap.equity ?? [], pending: snap.pending ?? [],
    pauses: pausesOf(d), sizeSchedule: sizesOf(d),
    trades: trades.map(tradeDto),
    events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), symbol: e.symbol, kind: e.kind, message: e.message, data: isPrivate ? null : e.data })),
  };
}

/** Closed trades across all paper or live deployments, for the reports page (F23). */
export async function deploymentReport(userId: string, mode: 'paper' | 'live', days: number | null) {
  const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
  const deps = await prisma.strategyDeployment.findMany({ where: { userId, mode }, select: { id: true, name: true, strategyId: true, status: true, capital: true, startedAt: true } });
  const trades = await prisma.deploymentTrade.findMany({
    where: { deploymentId: { in: deps.map((d) => d.id) }, ...(since ? { exitTime: { gte: since } } : {}) },
    orderBy: { exitTime: 'asc' },
    take: 5000,
  });
  const names = new Map(deps.map((d) => [d.id, d.name]));
  return {
    mode, days, deployments: deps.map((d) => ({ ...d, startedAt: d.startedAt.toISOString() })),
    capital: deps.reduce((a, d) => a + d.capital, 0),
    trades: trades.map((t) => ({ ...tradeDto(t), deploymentId: t.deploymentId, deployment: names.get(t.deploymentId) ?? '' })),
  };
}

// ── Controls (F16) ────────────────────────────────────────────────────────────

export type DeployAction = 'pause' | 'resume' | 'stop' | 'settle' | 'emergency_close' | 'archive';

export async function controlDeployment(userId: string, id: string, action: DeployAction, opts: { multiplier?: number } = {}, deps = defaultStrategyDeps, live = defaultLiveDeps) {
  const d = await prisma.strategyDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new NotFoundError('Deployment not found');
  const now = new Date();
  const pauses = pausesOf(d);
  switch (action) {
    case 'pause':
      if (d.status !== 'running') throw new ConflictError('Only a running deployment can be paused.');
      await prisma.strategyDeployment.update({ where: { id }, data: { status: 'paused', pauses: [...pauses, { from: now.getTime(), to: null }] } });
      await event(id, now, 'paused', 'Paused by you: no new trades. Open trades keep their stops and exits.');
      break;
    case 'resume':
      if (d.status !== 'paused' && d.status !== 'errored') throw new ConflictError('Only a paused or errored deployment can be resumed.');
      await prisma.strategyDeployment.update({ where: { id }, data: { status: 'running', error: null, pauses: pauses.map((p) => (p.to == null ? { ...p, to: now.getTime() } : p)) } });
      await event(id, now, 'resumed', 'Resumed: it will act on the next bar close.');
      break;
    case 'stop':
      if (!ACTIVE.includes(d.status) && d.status !== 'errored') throw new ConflictError('This deployment isn’t running.');
      await prisma.strategyDeployment.update({ where: { id }, data: { status: 'stopping', stoppedAt: now, stopReason: 'Stopped by you' } });
      await event(id, now, 'stopping', 'Stopping: no new trades. Open trades run until their stop, target or exit rule closes them.');
      break;
    case 'settle':
    case 'emergency_close': {
      if (d.status === 'stopped' || d.status === 'archived') throw new ConflictError('This deployment has already stopped.');
      const emergency = action === 'emergency_close';
      if (d.mode === 'live') await settleLive(d, emergency, live);
      await prisma.strategyDeployment.update({ where: { id }, data: { status: 'stopped', stoppedAt: d.stoppedAt ?? now, stopReason: emergency ? 'Emergency close' : 'Settled by you', snapshot: { ...(d.snapshot as object ?? {}), settledAt: now.getTime() } } });
      await event(id, now, emergency ? 'emergency' : 'settled', emergency ? 'Emergency close: every open position closed at market and the strategy stopped.' : 'Settled: open positions closed at market and the strategy stopped.');
      if (d.mode === 'paper') await tickPaper((await prisma.strategyDeployment.findUniqueOrThrow({ where: { id } })), deps, true);
      break;
    }
    case 'archive':
      if (d.status !== 'stopped') throw new ConflictError('Stop the deployment before archiving it.');
      await prisma.strategyDeployment.update({ where: { id }, data: { status: 'archived' } });
      break;
  }
  if (opts.multiplier != null) await setMultiplier(userId, id, opts.multiplier);
  await syncStrategyStatus(d.strategyId);
  return getDeployment(userId, id);
}

export async function setMultiplier(userId: string, id: string, multiplier: number) {
  if (!(multiplier > 0 && multiplier <= 10)) throw new ValidationError('The size multiplier must be between 0.01 and 10.');
  const d = await prisma.strategyDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new NotFoundError('Deployment not found');
  const now = Date.now();
  await prisma.strategyDeployment.update({ where: { id }, data: { sizeSchedule: [...sizesOf(d), { from: now, multiplier }] } });
  await event(id, new Date(now), 'size', `Size set to ${multiplier}× for new trades. Open trades keep their size.`);
  return getDeployment(userId, id);
}

// ── Paper ─────────────────────────────────────────────────────────────────────

export async function tickPaper(d: StrategyDeployment, deps = defaultStrategyDeps, force = false): Promise<boolean> {
  const spec = specOf(d);
  const now = deps.now();
  const ms = INTERVAL_MS[spec.session.interval];
  const expected = lastClosedOpen(spec.session.interval, now);
  if (!force && d.lastBarTime && d.lastBarTime.getTime() >= expected) return false;
  const start = d.startedAt.getTime();
  const settledAt = (d.snapshot as { settledAt?: number } | null)?.settledAt;
  const v = validateStrategy(spec);
  const data: Record<string, Candle[]> = {};
  for (const x of spec.market.symbols) {
    data[x.symbol] = (await loadRange(x.symbol, spec.session.interval, start - (v.warmupBars + 5) * ms, settledAt ?? now, deps)).filter((c) => c.openTime + ms <= now);
  }
  const blocked: Pause[] = [...pausesOf(d), ...(d.stoppedAt ? [{ from: d.stoppedAt.getTime(), to: null }] : [])];
  const result = runBacktest(spec, data, {
    capital: d.capital, slippageBps: PAPER_SLIPPAGE_BPS, from: start, to: settledAt ?? now,
    keepOpen: !settledAt, blocked, sizeSchedule: sizesOf(d), traceFrom: d.lastBarTime ? d.lastBarTime.getTime() + 1 : start,
  });
  if (result.trades.length) {
    await prisma.deploymentTrade.createMany({
      skipDuplicates: true,
      data: result.trades.map((t) => ({ deploymentId: d.id, symbol: t.symbol, side: t.side, qty: t.qty, entryPrice: t.entryPrice, entryTime: new Date(t.entryTime), exitPrice: t.exitPrice, exitTime: new Date(t.reason === 'end' ? t.exitTime + ms : t.exitTime), pnl: t.pnl, pnlPct: t.pnlPct, fees: t.fees, rMultiple: t.rMultiple, reason: t.reason === 'end' ? 'settled' : t.reason })),
    });
  }
  // The activity feed: the newest evaluations only, if it fell far behind.
  const events = (result.trace ?? []).slice(-120);
  // Evaluations happen at the bar's close; fills and exits inside a bar are shown at its open.
  if (events.length) await prisma.deploymentEvent.createMany({ data: events.map((e) => ({ deploymentId: d.id, at: new Date(e.kind === 'filled' || e.kind === 'closed' ? e.t : e.t + ms), symbol: e.symbol, kind: e.kind, message: e.message, data: e.conditions ? { conditions: e.conditions } : undefined })) });
  const flat = !(result.open ?? []).length && !(result.pending ?? []).length;
  await prisma.strategyDeployment.update({
    where: { id: d.id },
    data: {
      lastEvaluatedAt: new Date(now), lastBarTime: result.range.to != null ? new Date(result.range.to) : d.lastBarTime, error: null,
      snapshot: { ...((d.snapshot as object) ?? {}), metrics: result.metrics, open: result.open ?? [], pending: result.pending ?? [], equity: result.equity.slice(-300), killed: !!result.killed } as object,
      ...(d.status === 'stopping' && flat ? { status: 'stopped' } : {}),
    },
  });
  if (d.status === 'stopping' && flat) {
    await event(d.id, new Date(now), 'stopped', 'Stopped: no open trades left.');
    await syncStrategyStatus(d.strategyId);
  }
  if (result.killed && !(d.snapshot as { killed?: boolean } | null)?.killed) await event(d.id, new Date(now), 'killed', `Losing-streak limit reached (${spec.limits.maxConsecutiveLosses} in a row): no new trades. Open trades are still managed.`);
  return true;
}

// ── Live ──────────────────────────────────────────────────────────────────────

interface LivePos { side: 1 | -1; entryPrice: number; entryTime: number; entryBar: number; contracts: number; stop: number | null; target: number | null; risk: number | null; trailDist: number | null; trailActive: boolean; requestId: string }
interface LiveSym { exSymbol: string; pos: LivePos | null; cooldownUntil?: number; pendingRequestId?: string }
interface LiveState { symbols: Record<string, LiveSym>; dayKey?: string; dayStartEquity?: number }

const decimals = (step: number) => Math.max(0, Math.min(12, Math.ceil(-Math.log10(step) - 1e-9)));
/** Round to the exchange's tick without float noise (79521.90000000001 → 79521.9). */
const roundTo = (v: number, step: number) => (step > 0 ? Number((Math.round(v / step) * step).toFixed(decimals(step))) : v);
const floorTo = (v: number, step: number) => (step > 0 ? Math.floor(v / step + 1e-9) * step : v);

async function recordLiveTrade(d: StrategyDeployment, symbol: string, p: LivePos, exitPrice: number, exitTime: number, reason: string, multiplierBase: number) {
  const qty = p.contracts * multiplierBase;
  const pnl = p.side * qty * (exitPrice - p.entryPrice);
  await prisma.deploymentTrade.createMany({
    skipDuplicates: true,
    data: [{ deploymentId: d.id, symbol, side: p.side === 1 ? 'long' : 'short', qty, entryPrice: p.entryPrice, entryTime: new Date(p.entryTime), exitPrice, exitTime: new Date(exitTime), pnl, pnlPct: (pnl / (qty * p.entryPrice)) * 100, fees: 0, rMultiple: p.risk ? (p.side * (exitPrice - p.entryPrice)) / p.risk : null, reason }],
  });
}

export async function tickLive(d: StrategyDeployment, deps = defaultStrategyDeps, live = defaultLiveDeps): Promise<boolean> {
  const spec = specOf(d);
  const now = deps.now();
  const ms = INTERVAL_MS[spec.session.interval];
  const expected = lastClosedOpen(spec.session.interval, now);
  if (d.lastBarTime && d.lastBarTime.getTime() >= expected) return false;
  const snap = (d.snapshot ?? {}) as { live?: LiveState; [k: string]: unknown };
  const state: LiveState = snap.live ?? { symbols: {} };
  // Decisions happen when the bar closes, so that's when the feed shows them.
  const barAt = new Date(expected + ms);
  const v = validateStrategy(spec);
  const longG = spec.market.direction !== 'short' ? spec.entry.long : null;
  const shortG = spec.market.direction !== 'long' ? resolveShort(spec.entry.short, spec.entry.long) : null;
  const exitLong = spec.exit.long;
  const exitShort = resolveShort(spec.exit.short, spec.exit.long);
  const multiplier = sizesOf(d).filter((x) => x.from <= now).at(-1)?.multiplier ?? 1;
  const trades = await prisma.deploymentTrade.findMany({ where: { deploymentId: d.id }, orderBy: { exitTime: 'asc' } });
  const z = zonedParts(now, spec.session.timezone);
  let losses = 0;
  for (const t of [...trades].reverse()) { if (t.pnl < 0) losses += 1; else break; }
  const killed = !!spec.limits.maxConsecutiveLosses && losses >= spec.limits.maxConsecutiveLosses;
  const todayPnl = trades.filter((t) => zonedParts(t.exitTime.getTime(), spec.session.timezone).date === z.date).reduce((a, t) => a + t.pnl, 0);
  const todayEntries = trades.filter((t) => zonedParts(t.entryTime.getTime(), spec.session.timezone).date === z.date).length + Object.values(state.symbols).filter((x) => x.pos && zonedParts(x.pos.entryTime, spec.session.timezone).date === z.date).length;

  for (const x of spec.market.symbols) {
    const st: LiveSym = state.symbols[x.symbol] ?? { exSymbol: x.symbol, pos: null };
    state.symbols[x.symbol] = st;
    try {
      const q = await live.quote(d.userId, d.connectionId!, st.exSymbol);
      const mult = q.contractMultiplier;
      if (state.dayKey !== z.date) { state.dayKey = z.date; state.dayStartEquity = q.equityUsd; }
      // 1. Reconcile with the account.
      if (st.pos && q.position === 0) {
        const px = q.markPrice ?? st.pos.entryPrice;
        await recordLiveTrade(d, x.symbol, st.pos, px, now, 'stop/target on exchange', mult);
        await event(d.id, barAt, 'closed', `${st.exSymbol} position closed on the exchange (stop or target hit), around ${px}.`, x.symbol);
        st.pos = null;
        if (spec.advanced.reentryCooldownBars) st.cooldownUntil = expected + spec.advanced.reentryCooldownBars * ms;
      }
      if (!st.pos && q.position !== 0) {
        if (st.pendingRequestId) {
          st.pos = { side: q.position > 0 ? 1 : -1, entryPrice: q.markPrice ?? 0, entryTime: now, entryBar: expected, contracts: Math.abs(q.position), stop: null, target: null, risk: null, trailDist: null, trailActive: false, requestId: st.pendingRequestId };
          st.pendingRequestId = undefined;
          await event(d.id, barAt, 'filled', `Entry on ${st.exSymbol} confirmed by the exchange (${Math.abs(q.position)} contracts).`, x.symbol);
        } else {
          await event(d.id, barAt, 'blocked', `${st.exSymbol} already has a position on this account that the strategy didn’t open; it won’t trade ${st.exSymbol} until that’s closed.`, x.symbol);
          continue;
        }
      }
      // 2. Signals on the bar that just closed.
      const candles = (await loadRange(x.symbol, spec.session.interval, expected - (v.warmupBars + 10) * ms, expected, deps)).filter((c) => c.openTime + ms <= now);
      const i = candles.length - 1;
      if (i < 1 || candles[i]!.openTime !== expected) { await event(d.id, barAt, 'blocked', `No ${spec.session.interval} candle for ${x.symbol} yet; trying again next minute.`, x.symbol); return false; }
      const eng = new SignalEngine(candles, spec.session.interval);
      const bar = candles[i]!;
      if (st.pos) {
        const p = st.pos;
        const bars = Math.round((expected - p.entryBar) / ms);
        const why = spec.risk.timeStopBars && bars >= spec.risk.timeStopBars ? `Time stop after ${bars} bars`
          : eng.group(p.side === 1 ? exitLong : exitShort, i) ? 'Exit signal'
          : spec.exit.onOppositeSignal && eng.group(p.side === 1 ? shortG : longG, i) ? 'Opposite signal' : null;
        if (why) {
          const r = await live.close(d.userId, d.connectionId!, st.exSymbol);
          const px = r.avgFillPrice ?? q.markPrice ?? p.entryPrice;
          await recordLiveTrade(d, x.symbol, p, px, now, why.toLowerCase(), mult);
          await event(d.id, barAt, 'closed', `${why}: closed ${st.exSymbol} at ${px}. ${r.message}`, x.symbol);
          st.pos = null;
          if (spec.advanced.reentryCooldownBars) st.cooldownUntil = expected + spec.advanced.reentryCooldownBars * ms;
          continue;
        }
        // Trailing and break-even, from this bar's range.
        let next = p.stop;
        const favour = p.side === 1 ? bar.high - p.entryPrice : p.entryPrice - bar.low;
        const tr = spec.risk.trailing;
        if (tr && p.trailDist != null) {
          if (!p.trailActive && tr.activateAtR && p.risk && favour >= tr.activateAtR * p.risk) p.trailActive = true;
          if (p.trailActive) {
            const dist = tr.mode === 'pct' ? ((p.side === 1 ? bar.high : bar.low) * tr.value) / 100 : p.trailDist;
            const cand = p.side === 1 ? bar.high - dist : bar.low + dist;
            if (next == null || (p.side === 1 ? cand > next : cand < next)) next = cand;
          }
        }
        if (spec.risk.breakEvenAtR && p.risk && favour >= spec.risk.breakEvenAtR * p.risk && (next == null || (p.side === 1 ? next < p.entryPrice : next > p.entryPrice))) next = p.entryPrice;
        if (next != null && next !== p.stop) {
          const rounded = roundTo(next, q.tickSize);
          if (p.stop == null || Math.abs(rounded - p.stop) >= q.tickSize) {
            const r = await live.protect(d.userId, d.connectionId!, st.exSymbol, rounded);
            p.stop = rounded;
            await event(d.id, barAt, 'stop_moved', `Stop moved to ${rounded} on ${st.exSymbol}. ${r.message}`, x.symbol);
            continue;
          }
        }
        await event(d.id, barAt, 'holding', `Holding ${p.side === 1 ? 'long' : 'short'} ${st.exSymbol} from ${p.entryPrice}${p.stop != null ? `, stop ${p.stop}` : ''}; no exit yet.`, x.symbol);
        continue;
      }
      // 3. Flat: may it enter?
      const nextOpen = expected + ms;
      const block = d.status !== 'running' ? (d.status === 'stopping' ? 'Stopping: no new trades.' : 'Paused.')
        : killed ? 'Stopped by the losing-streak limit.'
        : spec.limits.dailyLossPct && state.dayStartEquity && todayPnl <= -(state.dayStartEquity * spec.limits.dailyLossPct) / 100 ? 'Paused for the day: daily loss cap reached.'
        : st.cooldownUntil && nextOpen < st.cooldownUntil ? 'Waiting out the re-entry cooldown.'
        : spec.advanced.maxTradesPerDay != null && todayEntries >= spec.advanced.maxTradesPerDay ? 'Reached the maximum trades for the day.'
        : !inSession(spec, nextOpen) ? 'Outside the entry window.'
        : spec.entry.atTimes?.length && !spec.entry.atTimes.includes(zonedParts(nextOpen, spec.session.timezone).hm) ? `Waiting for the trigger time (${spec.entry.atTimes.join(', ')}).` : null;
      if (block) { await event(d.id, barAt, 'blocked', block, x.symbol); continue; }
      const wantLong = longG ? eng.group(longG, i) : !!spec.entry.atTimes?.length && spec.market.direction !== 'short';
      const wantShort = shortG ? eng.group(shortG, i) : !!spec.entry.atTimes?.length && spec.market.direction === 'short';
      if (wantLong === wantShort) {
        const conds = [...eng.explain(longG, i), ...(shortG ? eng.explain(shortG, i) : [])];
        await event(d.id, barAt, 'no_signal', wantLong ? 'Long and short signals at once: staying out.' : `No entry: ${conds.filter((c) => c.met).length} of ${conds.length} conditions met.`, x.symbol, { conditions: conds });
        continue;
      }
      const side: 1 | -1 = wantLong ? 1 : -1;
      const price = q.markPrice ?? bar.close;
      const atr = eng.atr(i, spec.risk.stopLoss?.atrLength ?? spec.risk.trailing?.atrLength ?? 14);
      const plan = planEntry({ spec, symbol: x.symbol, side, price, atr, equity: q.equityUsd, marginUsed: Math.max(0, q.equityUsd - (q.availableUsd ?? q.equityUsd)), multiplier, history: trades });
      if ('skip' in plan) { await event(d.id, barAt, 'skipped', `Signal skipped: ${plan.skip}`, x.symbol); continue; }
      const contracts = floorTo(plan.qty / mult, q.qtyStep || 1);
      if (contracts < (q.minQty || 1)) { await event(d.id, barAt, 'skipped', `Signal skipped: the size works out below one contract of ${st.exSymbol} (${(plan.qty / mult).toFixed(3)}).`, x.symbol); continue; }
      const requestId = `sd-${d.id.slice(-10)}-${Math.floor(expected / 60_000)}-${st.exSymbol}`.slice(0, 64);
      const lev = Math.max(1, Math.min(Math.round(plan.leverage), q.maxLeverage ?? 200));
      const res = await live.place(d.userId, {
        connectionId: d.connectionId!, symbol: st.exSymbol, side: side === 1 ? 'BUY' : 'SELL', type: 'MARKET', size: { mode: 'contracts', value: contracts },
        leverage: lev, ...(plan.stop != null ? { stopLoss: roundTo(plan.stop, q.tickSize) } : {}), ...(plan.target != null ? { takeProfit: roundTo(plan.target, q.tickSize) } : {}), requestId,
      });
      const fill = res.order?.avgFillPrice ?? null;
      const conds = eng.explain(side === 1 ? longG : shortG, i);
      if (res.outcome === 'filled' || res.outcome === 'partial') {
        st.pos = { side, entryPrice: fill ?? price, entryTime: now, entryBar: expected, contracts: res.order?.filledQty ?? contracts, stop: plan.stop != null ? roundTo(plan.stop, q.tickSize) : null, target: plan.target != null ? roundTo(plan.target, q.tickSize) : null, risk: plan.risk, trailDist: plan.trailDist, trailActive: !!spec.risk.trailing && !spec.risk.trailing.activateAtR, requestId };
        const prot = res.protective.map((p) => `${p.kind} ${p.ok ? 'placed' : `failed: ${p.message}`}`).join(', ');
        await event(d.id, barAt, 'filled', `${side === 1 ? 'Bought' : 'Sold short'} ${res.order?.filledQty ?? contracts} ${st.exSymbol} at ${fill ?? 'market'}${prot ? ` · ${prot}` : ''}.`, x.symbol, { conditions: conds });
      } else if (res.outcome === 'resting' || res.outcome === 'unconfirmed') {
        st.pendingRequestId = requestId;
        await event(d.id, barAt, 'signal', `${side === 1 ? 'Long' : 'Short'} signal: order sent, waiting for the exchange to confirm. ${res.message}`, x.symbol, { conditions: conds });
      } else {
        await event(d.id, barAt, 'error', `Order refused: ${res.message}`, x.symbol);
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(`[deployments] live tick ${d.id} ${x.symbol}: ${msg}`);
      await event(d.id, barAt, 'error', `Couldn’t act on ${x.symbol}: ${msg}`, x.symbol);
      // Errored: it stops acting until you resume it, so a broken key or a refused order can't loop.
      await prisma.strategyDeployment.update({ where: { id: d.id }, data: { status: 'errored', error: msg, snapshot: { ...snap, live: state } as object } });
      await syncStrategyStatus(d.strategyId);
      return false;
    }
  }
  const allFlat = Object.values(state.symbols).every((s) => !s.pos && !s.pendingRequestId);
  await prisma.strategyDeployment.update({
    where: { id: d.id },
    data: { lastEvaluatedAt: new Date(now), lastBarTime: new Date(expected), error: null, snapshot: { ...snap, live: state, open: openOfLive(state) } as object, ...(d.status === 'stopping' && allFlat ? { status: 'stopped' } : {}) },
  });
  if (d.status === 'stopping' && allFlat) { await event(d.id, new Date(now), 'stopped', 'Stopped: no open trades left.'); await syncStrategyStatus(d.strategyId); }
  return true;
}

function openOfLive(state: LiveState) {
  return Object.entries(state.symbols).filter(([, s]) => s.pos).map(([symbol, s]) => ({ symbol: s.exSymbol, side: s.pos!.side === 1 ? 'long' : 'short', qty: s.pos!.contracts, entryPrice: s.pos!.entryPrice, entryTime: s.pos!.entryTime, stop: s.pos!.stop, target: s.pos!.target, lastPrice: s.pos!.entryPrice, unrealized: 0, notional: 0, fees: 0, specSymbol: symbol }));
}

async function settleLive(d: StrategyDeployment, emergency: boolean, live: LiveDeps) {
  const snap = (d.snapshot ?? {}) as { live?: LiveState };
  const state = snap.live ?? { symbols: {} };
  const now = Date.now();
  for (const [sym, st] of Object.entries(state.symbols)) {
    if (!st.pos && !st.pendingRequestId) continue;
    try {
      const q = await live.quote(d.userId, d.connectionId!, st.exSymbol);
      if (q.position === 0) { if (st.pos) await recordLiveTrade(d, sym, st.pos, q.markPrice ?? st.pos.entryPrice, now, 'stop/target on exchange', q.contractMultiplier); st.pos = null; continue; }
      const r = await live.close(d.userId, d.connectionId!, st.exSymbol);
      if (st.pos) await recordLiveTrade(d, sym, st.pos, r.avgFillPrice ?? q.markPrice ?? st.pos.entryPrice, now, emergency ? 'emergency close' : 'settled', q.contractMultiplier);
      await event(d.id, new Date(now), 'closed', `${emergency ? 'Emergency close' : 'Settled'}: ${st.exSymbol} closed at ${r.avgFillPrice ?? 'market'}. ${r.message}`, sym);
      st.pos = null;
      st.pendingRequestId = undefined;
    } catch (err) {
      await event(d.id, new Date(now), 'error', `Couldn’t close ${st.exSymbol}: ${(err as Error).message}. Close it on the Positions page.`, sym);
      if (!emergency) throw new ConflictError(`Couldn’t close ${st.exSymbol}: ${(err as Error).message}`);
    }
  }
  await prisma.strategyDeployment.update({ where: { id: d.id }, data: { snapshot: { ...snap, live: state, open: openOfLive(state) } as object } });
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/** Every minute: each running deployment acts once per closed bar. */
export async function tickDeployments(deps = defaultStrategyDeps, live = defaultLiveDeps, scope?: { userIds?: string[] }) {
  const rows = await prisma.strategyDeployment.findMany({ where: { status: { in: ACTIVE }, ...(scope?.userIds ? { userId: { in: scope.userIds } } : {}) } });
  let acted = 0;
  for (const d of rows) {
    try {
      const did = d.mode === 'paper' ? await tickPaper(d, deps) : env.TRADING_ENABLED ? await tickLive(d, deps, live) : false;
      if (did) acted += 1;
    } catch (err) {
      logger.warn(`[deployments] tick ${d.id} failed: ${(err as Error).message}`);
      await prisma.strategyDeployment.update({ where: { id: d.id }, data: { error: (err as Error).message } }).catch(() => {});
    }
  }
  return { deployments: rows.length, acted };
}

export type { StrategyDeps };
