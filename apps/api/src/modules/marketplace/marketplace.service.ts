// Strategy marketplace (H1–H3). Creators (approved by an admin) publish a
// template: a frozen copy of their strategy's rules, the settings a
// subscriber may tune, and the venues it may run on. TRADElogs computes the
// performance shown (a backtest it runs itself, plus the creator's own run as
// a track record), so nothing on a template page is self-reported. The rules
// stay private: subscribing makes a private copy that the builder won't open
// and whose runs hide the condition values behind each decision.
import { describeOperand, describeStrategy, INTERVAL_MS, validateStrategy, VENUE_INFO, type StrategySpec } from '@tradinjournal/core';
import { prisma, type Prisma, type StrategyTemplate } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../http/errors.js';
import { assertWithinLimit, requireFeatureFor } from '../../lib/plans.js';
import { controlDeployment, createDeployment, setMultiplier, type DeployInput } from '../strategies/deployments.service.js';
import { backtestSpec, defaultStrategyDeps, type StrategyDeps } from '../strategies/strategies.service.js';

export const CATEGORIES = ['trend', 'reversion', 'breakout', 'momentum', 'range', 'scalping'] as const;
export const RISKS = ['low', 'medium', 'high'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Risk = (typeof RISKS)[number];
const ACTIVE_SUBS = ['active', 'paused'];

// ── Tunable settings ──
/** `key` is what subscribers see and send (p1, p2…); `id` is the path into the rules and never leaves the server. */
export interface TemplateParam { key: string; id: string; label: string; min: number; max: number; step: number; value: number }

type Path = Array<string | number>;
const parsePath = (id: string): Path => id.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
function getAt(o: unknown, path: Path): unknown {
  let cur: unknown = o;
  for (const k of path) { if (cur == null || typeof cur !== 'object') return undefined; cur = (cur as Record<string | number, unknown>)[k]; }
  return cur;
}
function setAt(o: unknown, path: Path, v: number): void {
  let cur = o as Record<string | number, unknown>;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string | number, unknown>;
  cur[path.at(-1)!] = v;
}
const niceStep = (v: number) => { const a = Math.abs(v) || 1; const p = 10 ** Math.floor(Math.log10(a)); return a / p >= 5 ? p : p / 2 || 0.01; };
const round = (v: number, step: number) => { const d = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step) - 1e-9))); return Number((Math.round(v / step) * step).toFixed(d)); };

