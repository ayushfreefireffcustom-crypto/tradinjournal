// Strategy builder: plain English → typed rules (LLM parse only) → deterministic backtest.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { Prisma } from '@tradinjournal/db';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import {
  backtestStrategy,
  normalizeStrategyRules,
  type StrategyRules,
  type BacktestResult,
} from './strategy-backtest.js';
import type { MarketTimeframe } from '@tradinjournal/contracts';

const PARSE_SYSTEM = `You convert plain-English trading strategy descriptions into ONE JSON object.
Return ONLY JSON (no markdown) with this shape:
{
  "name": "short name",
  "kind": "ema_cross" | "rsi_threshold" | "price_vs_ema",
  "direction": "LONG" | "SHORT" | "BOTH",
  "fast": 20,
  "slow": 50,
  "rsiPeriod": 14,
  "rsiAbove": 70,
  "rsiBelow": 30,
  "stopAtr": 1.5,
  "targetR": 2,
  "horizonBars": 48
}
Pick the closest kind. Never invent unsupported indicators. Educational use only.`;

export interface StrategyDto {
  id: string;
  name: string;
  prompt: string;
  rules: StrategyRules;
  status: string;
  lastBacktest: BacktestResult | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: {
  id: string;
  name: string;
  prompt: string;
  rules: unknown;
  status: string;
  lastBacktest: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StrategyDto {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    rules: r.rules as StrategyRules,
    status: r.status,
    lastBacktest: (r.lastBacktest as BacktestResult | null) ?? null,
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

export async function createStrategy(userId: string, prompt: string): Promise<StrategyDto> {
  const text = prompt.trim();
  if (text.length < 8) throw new ValidationError('Describe the strategy in a bit more detail.');
  const { name, rules } = await parseRulesFromPrompt(text);
  const row = await prisma.traderStrategy.create({
    data: {
      userId,
      name,
      prompt: text,
      rules: rules as object,
      status: 'draft',
    },
  });
  return mapRow(row);
}

export async function listStrategies(userId: string): Promise<StrategyDto[]> {
  const rows = await prisma.traderStrategy.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return rows.map(mapRow);
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

  const result = backtestStrategy(candles, rules);
  const payload = {
    ...result,
    symbol: symbol.toUpperCase(),
    timeframe: tf,
    asOf: new Date().toISOString(),
  };
  const updated = await prisma.traderStrategy.update({
    where: { id: row.id },
    data: {
      lastBacktest: payload as unknown as Prisma.InputJsonValue,
      status: 'paper',
    },
  });
  return mapRow(updated);
}
