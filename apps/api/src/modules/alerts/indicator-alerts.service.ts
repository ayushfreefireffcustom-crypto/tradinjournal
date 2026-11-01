// Indicator alerts (E3): "RSI(14) crosses below 30 on BTCUSDT 1h". Rules are
// checked once per closed bar — never on the bar still forming, so a wick that
// reverses before the close doesn't fire. Candles are fetched once per
// (symbol, timeframe) and only when a new bar has closed for some rule in the
// group. Delivery follows price alerts: in-app + push here, Telegram picks the
// notification up from the inbox.
import { prisma, type IndicatorAlert } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import {
  INDICATORS,
  conditionWarmup,
  describeCondition,
  describeOperand,
  evaluateCondition,
  validateCondition,
  type TraderCandle as Candle,
  type Condition,
} from '@tradinjournal/core';
import { deliveryAllowed, type CreateIndicatorAlertInput, type UpdateIndicatorAlertInput } from '@tradinjournal/contracts';
import { loadPublicCandles } from '../market/market.service.js';
import { claimDelivery } from '../../lib/notifications/claim.js';
import { sendPush } from '../../lib/push.js';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { assertWithinLimit } from '../../lib/plans.js';

const TF_MS: Record<string, number> = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
/** Rules a user can keep (active, paused or triggered). */
export const MAX_INDICATOR_ALERTS = 50;
/** Most history one rule may need; candle loads are bucketed for cache reuse. */
const MAX_BARS = 1000;
const LOAD_BUCKETS = [300, 600, MAX_BARS];

export interface IndicatorAlertDeps {
  loadCandles: (symbol: string, tf: string, limit: number) => Promise<Candle[]>;
  now: () => number;
}
export const defaultIndicatorAlertDeps: IndicatorAlertDeps = {
  loadCandles: (symbol, tf, limit) => loadPublicCandles(symbol, tf as never, limit),
  now: () => Date.now(),
};

/** The indicator list for the rule builder (no compute functions). */
export function indicatorCatalogue() {
  return INDICATORS.map(({ id, label, group, params, outputs }) => ({ id, label, group, params, outputs }));
}

const conditionOf = (a: Pick<IndicatorAlert, 'left' | 'operator' | 'right'>): Condition =>
  ({ left: a.left, operator: a.operator, right: a.right }) as unknown as Condition;

/** Bars that have fully closed by `now` (the provider's last bar may still be forming). */
export function closedBars(candles: Candle[], tf: string, now: number): Candle[] {
  const ms = TF_MS[tf]!;
  let end = candles.length;
  while (end > 0 && candles[end - 1]!.openTime + ms > now) end -= 1;
  return end === candles.length ? candles : candles.slice(0, end);
}

/** Open time of the newest bar that has closed by `now`. */
const lastClosedOpen = (tf: string, now: number) => Math.floor(now / TF_MS[tf]!) * TF_MS[tf]! - TF_MS[tf]!;

function checkCondition(c: Condition): number {
  try {
    validateCondition(c);
  } catch (err) {
    if (err instanceof RangeError) throw new ValidationError(err.message);
    throw err;
  }
  const need = conditionWarmup(c);
  if (need > MAX_BARS) throw new ValidationError(`That needs ${need} bars of history; at most ${MAX_BARS} are loaded. Use shorter lengths.`);
  return need;
}

const dto = (a: IndicatorAlert & { firings?: Array<{ firedAt: Date }> }) => ({
  id: a.id,
  symbol: a.symbol,
  timeframe: a.timeframe,
  left: a.left,
  operator: a.operator,
  right: a.right,
  description: describeCondition(conditionOf(a)),
  cooldownSec: a.cooldownSec,
  recurring: a.recurring,
  status: a.status,
  note: a.note,
  lastBarTime: a.lastBarTime?.toISOString() ?? null,
  lastLeft: a.lastLeft,
  lastRight: a.lastRight,
  lastFiredAt: a.lastFiredAt?.toISOString() ?? null,
  fireCount: a.fireSeq,
  createdAt: a.createdAt.toISOString(),
});

export async function listIndicatorAlerts(userId: string) {
  const rows = await prisma.indicatorAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return rows.map(dto);
}