/** The settings of a strategy a creator may let subscribers tune, with sensible ranges around today's values. */
export function paramCandidates(spec: StrategySpec): TemplateParam[] {
  const out: TemplateParam[] = [];
  const add = (id: string, label: string, value: number, min: number, max: number, step: number) => {
    if (!Number.isFinite(value)) return;
    out.push({ key: '', id, label, value, min: round(Math.min(min, value), step), max: round(Math.max(max, value), step), step });
  };
  const sl = spec.risk.stopLoss;
  if (sl && sl.mode !== 'price') add('risk.stopLoss.value', sl.mode === 'pct' ? 'Stop loss (%)' : sl.mode === 'atr' ? 'Stop loss (× ATR)' : 'Stop loss (points)', sl.value, sl.value * 0.5, sl.value * 2, sl.mode === 'points' ? niceStep(sl.value / 10) : 0.1);
  const tp = spec.risk.takeProfit;
  if (tp && tp.mode !== 'price') add('risk.takeProfit.value', tp.mode === 'pct' ? 'Target (%)' : tp.mode === 'rr' ? 'Target (× the risk)' : 'Target (points)', tp.value, tp.value * 0.5, tp.value * 2, tp.mode === 'points' ? niceStep(tp.value / 10) : 0.1);
  if (spec.risk.trailing) add('risk.trailing.value', spec.risk.trailing.mode === 'pct' ? 'Trailing stop (%)' : 'Trailing stop (× ATR)', spec.risk.trailing.value, spec.risk.trailing.value * 0.5, spec.risk.trailing.value * 2, 0.1);
  if (spec.risk.timeStopBars) add('risk.timeStopBars', 'Time stop (bars)', spec.risk.timeStopBars, Math.max(1, Math.floor(spec.risk.timeStopBars / 2)), spec.risk.timeStopBars * 3, 1);
  const sz = spec.sizing;
  const szLabel = { risk_pct: 'Risk per trade (% of equity)', equity_pct: 'Position size (% of equity)', qty: 'Quantity', notional: 'Size (USDT per trade)', atr: 'Risk per ATR (% of equity)', kelly: 'Kelly fraction (%)' }[sz.mode];
  add('sizing.value', szLabel, sz.value, sz.value * 0.25, sz.value * 2, sz.mode === 'notional' || sz.mode === 'qty' ? niceStep(sz.value / 10) : 0.1);
  add('market.leverage', 'Leverage', spec.market.leverage, 1, Math.min(VENUE_INFO[spec.market.venue].maxLeverage, Math.max(spec.market.leverage * 3, 5)), 1);
  const groups: Array<[string, string, StrategySpec['entry']['long'] | StrategySpec['entry']['short']]> = [
    ['entry.long', 'Entry', spec.entry.long],
    ...(spec.entry.short && spec.entry.short !== 'mirror' ? [['entry.short', 'Short entry', spec.entry.short] as [string, string, StrategySpec['entry']['short']]] : []),
    ['exit.long', 'Exit', spec.exit.long],
  ];
  for (const [base, prefix, g] of groups) {
    if (!g || g === 'mirror') continue;
    g.conditions.forEach((c, i) => {
      const name = describeOperand(c.left);
      if (c.right.kind === 'value') {
        const v = c.right.value;
        const pct = ['rsi', 'stoch', 'stochrsi', 'mfi', 'uo', 'adx'].includes(c.left.id);
        add(`${base}.conditions.${i}.right.value`, `${prefix}: ${name} level`, v, pct ? 0 : v > 0 ? v * 0.5 : v * 1.5, pct ? 100 : v > 0 ? v * 1.5 : v * 0.5, pct ? 1 : niceStep(Math.abs(v) / 20));
      }
      const len = c.left.params?.length;
      if (typeof len === 'number') add(`${base}.conditions.${i}.left.params.length`, `${prefix}: ${name} length`, len, Math.max(2, Math.floor(len / 2)), len * 2, 1);
      const rlen = c.right.kind === 'indicator' ? c.right.params?.length : undefined;
      if (typeof rlen === 'number' && c.right.kind === 'indicator') add(`${base}.conditions.${i}.right.params.length`, `${prefix}: ${describeOperand(c.right)} length`, rlen, Math.max(2, Math.floor(rlen / 2)), rlen * 2, 1);
    });
  }
  return out;
}

/** Check the creator's chosen settings against what the strategy allows; values come from the spec. */
export function checkParams(spec: StrategySpec, chosen: Array<{ id: string; label?: string; min: number; max: number; step: number }>): TemplateParam[] {
  const cands = new Map(paramCandidates(spec).map((c) => [c.id, c]));
  const seen = new Set<string>();
  return chosen.map((p, i) => {
    const c = cands.get(p.id);
    if (!c) throw new ValidationError(`“${p.id}” isn’t a setting this strategy has.`);
    if (seen.has(p.id)) throw new ValidationError(`${c.label} is listed twice.`);
    seen.add(p.id);
    if (!(p.step > 0) || !(p.min <= c.value && c.value <= p.max) || p.min >= p.max) throw new ValidationError(`${c.label}: the range must include today’s value (${c.value}).`);
    if (p.id.endsWith('.length') || p.id === 'risk.timeStopBars' || p.id === 'market.leverage') { if (p.min < 1 || !Number.isInteger(p.step)) throw new ValidationError(`${c.label} is a whole number of at least 1.`); }
    if (p.id === 'market.leverage' && p.max > VENUE_INFO[spec.market.venue].maxLeverage) throw new ValidationError(`Leverage can’t go above ${VENUE_INFO[spec.market.venue].maxLeverage}× on ${VENUE_INFO[spec.market.venue].label}.`);
    if (p.min <= 0 && !p.id.includes('.right.value')) throw new ValidationError(`${c.label} must stay above 0.`);
    return { key: `p${i + 1}`, id: p.id, label: (p.label?.trim() || c.label).slice(0, 60), min: p.min, max: p.max, step: p.step, value: c.value };
  });
}

/** The template's spec with a subscriber's settings (by key) applied, each within its range and on its step. */
export function applyParams(spec: StrategySpec, params: TemplateParam[], values: Record<string, number>): StrategySpec {
  const out = structuredClone(spec);
  for (const [key, raw] of Object.entries(values)) {
    const p = params.find((x) => x.key === key);
    if (!p) throw new ValidationError(`“${key}” isn’t a setting of this strategy.`);
    const id = p.id;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new ValidationError(`${p.label} needs a number.`);
    if (raw < p.min || raw > p.max) throw new ValidationError(`${p.label} must be between ${p.min} and ${p.max}.`);
    const v = round(raw, p.step);
    if (getAt(out, parsePath(id)) === undefined) throw new ValidationError(`${p.label} doesn’t apply to this strategy.`);
    setAt(out, parsePath(id), v);
  }
  return out;
}

