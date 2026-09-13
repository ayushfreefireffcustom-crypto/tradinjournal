// Paper book cron. Evaluates promoted strategies on the last closed bar,
// opens at most one fill per strategy+symbol, and resolves with the same
// triple-barrier rule as the backtest (stop wins if both hit).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { Prisma } from '@tradinjournal/db';
import { timeframeMs } from '@tradinjournal/core';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { notifyPaperEvent } from './paper.notify.js';
import {
  advancePosition,
  lastClosedIndex,
  levelsForSignal,
  normalizeStrategyRules,
  signalOnBar,
  type StrategyRules,
  type StrategyTimeframe,
  type WalkForwardBacktest,
} from './strategy-backtest.js';
import type { MarketTimeframe } from '@tradinjournal/contracts';

export interface PaperTickResult {
  scanned: number;
  opened: number;
  closed: number;
  errors: number;
}

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function asWalk(raw: unknown): WalkForwardBacktest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as WalkForwardBacktest;
  if (!o.promote || !o.symbol || !o.timeframe) return null;
  return o;
}

export async function promoteStrategy(userId: string, strategyId: string): Promise<{
  id: string;
  status: string;
  emailOn: boolean;
}> {
  const row = await prisma.traderStrategy.findFirst({ where: { id: strategyId, userId } });
  if (!row) throw new ValidationError('Strategy not found.');
  const rules = normalizeStrategyRules(row.rules);
  const bt = asWalk(row.lastBacktest);
  if (!rules?.symbol || !rules.timeframe) {
    throw new ValidationError('Backtest this strategy on a symbol and timeframe first.');
  }
  if (!bt?.promote?.ok) {
    const why = bt?.promote?.reasons?.[0] ?? 'Backtest does not pass the holdout gates.';
    throw new ValidationError(why);
  }
  if (bt.symbol !== rules.symbol || bt.timeframe !== rules.timeframe) {
    throw new ValidationError('Backtest does not match the bound symbol and timeframe.');
  }

  await prisma.traderStrategy.update({
    where: { id: row.id },
    data: { status: 'paper' },
  });
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { email: true },
  });
  return { id: row.id, status: 'paper', emailOn: prefs?.email === true };
}

export async function archiveStrategy(userId: string, strategyId: string): Promise<{ id: string; status: string }> {
  const row = await prisma.traderStrategy.findFirst({ where: { id: strategyId, userId } });
  if (!row) throw new ValidationError('Strategy not found.');
  await prisma.traderStrategy.update({ where: { id: row.id }, data: { status: 'archived' } });
  await prisma.traderPaperPosition.updateMany({
    where: { strategyId: row.id, status: 'open' },
    data: { status: 'expired', closedAt: new Date() },
  });
  return { id: row.id, status: 'archived' };
}

export async function tickPaperBook(limit = 40): Promise<PaperTickResult> {
  const rows = await prisma.traderStrategy.findMany({
    where: { status: 'paper' },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  let opened = 0;
  let closed = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const delta = await tickOne(row.id, row.userId, row.name, row.rules);
      opened += delta.opened;
      closed += delta.closed;
    } catch (err) {
      errors += 1;
      logger.warn(`[trader/paper] ${row.id}: ${(err as Error).message}`);
    }
  }

  if (opened || closed) {
    logger.info(`[trader/paper] scanned=${rows.length} opened=${opened} closed=${closed} err=${errors}`);
  }
  return { scanned: rows.length, opened, closed, errors };
}

async function tickOne(
  strategyId: string,
  userId: string,
  name: string,
  rawRules: unknown,
): Promise<{ opened: number; closed: number }> {
  const rules = normalizeStrategyRules(rawRules);
  if (!rules?.symbol || !rules.timeframe) return { opened: 0, closed: 0 };

  const tf = rules.timeframe as MarketTimeframe;
  const candles = await loadPublicCandles(rules.symbol, tf, 500);
  if (candles.length < 80) return { opened: 0, closed: 0 };

  const tfMs = timeframeMs(rules.timeframe);
  const closedN = await resolveOpen(strategyId, userId, name, rules, candles, tfMs);
  const openedN = await maybeOpen(strategyId, userId, name, rules, candles, tfMs);
  return { opened: openedN, closed: closedN };
}

async function resolveOpen(
  strategyId: string,
  userId: string,
  name: string,
  rules: StrategyRules,
  candles: { openTime: number; open: number; high: number; low: number; close: number; volume: number }[],
  tfMs: number,
): Promise<number> {
  const open = await prisma.traderPaperPosition.findFirst({
    where: { strategyId, symbol: rules.symbol, status: 'open' },
  });
  if (!open) return 0;

  const advanced = advancePosition({
    side: open.side === 'SHORT' ? 'SHORT' : 'LONG',
    entry: Number(open.entry),
    stop: Number(open.stop),
    target: Number(open.target),
    entryBarTime: open.entryBarTime.getTime(),
    horizonBars: rules.horizonBars ?? 48,
    candles,
    tfMs,
  });

  await prisma.traderPaperPosition.update({
    where: { id: open.id },
    data: {
      mfePct: advanced.mfePct,
      maePct: advanced.maePct,
      ...(advanced.status === 'open'
        ? {}
        : {
            status: advanced.status,
            exit: advanced.exit ?? undefined,
            exitBarTime: advanced.exitTime ? new Date(advanced.exitTime) : undefined,
            pnlPct: advanced.pnlPct ?? undefined,
            closedAt: new Date(),
          }),
    },
  });

  if (advanced.status === 'open') return 0;

  await notifyPaperEvent({
    userId,
    positionId: open.id,
    strategyName: name,
    symbol: open.symbol,
    side: open.side === 'SHORT' ? 'SHORT' : 'LONG',
    entry: Number(open.entry),
    stop: Number(open.stop),
    target: Number(open.target),
    timeframe: open.timeframe,
    event: 'close',
    status: advanced.status,
    exit: advanced.exit,
    pnlPct: advanced.pnlPct,
  });
  return 1;
}

async function maybeOpen(
  strategyId: string,
  userId: string,
  name: string,
  rules: StrategyRules,
  candles: { openTime: number; open: number; high: number; low: number; close: number; volume: number }[],
  tfMs: number,
): Promise<number> {
  const existing = await prisma.traderPaperPosition.findFirst({
    where: { strategyId, symbol: rules.symbol, status: 'open' },
    select: { id: true },
  });
  if (existing) return 0;

  const i = lastClosedIndex(candles, tfMs);
  if (i < 2) return 0;
  const side = signalOnBar(candles, rules, i);
  if (!side) return 0;

  const levels = levelsForSignal(candles, i, side, rules);
  const barTime = new Date(candles[i]!.openTime);
  try {
    const created = await prisma.traderPaperPosition.create({
      data: {
        strategyId,
        userId,
        symbol: rules.symbol!,
        timeframe: rules.timeframe as StrategyTimeframe,
        side,
        entry: levels.entry,
        stop: levels.stop,
        target: levels.target,
        status: 'open',
        entryBarTime: barTime,
      },
    });
    await notifyPaperEvent({
      userId,
      positionId: created.id,
      strategyName: name,
      symbol: rules.symbol!,
      side,
      entry: levels.entry,
      stop: levels.stop,
      target: levels.target,
      timeframe: rules.timeframe!,
      event: 'open',
    });
    return 1;
  } catch (err) {
    if (isUnique(err)) return 0;
    throw err;
  }
}