export async function recentFirings(userId: string, limit = 50) {
  const rows = await prisma.indicatorAlertFiring.findMany({
    where: { alert: { userId } },
    orderBy: { firedAt: 'desc' },
    take: Math.min(Math.max(1, limit), 200),
    include: { alert: true },
  });
  return rows.map((f) => ({
    id: f.id,
    alertId: f.alertId,
    symbol: f.alert.symbol,
    timeframe: f.alert.timeframe,
    description: describeCondition(conditionOf(f.alert), { left: f.leftValue, right: f.rightValue }),
    firedAt: f.firedAt.toISOString(),
    barTime: f.barTime.toISOString(),
    leftValue: f.leftValue,
    rightValue: f.rightValue,
  }));
}

/**
 * Evaluates a rule on the latest closed bar without saving it, so the builder
 * can show "RSI(14) is 44.8 now" and catch a symbol with no data.
 */
export async function previewIndicatorAlert(input: Pick<CreateIndicatorAlertInput, 'symbol' | 'timeframe' | 'left' | 'operator' | 'right'>, deps = defaultIndicatorAlertDeps) {
  const c = { left: input.left, operator: input.operator, right: input.right } as Condition;
  const need = checkCondition(c);
  const symbol = input.symbol.trim().toUpperCase();
  const candles = closedBars(await deps.loadCandles(symbol, input.timeframe, bucket(need)), input.timeframe, deps.now());
  if (candles.length === 0) throw new ValidationError(`No market data for ${symbol} on ${input.timeframe}.`);
  const e = evaluateCondition(c, candles);
  return {
    symbol,
    timeframe: input.timeframe,
    barTime: new Date(candles.at(-1)!.openTime).toISOString(),
    bars: candles.length,
    enoughData: e.met !== null,
    met: e.met,
    left: e.left,
    right: e.right,
    leftLabel: describeOperand(c.left),
    rightLabel: describeOperand(c.right),
    description: describeCondition(c, e),
  };
}

const bucket = (need: number) => LOAD_BUCKETS.find((b) => b >= need + 5) ?? MAX_BARS;

export async function createIndicatorAlert(userId: string, input: CreateIndicatorAlertInput, deps = defaultIndicatorAlertDeps) {
  const c = { left: input.left, operator: input.operator, right: input.right } as Condition;
  checkCondition(c);
  await assertWithinLimit(userId, 'indicatorAlerts', await prisma.indicatorAlert.count({ where: { userId } }), 'Delete one to add another.');
  const symbol = input.symbol.trim().toUpperCase();
  // A typo would otherwise sit silently forever. A provider outage doesn't block saving.
  let bars: Candle[] | null = null;
  try {
    bars = await deps.loadCandles(symbol, input.timeframe, 5);
  } catch (err) {
    logger.warn(`[indicator-alerts] symbol check failed for ${symbol}: ${(err as Error).message}`);
  }
  if (bars && bars.length === 0) throw new ValidationError(`No market data for ${symbol} on ${input.timeframe}.`);
  const row = await prisma.indicatorAlert.create({
    data: {
      userId,
      symbol,
      timeframe: input.timeframe,
      left: input.left as object,
      operator: input.operator,
      right: input.right as object,
      cooldownSec: input.cooldownSec ?? 3600,
      recurring: input.recurring ?? true,
      note: input.note || null,
    },
  });
  return dto(row);
}

export async function updateIndicatorAlert(userId: string, id: string, input: UpdateIndicatorAlertInput) {
  const res = await prisma.indicatorAlert.updateMany({ where: { id, userId }, data: input });
  if (res.count === 0) throw new NotFoundError('Alert not found');
  return dto(await prisma.indicatorAlert.findUniqueOrThrow({ where: { id } }));
}

export async function deleteIndicatorAlert(userId: string, id: string) {
  const res = await prisma.indicatorAlert.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new NotFoundError('Alert not found');
  return { ok: true };
}

/**
 * Should a rule fire on this bar? Crosses fire on the crossing bar. Level
 * conditions ("RSI below 30") fire when they become true — on the first bar
 * the rule sees, or after having been false the bar before — not on every bar
 * they stay true. Cooldown caps how often one rule can notify.
 */
export function shouldFire(
  a: Pick<IndicatorAlert, 'operator' | 'lastBarTime' | 'lastFiredAt' | 'cooldownSec'>,
  c: Condition,
  closed: Candle[],
  now: number,
): { fire: boolean; e: ReturnType<typeof evaluateCondition> } {
  const e = evaluateCondition(c, closed);
  if (!e.met) return { fire: false, e };
  if (a.lastFiredAt && now - a.lastFiredAt.getTime() < a.cooldownSec * 1000) return { fire: false, e };
  if (a.operator === 'crosses_above' || a.operator === 'crosses_below') return { fire: true, e };
  if (a.lastBarTime == null) return { fire: true, e };
  return { fire: e.prevMet !== true, e };
}