// ── Creators (H2) ──
export interface CreatorInput { displayName: string; bio: string; experience?: string; links?: string[] }
const creatorDto = (c: { id: string; displayName: string; bio: string; experience: string | null; links: string[]; status: string; reviewNote: string | null; createdAt: Date }) =>
  ({ id: c.id, displayName: c.displayName, bio: c.bio, experience: c.experience, links: c.links, status: c.status, reviewNote: c.reviewNote, createdAt: c.createdAt.toISOString() });

export async function getCreator(userId: string) {
  const c = await prisma.creatorProfile.findUnique({ where: { userId } });
  return c ? creatorDto(c) : null;
}

export async function applyCreator(userId: string, input: CreatorInput) {
  await requireFeatureFor(userId, 'marketplace.publish', 'Publishing strategies');
  const cur = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (cur?.status === 'suspended') throw new ForbiddenError('Your creator profile is suspended. Email us if you think that’s wrong.');
  const data = { displayName: input.displayName, bio: input.bio, experience: input.experience ?? null, links: input.links ?? [] };
  // An approved creator just edits; a rejected one re-applies.
  const row = cur
    ? await prisma.creatorProfile.update({ where: { userId }, data: { ...data, ...(cur.status === 'rejected' ? { status: 'pending', reviewNote: null, reviewedAt: null } : {}) } })
    : await prisma.creatorProfile.create({ data: { userId, ...data } });
  return creatorDto(row);
}

async function approvedCreator(userId: string) {
  const c = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!c || c.status !== 'approved') throw new ForbiddenError(c?.status === 'pending' ? 'Your creator application is still in review.' : 'Apply to the creator programme first.');
  return c;
}

// ── Performance, computed here ──
export interface Performance {
  backtest: { from: string; to: string; days: number; metrics: Record<string, number | null>; equity: Array<{ t: number; equity: number }> } | null;
  computedAt: string;
  note?: string;
}

/** A backtest TRADElogs runs itself on the template's rules: the last 180 days, or fewer on fast intervals. */
export async function computePerformance(spec: StrategySpec, deps: StrategyDeps = defaultStrategyDeps): Promise<Performance> {
  const ms = INTERVAL_MS[spec.session.interval];
  const days = Math.max(7, Math.min(180, Math.floor((8000 * ms) / 86_400_000)));
  const to = Math.floor(deps.now() / 3_600_000) * 3_600_000;
  const from = to - days * 86_400_000;
  try {
    const run = await backtestSpec(spec, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), capital: 10_000, slippageBps: 5 }, deps);
    const m = run.result.metrics;
    const pick = ['totalReturnPct', 'maxDrawdownPct', 'winRatePct', 'profitFactor', 'trades', 'sharpe', 'avgTradePct', 'exposurePct'] as const;
    const eq = run.result.equity;
    const stepN = Math.max(1, Math.ceil(eq.length / 120));
    return {
      backtest: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days, metrics: Object.fromEntries(pick.map((k) => [k, (m as unknown as Record<string, number | null>)[k] ?? null])), equity: eq.filter((_, i) => i % stepN === 0 || i === eq.length - 1) },
      computedAt: new Date(deps.now()).toISOString(),
    };
  } catch (err) {
    logger.warn('[marketplace] backtest failed', { err: (err as Error).message });
    return { backtest: null, computedAt: new Date(deps.now()).toISOString(), note: (err as Error).message };
  }
}

/** The creator's own run of this strategy, from its recorded trades. */
async function trackOf(t: Pick<StrategyTemplate, 'trackDeploymentId' | 'creatorId'>) {
  if (!t.trackDeploymentId) return null;
  const d = await prisma.strategyDeployment.findFirst({ where: { id: t.trackDeploymentId, userId: t.creatorId } });
  if (!d) return null;
  const agg = await prisma.deploymentTrade.aggregate({ where: { deploymentId: d.id }, _sum: { pnl: true }, _count: true });
  const wins = await prisma.deploymentTrade.count({ where: { deploymentId: d.id, pnl: { gt: 0 } } });
  const pnl = agg._sum.pnl ?? 0;
  return { mode: d.mode as 'paper' | 'live', status: d.status, since: d.startedAt.toISOString(), trades: agg._count, pnl, returnPct: d.capital > 0 ? (pnl / d.capital) * 100 : null, winRatePct: agg._count ? (wins / agg._count) * 100 : null };
}

