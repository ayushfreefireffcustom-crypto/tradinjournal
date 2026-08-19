// Trader Master orchestration: candles → features → deterministic analysis →
// optional LLM narrative/refinement → guardrail validation → persist → DTO.
//
// Invariants that make output trustworthy:
//  • Direction is the ENGINE's (deterministic top-down), never the LLM's.
//  • LLM level refinements are adopted ONLY if they match that direction AND
//    pass validateLevels; otherwise the engine's levels stand.
//  • The shipped level set is validated once more before returning.
//  • Anything unusable (no data) is a 422, never a crash.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { AssetClass, TraderAnalyzeInput, TraderAnalysisDto, TraderTimeframe } from '@tradinjournal/contracts';
import {
  TRADER_ENGINE_VER,
  extractFeatures,
  reconcileTimeframes,
  validateLevels,
  type AnalysisResult,
  type TfFeatures,
  type TraderDirection,
} from '@tradinjournal/core';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { buildSystemPrompt, parseAnalysisJson, NFA, type LlmAnalysis } from './trader.prompt.js';

/** Bars pulled per timeframe (enough for EMA50 + swing structure). */
const CANDLE_LIMIT = 300;
/** Minimum bars for a timeframe to contribute (below this the read is noise). */
const MIN_BARS = 30;

/** Pure, network-free asset-class label for the DTO/persistence. */
export function classifyAsset(symbol: string): AssetClass {
  const s = symbol.trim().toUpperCase();
  if (/(XAU|XAG|XPT|XPD)/.test(s) || /(WTI|OIL|BRENT|NATGAS)/.test(s)) return 'commodity';
  if (/USDT$|USDC$|BUSD$/.test(s) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|LTC|DOT|AVAX)/.test(s)) return 'crypto';
  if (/^[A-Z]{6}$/.test(s)) return 'forex';
  return 'stock';
}