/** Checks every active rule whose next bar has closed. Safe to run on several workers. */
export async function dispatchIndicatorAlerts(deps = defaultIndicatorAlertDeps, scope?: { userIds?: string[] }): Promise<{ groups: number; checked: number; fired: number }> {
  const now = deps.now();
  const all = await prisma.indicatorAlert.findMany({ where: { status: 'active', ...(scope?.userIds ? { userId: { in: scope.userIds } } : {}) } });
  // Only rules with a newly closed bar; a 1d rule costs one fetch a day.
  const due = all.filter((a) => TF_MS[a.timeframe] && (a.lastBarTime == null || a.lastBarTime.getTime() < lastClosedOpen(a.timeframe, now)));
  if (due.length === 0) return { groups: 0, checked: 0, fired: 0 };

  const groups = new Map<string, IndicatorAlert[]>();
  for (const a of due) {
    const k = `${a.symbol}::${a.timeframe}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
  }

  const userIds = [...new Set(due.map((a) => a.userId))];
  const [prefRows, subs] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } }),
    prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } }),
  ]);
  const prefs = new Map(prefRows.map((p) => [p.userId, p]));
  const subsByUser = new Map<string, typeof subs>();
  for (const s of subs) (subsByUser.get(s.userId) ?? subsByUser.set(s.userId, []).get(s.userId)!).push(s);

  let checked = 0;
  let fired = 0;
  for (const rules of groups.values()) {
    const { symbol, timeframe } = rules[0]!;
    const need = Math.max(...rules.map((r) => { try { return conditionWarmup(conditionOf(r)); } catch { return 0; } }));
    let closed: Candle[];
    try {
      closed = closedBars(await deps.loadCandles(symbol, timeframe, bucket(Math.min(need, MAX_BARS))), timeframe, now);
    } catch (err) {
      logger.warn(`[indicator-alerts] candles failed for ${symbol} ${timeframe}: ${(err as Error).message}`);
      continue;
    }
    const bar = closed.at(-1);
    if (!bar) continue;
    const barTime = new Date(bar.openTime);

    for (const a of rules) {
      if (a.lastBarTime && a.lastBarTime.getTime() >= bar.openTime) continue; // feed behind: nothing new
      checked += 1;
      let res: ReturnType<typeof shouldFire>;
      try {
        res = shouldFire(a, conditionOf(a), closed, now);
      } catch (err) {
        logger.warn(`[indicator-alerts] rule ${a.id} invalid: ${(err as Error).message}`);
        continue;
      }
      const { fire, e } = res;
      // Claim the bar: a second worker sees lastBarTime moved and skips it.
      const claim = await prisma.indicatorAlert.updateMany({
        where: { id: a.id, lastBarTime: a.lastBarTime },
        data: {
          lastBarTime: barTime,
          lastLeft: e.left,
          lastRight: e.right,
          ...(fire ? { lastFiredAt: new Date(now), fireSeq: { increment: 1 }, ...(a.recurring ? {} : { status: 'triggered' }) } : {}),
        },
      });
      if (claim.count === 0 || !fire || e.left == null || e.right == null) continue;

      await prisma.indicatorAlertFiring.create({ data: { alertId: a.id, barTime, leftValue: e.left, rightValue: e.right } });
      fired += 1;
      const p = prefs.get(a.userId);
      const title = `${a.symbol} ${a.timeframe}: ${describeCondition(conditionOf(a))}`;
      const body = describeCondition(conditionOf(a), e) + (a.note ? ` · ${a.note}` : '');
      const href = `/charts?symbol=${encodeURIComponent(a.symbol)}&tf=${a.timeframe}`;
      const key = `indalert:${a.id}:${a.fireSeq}`;
      if ((p?.inApp ?? true) && (await claimDelivery(a.userId, key, 'in_app'))) {
        await prisma.notification.create({ data: { userId: a.userId, kind: 'indicator_alert', title, body, href } });
      }
      if (deliveryAllowed('indicator_alert', 'push', p?.push ?? false, p?.groups)) {
        const mine = subsByUser.get(a.userId) ?? [];
        if (mine.length && (await claimDelivery(a.userId, key, 'push'))) {
          for (const s of mine) {
            const r = await sendPush(s, { title, body, url: href });
            if (r === 'gone') await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          }
        }
      }
    }
  }
  return { groups: groups.size, checked, fired };
}