// ── Templates (creator side) ──
export interface TemplateInput {
  strategyId: string; name: string; summary: string; description: string; category: Category; risk: Risk;
  params: Array<{ id: string; label?: string; min: number; max: number; step: number }>;
  exchanges: string[]; trackDeploymentId?: string | null;
}

async function ownStrategySpec(userId: string, strategyId: string) {
  const s = await prisma.strategy.findFirst({ where: { id: strategyId, userId } });
  if (!s) throw new NotFoundError('Strategy not found');
  if (s.source === 'template') throw new ForbiddenError('You can’t republish a marketplace strategy.');
  const spec = s.spec as unknown as StrategySpec;
  const v = validateStrategy(spec);
  if (v.blockers.length) throw new ValidationError(`Fix this first: ${v.blockers[0]!.message}`);
  return { s, spec, v };
}

async function checkTrack(userId: string, strategyId: string, id: string | null | undefined) {
  if (!id) return null;
  const d = await prisma.strategyDeployment.findFirst({ where: { id, userId, strategyId } });
  if (!d) throw new ValidationError('The track record has to be one of your own runs of this strategy.');
  return d.id;
}

const VENUES = Object.keys(VENUE_INFO);
function checkExchanges(spec: StrategySpec, v: ReturnType<typeof validateStrategy>, exchanges: string[]) {
  for (const e of exchanges) if (!VENUES.includes(e)) throw new ValidationError(`Unknown exchange “${e}”.`);
  // Live runs need a stop; a template that may run live has to pass the live checks.
  if (exchanges.length && v.live.length) throw new ValidationError(`To allow live runs: ${v.live[0]!.message}`);
  if (exchanges.length && !exchanges.includes(spec.market.venue)) throw new ValidationError(`The strategy is built for ${VENUE_INFO[spec.market.venue].label}; include it in the exchanges.`);
}

export async function createTemplate(userId: string, input: TemplateInput, deps: StrategyDeps = defaultStrategyDeps) {
  await requireFeatureFor(userId, 'marketplace.publish', 'Publishing strategies');
  await approvedCreator(userId);
  await assertWithinLimit(userId, 'templates', await prisma.strategyTemplate.count({ where: { creatorId: userId, status: { in: ['pending', 'published'] } } }), 'Unlist one first.');
  const { s, spec, v } = await ownStrategySpec(userId, input.strategyId);
  checkExchanges(spec, v, input.exchanges);
  const params = checkParams(spec, input.params);
  const track = await checkTrack(userId, s.id, input.trackDeploymentId);
  const performance = await computePerformance(spec, deps);
  const t = await prisma.strategyTemplate.create({
    data: {
      creatorId: userId, strategyId: s.id, version: s.version, spec: spec as object, name: input.name, summary: input.summary, description: input.description,
      category: input.category, risk: input.risk, params: params as unknown as Prisma.InputJsonValue, exchanges: input.exchanges, symbols: spec.market.symbols.map((x) => x.symbol),
      interval: spec.session.interval, trackDeploymentId: track, performance: performance as unknown as Prisma.InputJsonValue, status: 'pending',
    },
  });
  return creatorTemplateDto(t);
}

export async function updateTemplate(userId: string, id: string, input: Partial<Omit<TemplateInput, 'strategyId'>> & { refreshRules?: boolean }, deps: StrategyDeps = defaultStrategyDeps) {
  const t = await prisma.strategyTemplate.findFirst({ where: { id, creatorId: userId } });
  if (!t) throw new NotFoundError('Template not found');
  await approvedCreator(userId);
  let spec = t.spec as unknown as StrategySpec;
  const data: Prisma.StrategyTemplateUpdateInput = {};
  if (input.refreshRules) {
    // New rules go back to review.
    if (!t.strategyId) throw new ConflictError('The strategy this came from was deleted.');
    const o = await ownStrategySpec(userId, t.strategyId);
    spec = o.spec;
    Object.assign(data, { spec: spec as object, version: o.s.version, symbols: spec.market.symbols.map((x) => x.symbol), interval: spec.session.interval, status: 'pending', reviewNote: null, performance: (await computePerformance(spec, deps)) as unknown as Prisma.InputJsonValue });
  }
  const v = validateStrategy(spec);
  if (input.exchanges) { checkExchanges(spec, v, input.exchanges); data.exchanges = input.exchanges; }
  else if (input.refreshRules) checkExchanges(spec, v, t.exchanges);
  if (input.params) data.params = checkParams(spec, input.params) as unknown as Prisma.InputJsonValue;
  else if (input.refreshRules) data.params = checkParams(spec, t.params as unknown as TemplateParam[]) as unknown as Prisma.InputJsonValue;
  if (input.trackDeploymentId !== undefined) data.trackDeploymentId = t.strategyId ? await checkTrack(userId, t.strategyId, input.trackDeploymentId) : null;
  for (const k of ['name', 'summary', 'description', 'category', 'risk'] as const) if (input[k] != null) (data as Record<string, unknown>)[k] = input[k];
  return creatorTemplateDto(await prisma.strategyTemplate.update({ where: { id }, data }));
}

