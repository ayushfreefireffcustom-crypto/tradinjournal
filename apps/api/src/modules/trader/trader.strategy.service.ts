// Strategy builder: plain English → typed rules (LLM parse only) → deterministic backtest.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { Prisma } from '@tradinjournal/db';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import type { MarketTimeframe } from '@tradinjournal/contracts';
import { userEmailEnabled } from './paper.notify.js';
import {
  normalizeStrategyRules,
  walkForwardBacktest,
  type StrategyRules,
  type StrategyTimeframe,
  type WalkForwardBacktest,
} from './strategy-backtest.js';

function asStrategyTf(tf: MarketTimeframe): StrategyTimeframe {
  if (tf === '15m' || tf === '1h' || tf === '4h' || tf === '1d') return tf;
  return '1h';
}

const PARSE_SYSTEM = `You convert plain-English trading strategy descriptions into ONE JSON object.
Return ONLY JSON (no markdown) with this shape:
{
  "name": "short name",
  "kind": "ema_cross" | "rsi_threshold" | "price_vs_ema" | "breakout" | "macd_cross",
  "direction": "LONG" | "SHORT" | "BOTH",
  "fast": 20,
  "slow": 50,
  "rsiPeriod": 14,
  "rsiAbove": 70,
  "rsiBelow": 30,
  "lookback": 20,
  "stopAtr": 1.5,
  "targetR": 2,
  "horizonBars": 48
}
Pick the closest kind. Never invent unsupported indicators. Educational use only.`;

export interface PaperPositionDto {
  id: string;
  symbol: string;
  timeframe: string;
  side: string;
  entry: number;
  stop: number;
  target: number;
  status: string;
  pnlPct: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface StrategyDto {
  id: string;
  name: string;
  prompt: string;
  rules: StrategyRules;
  status: string;
  lastBacktest: WalkForwardBacktest | null;
  positions: PaperPositionDto[];
  emailOn: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRow(
  r: {
    id: string;
    name: string;
    prompt: string;
    rules: unknown;
    status: string;
    lastBacktest: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  extra?: { positions?: PaperPositionDto[]; emailOn?: boolean },
): StrategyDto {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    rules: (normalizeStrategyRules(r.rules) ?? r.rules) as StrategyRules,
    status: r.status,
    lastBacktest: (r.lastBacktest as WalkForwardBacktest | null) ?? null,
    positions: extra?.positions ?? [],
    emailOn: extra?.emailOn ?? false,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function parseRulesFromPrompt(prompt: string): Promise<{ name: string; rules: StrategyRules }> {
  // Deterministic fallback when AI is off: EMA cross defaults.
  const fallback = (): { name: string; rules: StrategyRules } => ({
    name: 'EMA cross 20/50',
    rules: {
      kind: 'ema_cross',
      direction: 'BOTH',
      fast: 20,
      slow: 50,
      stopAtr: 1.5,
      targetR: 2,
      horizonBars: 48,
    },
  });

  if (!isAiEnabled()) return fallback();

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PARSE_SYSTEM },
      { role: 'user', content: prompt.slice(0, 2000) },
    ];
    const raw = await getProvider().complete(messages);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return fallback();
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const rules = normalizeStrategyRules(parsed);
    if (!rules) return fallback();
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 64) : 'Strategy';
    return { name, rules };
  } catch (err) {
    logger.warn(`[trader/strategy] parse failed: ${(err as Error).message}`);
    return fallback();
  }
}

export async function createStrategy(
  userId: string,
  prompt: string,
  bound?: { symbol?: string; timeframe?: StrategyTimeframe },
): Promise<StrategyDto> {
  const text = prompt.trim();
  if (text.length < 8) throw new ValidationError('Describe the strategy in a bit more detail.');
  const { name, rules } = await parseRulesFromPrompt(text);
  if (bound?.symbol) rules.symbol = bound.symbol.trim().toUpperCase().slice(0, 32);
  if (bound?.timeframe) rules.timeframe = bound.timeframe;
  const row = await prisma.traderStrategy.create({
    data: {
      userId,
      name,
      prompt: text,
      rules: rules as object,
      status: 'draft',
    },
  });
  const emailOn = await userEmailEnabled(userId);
  return mapRow(row, { emailOn });
}

export async function listStrategies(userId: string): Promise<StrategyDto[]> {
  const rows = await prisma.traderStrategy.findMany({
    where: { userId, status: { not: 'archived' } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const ids = rows.map((r) => r.id);
  const [positions, emailOn] = await Promise.all([
    ids.length
      ? prisma.traderPaperPosition.findMany({
          where: { userId, strategyId: { in: ids } },
          orderBy: { openedAt: 'desc' },
          take: 200,
        })
      : Promise.resolve([]),
    userEmailEnabled(userId),
  ]);

  const byStrategy = new Map<string, PaperPositionDto[]>();
  for (const p of positions) {
    const list = byStrategy.get(p.strategyId) ?? [];
    const closed = list.filter((x) => x.status !== 'open').length;
    if (p.status !== 'open' && closed >= 3) {
      byStrategy.set(p.strategyId, list);
      continue;
    }
    list.push({
      id: p.id,
      symbol: p.symbol,
      timeframe: p.timeframe,
      side: p.side,
      entry: Number(p.entry),
      stop: Number(p.stop),
      target: Number(p.target),
      status: p.status,
      pnlPct: p.pnlPct,
      openedAt: p.openedAt.toISOString(),
      closedAt: p.closedAt?.toISOString() ?? null,
    });
    byStrategy.set(p.strategyId, list);
  }

  return rows.map((r) => mapRow(r, { positions: byStrategy.get(r.id) ?? [], emailOn }));
}

export async function backtestUserStrategy(
  userId: string,
  strategyId: string,
  symbol: string,
  tf: MarketTimeframe = '1h',
): Promise<StrategyDto> {
  const row = await prisma.traderStrategy.findFirst({ where: { id: strategyId, userId } });
  if (!row) throw new ValidationError('Strategy not found.');
  const rules = normalizeStrategyRules(row.rules);
  if (!rules) throw new ValidationError('Strategy rules are invalid.');

  const candles = await loadPublicCandles(symbol.toUpperCase(), tf, 500);
  if (candles.length < 80) throw new ValidationError('Not enough candles to backtest.');

  const bound: StrategyRules = {
    ...rules,
    symbol: symbol.toUpperCase(),
    timeframe: asStrategyTf(tf),
  };
  const payload = walkForwardBacktest(candles, bound, bound.symbol!, asStrategyTf(tf));
  if (row.status === 'paper') {
    await prisma.traderPaperPosition.updateMany({
      where: { strategyId: row.id, status: 'open' },
      data: { status: 'expired', closedAt: new Date() },
    });
  }
  const updated = await prisma.traderStrategy.update({
    where: { id: row.id },
    data: {
      rules: bound as object,
      lastBacktest: payload as unknown as Prisma.InputJsonValue,
      // Backtest does not promote. A retest pulls a live paper book back to draft.
      status: row.status === 'archived' ? 'archived' : 'draft',
    },
  });
  return mapRow(updated, { emailOn: await userEmailEnabled(userId) });
}