function clampConfidence(n: number | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function invalidationText(direction: TraderDirection, stop: number): string {
  const s = Math.round(stop * 1e6) / 1e6;
  if (direction === 'LONG') return `A close below ${s} invalidates the long thesis.`;
  if (direction === 'SHORT') return `A close above ${s} invalidates the short thesis.`;
  return 'No active thesis — wait for a trend to establish before committing.';
}

function withNfa(text: string): string {
  return text.toLowerCase().includes('not financial advice') ? text : `${text.trim()} ${NFA}`;
}

/**
 * Merge an LLM reply onto the deterministic analysis. Text is always taken from
 * the LLM (when present); numeric levels only when they keep the engine's
 * direction and pass the guardrails against the live price/ATR.
 */
export function mergeLlm(
  det: AnalysisResult,
  llm: LlmAnalysis,
  ctx: { price: number; atr: number },
): AnalysisResult {
  let { entryLow, entryHigh, stop, t1, t2, t3 } = det;
  const direction = det.direction; // engine owns direction

  const hasAllLevels = [llm.entryLow, llm.entryHigh, llm.stop, llm.t1, llm.t2, llm.t3].every(
    (n) => typeof n === 'number' && Number.isFinite(n),
  );
  if (hasAllLevels && llm.direction === direction) {
    const cand = {
      direction,
      entryLow: llm.entryLow!,
      entryHigh: llm.entryHigh!,
      stop: llm.stop!,
      t1: llm.t1!,
      t2: llm.t2!,
      t3: llm.t3!,
    };
    if (validateLevels(cand, ctx).ok) {
      ({ entryLow, entryHigh, stop, t1, t2, t3 } = cand);
    }
  }

  return {
    ...det,
    entryLow,
    entryHigh,
    stop,
    t1,
    t2,
    t3,
    confidence: clampConfidence(llm.confidence, det.confidence),
    rationale: withNfa(llm.rationale?.trim() || det.rationale),
    detail: llm.detail?.trim() || det.detail,
    invalidation: llm.invalidation?.trim() || invalidationText(direction, stop),
  };
}

function toDto(
  symbol: string,
  timeframes: TraderTimeframe[],
  result: AnalysisResult,
  aiUsed: boolean,
): TraderAnalysisDto {
  return {
    symbol,
    assetClass: classifyAsset(symbol),
    timeframes,
    direction: result.direction,
    entryLow: result.entryLow,
    entryHigh: result.entryHigh,
    stop: result.stop,
    t1: result.t1,
    t2: result.t2,
    t3: result.t3,
    support: result.support,
    resistance: result.resistance,
    confidence: result.confidence,
    rationale: result.rationale,
    invalidation: result.invalidation,
    detail: result.detail,
    perTimeframe: result.perTimeframe as TraderAnalysisDto['perTimeframe'],
    aiUsed,
    asOf: new Date().toISOString(),
    engineVer: TRADER_ENGINE_VER,
  };
}

async function persist(dto: TraderAnalysisDto, userId: string | undefined): Promise<void> {
  try {
    await prisma.traderAnalysis.create({
      data: {
        userId: userId ?? null,
        symbol: dto.symbol,
        assetClass: dto.assetClass,
        timeframes: dto.timeframes,
        direction: dto.direction,
        entryLow: dto.entryLow,
        entryHigh: dto.entryHigh,
        stop: dto.stop,
        t1: dto.t1,
        t2: dto.t2,
        t3: dto.t3,
        support: dto.support,
        resistance: dto.resistance,
        confidence: dto.confidence,
        rationale: dto.rationale,
        invalidation: dto.invalidation,
        detail: dto.detail,
        perTimeframe: dto.perTimeframe,
        aiUsed: dto.aiUsed,
        asOf: new Date(dto.asOf),
        engineVer: dto.engineVer,
      },
    });
  } catch (err) {
    // Persistence is best-effort — a logging/analytics record must never fail
    // the user's analysis (e.g. migration lagging a deploy).
    logger.warn(`[trader] persist failed: ${(err as Error).message}`);
  }
}

/**
 * Run an analysis for one symbol across 1..n timeframes. Returns the report DTO.
 * Throws ValidationError when no timeframe yields enough market data.
 */
export async function analyze(input: TraderAnalyzeInput, userId?: string): Promise<TraderAnalysisDto> {
  const timeframes = [...new Set(input.timeframes)];

  const perTf: TfFeatures[] = [];
  for (const tf of timeframes) {
    const candles = await loadPublicCandles(input.symbol, tf, CANDLE_LIMIT);
    if (candles.length < MIN_BARS) continue;
    perTf.push({ tf, features: extractFeatures(candles) });
  }
  if (perTf.length === 0) {
    throw new ValidationError(`No market data for "${input.symbol}" on the selected timeframe(s).`);
  }

  const det = reconcileTimeframes(perTf);
  // Validation context = lowest timeframe (where entry/stop are priced).
  const ltf = [...perTf].sort((a, b) => rank(a.tf) - rank(b.tf))[0]!;
  const ctx = { price: ltf.features.price, atr: ltf.features.atr };

  let result = det;
  let aiUsed = false;
  if (isAiEnabled()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(input.symbol, timeframes, perTf, det) },
        { role: 'user', content: `Analyze ${input.symbol} on ${timeframes.join(', ')} and return the JSON.` },
      ];
      const raw = await getProvider().complete(messages);
      const parsed = parseAnalysisJson(raw);
      if (parsed) {
        result = mergeLlm(det, parsed, ctx);
        aiUsed = true;
      }
    } catch (err) {
      logger.warn(`[trader] LLM analyze failed, using deterministic: ${(err as Error).message}`);
    }
  }

  // Belt-and-suspenders: never ship a level set that fails validation.
  if (result.direction !== 'WAIT' && !validateLevels(result, ctx).ok) {
    result = det;
  }

  const dto = toDto(input.symbol, timeframes, result, aiUsed);
  await persist(dto, userId);
  return dto;
}

const TF_RANK: Record<string, number> = { '15m': 1, '1h': 2, '4h': 3, '1d': 4 };
function rank(tf: string): number {
  return TF_RANK[tf] ?? 0;
}