/** Creator: hide a published template from the marketplace, or put it back. Subscribers keep running. */
export async function setListed(userId: string, id: string, listed: boolean) {
  const t = await prisma.strategyTemplate.findFirst({ where: { id, creatorId: userId } });
  if (!t) throw new NotFoundError('Template not found');
  if (listed && t.status !== 'unlisted') throw new ConflictError(t.status === 'pending' ? 'It’s still in review.' : 'Only an unlisted template can be listed again.');
  if (!listed && t.status !== 'published') throw new ConflictError('Only a published template can be unlisted.');
  return creatorTemplateDto(await prisma.strategyTemplate.update({ where: { id }, data: { status: listed ? 'published' : 'unlisted' } }));
}

const subCounts = async (ids: string[]) => new Map((await prisma.templateSubscription.groupBy({ by: ['templateId'], where: { templateId: { in: ids }, status: { in: ACTIVE_SUBS } }, _count: true })).map((g) => [g.templateId!, g._count]));

function creatorTemplateDto(t: StrategyTemplate, subscribers = 0) {
  return {
    id: t.id, name: t.name, summary: t.summary, description: t.description, category: t.category, risk: t.risk, status: t.status, reviewNote: t.reviewNote,
    params: t.params as unknown as TemplateParam[], exchanges: t.exchanges, symbols: t.symbols, interval: t.interval, version: t.version, strategyId: t.strategyId,
    trackDeploymentId: t.trackDeploymentId, performance: t.performance as unknown as Performance | null, subscribers,
    publishedAt: t.publishedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

export async function myTemplates(userId: string) {
  const rows = await prisma.strategyTemplate.findMany({ where: { creatorId: userId }, orderBy: { updatedAt: 'desc' } });
  const subs = await subCounts(rows.map((r) => r.id));
  return rows.map((r) => creatorTemplateDto(r, subs.get(r.id) ?? 0));
}

/** For the publish form: a strategy's tunable settings and the runs that could be its track record. */
export async function publishOptions(userId: string, strategyId: string) {
  const { s, spec, v } = await ownStrategySpec(userId, strategyId);
  const runs = await prisma.strategyDeployment.findMany({ where: { userId, strategyId: s.id }, orderBy: { startedAt: 'desc' }, take: 20, select: { id: true, mode: true, status: true, startedAt: true, version: true } });
  return {
    strategy: { id: s.id, name: s.name, version: s.version, venue: spec.market.venue, symbols: spec.market.symbols.map((x) => x.symbol), interval: spec.session.interval },
    candidates: paramCandidates(spec), liveIssues: v.live.map((i) => i.message),
    runs: runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })),
  };
}

// ── Browsing (H1) ──
export type Sort = 'popular' | 'return' | 'drawdown' | 'newest';
const factsOf = (t: StrategyTemplate) => {
  const spec = t.spec as unknown as StrategySpec;
  return {
    direction: spec.market.direction, leverage: spec.market.leverage, venue: spec.market.venue,
    hasStop: !!spec.risk.stopLoss, hasTarget: !!spec.risk.takeProfit, trailing: !!spec.risk.trailing, sessions: spec.session.mode === 'windows',
    sizing: spec.sizing.mode,
  };
};

async function cardsOf(rows: StrategyTemplate[]) {
  const ids = rows.map((r) => r.id);
  const creators = new Map((await prisma.creatorProfile.findMany({ where: { userId: { in: rows.map((r) => r.creatorId) } }, select: { userId: true, displayName: true } })).map((c) => [c.userId, c.displayName]));
  const subs = await subCounts(ids);
  return Promise.all(rows.map(async (t) => {
    const perf = t.performance as unknown as Performance | null;
    return {
      id: t.id, name: t.name, summary: t.summary, category: t.category, risk: t.risk, symbols: t.symbols, interval: t.interval, exchanges: t.exchanges,
      creator: creators.get(t.creatorId) ?? 'Creator', subscribers: subs.get(t.id) ?? 0, publishedAt: t.publishedAt?.toISOString() ?? null,
      backtest: perf?.backtest ? ({ days: perf.backtest.days, ...perf.backtest.metrics } as { days: number } & Record<string, number | null>) : null,
      track: await trackOf(t), facts: factsOf(t),
    };
  }));
}

/**
 * Partner-only templates are visible to their creator and to clients holding a
 * partner package that lists them. Everyone else never sees them.
 */
async function audienceWhere(userId: string | null): Promise<Prisma.StrategyTemplateWhereInput> {
  if (!userId) return { partnerOnly: false };
  const held = await prisma.clientEntitlement.findMany({ where: { userId, status: { in: ['ACTIVE', 'GRACE'] } }, select: { package: { select: { templateIds: true } } } });
  const ids = [...new Set(held.flatMap(h => h.package.templateIds))];
  return { OR: [{ partnerOnly: false }, { creatorId: userId }, ...(ids.length ? [{ id: { in: ids } }] : [])] };
}

export async function browse(q: { category?: string; risk?: string; symbol?: string; q?: string; sort?: Sort }, userId: string | null = null) {
  const where: Prisma.StrategyTemplateWhereInput = { status: 'published', AND: [await audienceWhere(userId)] };
  if (q.category && (CATEGORIES as readonly string[]).includes(q.category)) where.category = q.category;
  if (q.risk && (RISKS as readonly string[]).includes(q.risk)) where.risk = q.risk;
  if (q.symbol) where.symbols = { has: q.symbol.toUpperCase() };
  if (q.q?.trim()) where.OR = [{ name: { contains: q.q.trim(), mode: 'insensitive' } }, { summary: { contains: q.q.trim(), mode: 'insensitive' } }];
  const rows = await prisma.strategyTemplate.findMany({ where, orderBy: { publishedAt: 'desc' }, take: 200 });
  const cards = await cardsOf(rows);
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const sort = q.sort ?? 'popular';
  cards.sort((a, b) =>
    sort === 'newest' ? (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
    : sort === 'return' ? (num(b.backtest?.totalReturnPct) ?? -Infinity) - (num(a.backtest?.totalReturnPct) ?? -Infinity)
    : sort === 'drawdown' ? (num(b.backtest?.maxDrawdownPct) ?? -Infinity) - (num(a.backtest?.maxDrawdownPct) ?? -Infinity)
    : b.subscribers - a.subscribers || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return cards;
}

/** One template as a subscriber sees it: everything except the rules. */
export async function templateDetail(userId: string, id: string) {
  const t = await prisma.strategyTemplate.findFirst({ where: { id, OR: [{ status: 'published' }, { creatorId: userId }], AND: [await audienceWhere(userId)] } });
  if (!t) throw new NotFoundError('Strategy not found');
  const [card] = await cardsOf([t]);
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: t.creatorId }, select: { displayName: true, bio: true, links: true } });
  const mine = await prisma.templateSubscription.findFirst({ where: { userId, templateId: id, status: { in: ACTIVE_SUBS } }, select: { id: true, status: true, deploymentId: true } });
  const perf = t.performance as unknown as Performance | null;
  return {
    ...card!, description: t.description, status: t.status, isCreator: t.creatorId === userId,
    creatorProfile: creator, params: (t.params as unknown as TemplateParam[]).map(({ key, label, min, max, step, value }) => ({ key, label, min, max, step, value })),
    equity: perf?.backtest?.equity ?? [], backtestWindow: perf?.backtest ? { from: perf.backtest.from, to: perf.backtest.to } : null, computedAt: perf?.computedAt ?? null,
    subscription: mine,
  };
}

// ── Subscriptions (H1 subscribe, H3 manage) ──
export interface SubscribeInput { mode: 'paper' | 'live'; capital?: number; connectionId?: string; confirmLive?: boolean; params?: Record<string, number> }

export async function subscribe(userId: string, templateId: string, input: SubscribeInput) {
  const t = await prisma.strategyTemplate.findFirst({ where: { id: templateId, status: 'published', AND: [await audienceWhere(userId)] } });
  if (!t) throw new NotFoundError('Strategy not found');
  if (t.creatorId === userId) throw new ConflictError('This is your own strategy; run it from your strategies instead.');
  if (await prisma.templateSubscription.findFirst({ where: { userId, templateId, status: { in: ACTIVE_SUBS } } })) throw new ConflictError('You’re already running this one. Manage it from Subscriptions.');
  await assertWithinLimit(userId, 'subscriptions', await prisma.templateSubscription.count({ where: { userId, status: { in: ACTIVE_SUBS } } }), 'Cancel one first.');
  if (input.mode === 'live') {
    if (!input.connectionId) throw new ValidationError('Pick the exchange account to trade.');
    const conn = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId } });
    if (!conn) throw new NotFoundError('Exchange account not found');
    const venue = conn.exchange === 'DELTA_INDIA' ? 'delta_india' : String(conn.exchange).toLowerCase();
    if (!t.exchanges.includes(venue)) throw new ConflictError(t.exchanges.length ? `The creator allows live runs on ${t.exchanges.map((e) => VENUE_INFO[e as keyof typeof VENUE_INFO]?.label ?? e).join(', ')} only.` : 'The creator allows paper runs only for this one.');
  }
  const params = t.params as unknown as TemplateParam[];
  const spec = applyParams(t.spec as unknown as StrategySpec, params, input.params ?? {});
  const v = validateStrategy(spec);
  if (v.blockers.length) throw new ValidationError(`Those settings don’t work together: ${v.blockers[0]!.message}`);
  // The private copy: its rules never show in the builder or the run's feed.
  const copy = await prisma.strategy.create({
    data: { userId, name: t.name, description: t.summary, spec: spec as object, source: 'template', templateId: t.id, status: 'draft', versions: { create: { version: 1, spec: spec as object, note: 'From the marketplace' } } },
  });
  let deployment: { id: string };
  try {
    deployment = await createDeployment(userId, copy.id, { mode: input.mode, capital: input.capital, connectionId: input.connectionId, confirmLive: input.confirmLive } as DeployInput, undefined, { fromSubscription: true });
  } catch (err) {
    await prisma.strategy.delete({ where: { id: copy.id } }).catch(() => undefined);
    throw err;
  }
  const sub = await prisma.templateSubscription.create({ data: { userId, templateId: t.id, strategyId: copy.id, deploymentId: deployment.id, params: (input.params ?? {}) as Prisma.InputJsonValue } });
  return { id: sub.id, deploymentId: deployment.id };
}

export async function mySubscriptions(userId: string) {
  const subs = await prisma.templateSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { template: { select: { id: true, name: true, creatorId: true, params: true, status: true } } } });
  const deps = await prisma.strategyDeployment.findMany({ where: { id: { in: subs.map((s) => s.deploymentId).filter((x): x is string => !!x) } } });
  const byId = new Map(deps.map((d) => [d.id, d]));
  const pnl = new Map((await prisma.deploymentTrade.groupBy({ by: ['deploymentId'], where: { deploymentId: { in: deps.map((d) => d.id) } }, _sum: { pnl: true }, _count: true })).map((g) => [g.deploymentId, g]));
  const creators = new Map((await prisma.creatorProfile.findMany({ where: { userId: { in: subs.map((s) => s.template?.creatorId).filter((x): x is string => !!x) } }, select: { userId: true, displayName: true } })).map((c) => [c.userId, c.displayName]));
  return subs.map((s) => {
    const d = s.deploymentId ? byId.get(s.deploymentId) : undefined;
    const snap = (d?.snapshot ?? {}) as { open?: Array<{ unrealized: number }> };
    const sizes = (d?.sizeSchedule ?? []) as Array<{ multiplier: number }>;
    const labels = new Map(((s.template?.params ?? []) as unknown as TemplateParam[]).map((p) => [p.key, p.label]));
    // The run can also be paused or stopped from Deployments; show what it's actually doing.
    const status = s.status === 'cancelled' ? 'cancelled' : !d ? 'ended' : d.status === 'paused' ? 'paused' : ['stopping', 'stopped', 'archived'].includes(d.status) ? 'ended' : d.status === 'errored' ? 'attention' : 'active';
    return {
      id: s.id, status, createdAt: s.createdAt.toISOString(), cancelledAt: s.cancelledAt?.toISOString() ?? null,
      template: s.template ? { id: s.template.id, name: s.template.name, creator: creators.get(s.template.creatorId) ?? 'Creator', listed: s.template.status === 'published' } : null,
      params: Object.entries((s.params ?? {}) as Record<string, number>).map(([key, value]) => ({ key, label: labels.get(key) ?? key, value })),
      deployment: d ? {
        id: d.id, mode: d.mode, status: d.status, capital: d.capital, multiplier: sizes.at(-1)?.multiplier ?? 1,
        closedPnl: pnl.get(d.id)?._sum.pnl ?? 0, trades: pnl.get(d.id)?._count ?? 0,
        openPnl: d.mode === 'paper' ? (snap.open ?? []).reduce((a, o) => a + o.unrealized, 0) : null,
        startedAt: d.startedAt.toISOString(), error: d.error,
      } : null,
    };
  });
}

async function ownSub(userId: string, id: string) {
  const s = await prisma.templateSubscription.findFirst({ where: { id, userId } });
  if (!s) throw new NotFoundError('Subscription not found');
  if (s.status === 'cancelled') throw new ConflictError('This subscription is cancelled.');
  if (!s.deploymentId) throw new ConflictError('This subscription has no run to manage.');
  return s as typeof s & { deploymentId: string };
}

/** H3: pause / resume / cancel (stop or settle now) / size. The run is the subscriber's own deployment. */
export async function manageSubscription(userId: string, id: string, action: 'pause' | 'resume' | 'cancel' | 'cancel_settle', deps: StrategyDeps = defaultStrategyDeps) {
  const s = await ownSub(userId, id);
  if (action === 'pause' || action === 'resume') {
    await controlDeployment(userId, s.deploymentId, action, {}, deps);
    await prisma.templateSubscription.update({ where: { id }, data: { status: action === 'pause' ? 'paused' : 'active' } });
  } else {
    // Stop lets open trades finish on their own exits; settle closes them now.
    await controlDeployment(userId, s.deploymentId, action === 'cancel' ? 'stop' : 'settle', {}, deps);
    await prisma.templateSubscription.update({ where: { id }, data: { status: 'cancelled', cancelledAt: new Date() } });
  }
  return (await mySubscriptions(userId)).find((x) => x.id === id)!;
}

export async function resizeSubscription(userId: string, id: string, multiplier: number) {
  const s = await ownSub(userId, id);
  await setMultiplier(userId, s.deploymentId, multiplier);
  return (await mySubscriptions(userId)).find((x) => x.id === id)!;
}

// ── Admin review ──
export async function adminQueue(status = 'pending') {
  const [creators, templates] = await Promise.all([
    prisma.creatorProfile.findMany({ where: status === 'all' ? {} : { status }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { email: true, name: true } } } }),
    prisma.strategyTemplate.findMany({ where: status === 'all' ? {} : { status }, orderBy: { updatedAt: 'asc' }, take: 100 }),
  ]);
  const names = new Map((await prisma.creatorProfile.findMany({ where: { userId: { in: templates.map((t) => t.creatorId) } }, select: { userId: true, displayName: true } })).map((c) => [c.userId, c.displayName]));
  return {
    creators: creators.map((c) => ({ ...creatorDto(c), email: c.user.email, name: c.user.name })),
    // Admins see the rules so they can judge them.
    templates: templates.map((t) => ({ ...creatorTemplateDto(t), creator: names.get(t.creatorId) ?? '?', readback: describeStrategy(t.spec as unknown as StrategySpec), facts: factsOf(t) })),
  };
}

export async function reviewCreator(id: string, decision: 'approve' | 'reject' | 'suspend', note?: string) {
  const c = await prisma.creatorProfile.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Creator not found');
  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'suspended';
  await prisma.creatorProfile.update({ where: { id }, data: { status, reviewNote: note ?? null, reviewedAt: new Date() } });
  // A suspended creator's templates leave the marketplace; subscribers keep running.
  if (status === 'suspended') await prisma.strategyTemplate.updateMany({ where: { creatorId: c.userId, status: 'published' }, data: { status: 'unlisted' } });
  return { id, status };
}

export async function reviewTemplate(id: string, decision: 'publish' | 'reject' | 'unlist', note?: string) {
  const t = await prisma.strategyTemplate.findUnique({ where: { id } });
  if (!t) throw new NotFoundError('Template not found');
  if (decision === 'publish') {
    const c = await prisma.creatorProfile.findUnique({ where: { userId: t.creatorId } });
    if (c?.status !== 'approved') throw new ConflictError('The creator isn’t approved.');
  }
  const status = decision === 'publish' ? 'published' : decision === 'reject' ? 'rejected' : 'unlisted';
  await prisma.strategyTemplate.update({ where: { id }, data: { status, reviewNote: note ?? null, ...(decision === 'publish' && !t.publishedAt ? { publishedAt: new Date() } : {}) } });
  return { id, status };
}
