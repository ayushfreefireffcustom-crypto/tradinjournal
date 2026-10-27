// Trader Master orchestration: candles → features → deterministic analysis →
// optional LLM narrative/refinement → guardrail validation → persist → DTO.
//
// Invariants that make output trustworthy:
//  • Direction is the ENGINE's (deterministic top-down), never the LLM's.
//  • LLM level refinements are adopted ONLY if they match that direction AND
//    pass validateLevels; otherwise the engine's levels stand.
//  • The shipped level set is validated once more before returning.
//  • Anything unusable (no data) is a 422, never a crash.
import { prisma, Prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { AssetClass, TraderAnalyzeInput, TraderAnalysisDto, TraderTimeframe, TraderLaneResult } from '@tradinjournal/contracts';
import {
  TRADER_ENGINE_VER,
  extractFeatures,
  reconcileTimeframes,
  validateLevels,
  reconcileLanes,
  macroBiasToLane,
  flowLane,
  mapSymbolToMacroAsset,
  deriveLevels,
  newsLane,
  buildMetaFeatures,
  type AnalysisResult,
  type TfFeatures,
  type TraderDirection,
  type LaneResult,
  type MetaFeatureSnapshot,
} from '@tradinjournal/core';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { fetchCryptoFlow } from '../../lib/market/flow/binance-flow.js';
import { fetchDeribitOptions } from '../../lib/market/flow/deribit-options.js';
import { fetchUnusualWhales } from '../../lib/market/flow/unusual-whales.js';
import { fetchBenzinga } from '../../lib/market/flow/benzinga.js';
import { fetchSantiment } from '../../lib/market/flow/santiment.js';
import { fetchFearGreed } from '../../lib/market/flow/fear-greed.js';
import { getMacroState } from '../macro/macro.service.js';
import { env } from '@tradinjournal/config';
import { ANALYSIS_JSON_SCHEMA, buildSystemPrompt, parseAnalysisObject, NFA, type LlmAnalysis } from './trader.prompt.js';
import { applyMetaConfidence } from './trader.meta.service.js';

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
  lanes?: TraderLaneResult[],
  meta?: {
    featureSnapshot?: MetaFeatureSnapshot;
    confidenceSource?: 'heuristic' | 'meta_v1' | 'meta_lgbm';
    rawConfidence?: number;
  },
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
    laneBreakdown: lanes,
    confidenceSource: meta?.confidenceSource,
    rawConfidence: meta?.rawConfidence,
    featureSnapshot: meta?.featureSnapshot
      ? {
          version: 1 as const,
          names: [...meta.featureSnapshot.names],
          values: [...meta.featureSnapshot.values],
          heuristicConfidence: meta.featureSnapshot.heuristicConfidence,
        }
      : undefined,
    aiUsed,
    asOf: new Date().toISOString(),
    engineVer: TRADER_ENGINE_VER,
  };
}

/** Collect Macro + Flow lanes (best-effort; missing data = lane omitted). */
async function collectExtraLanes(symbol: string, assetClass: AssetClass): Promise<LaneResult[]> {
  const extras: LaneResult[] = [];

  const macroAsset = mapSymbolToMacroAsset(symbol);
  if (macroAsset && env.MACRO_ENABLED) {
    try {
      const state = await getMacroState();
      const bias = state.bias.find((b) => b.asset === macroAsset);
      if (bias) extras.push(macroBiasToLane(bias.score, bias.label));
    } catch (err) {
      logger.warn(`[trader] macro lane skipped: ${(err as Error).message}`);
    }
  }

  try {
    const flow = await buildFlowLane(symbol, assetClass);
    if (flow) extras.push(flow);
  } catch (err) {
    logger.warn(`[trader] flow lane skipped: ${(err as Error).message}`);
  }

  // News / sentiment: Fear & Greed (crypto) + recent enriched headline tilt.
  try {
    const news = await buildNewsLane(symbol, assetClass);
    if (news) extras.push(news);
  } catch (err) {
    logger.warn(`[trader] news lane skipped: ${(err as Error).message}`);
  }

  return extras;
}

function stamp(lane: LaneResult, meta: { source?: string; asOf?: string; stale?: boolean }): LaneResult {
  if (meta.source) lane.source = meta.source;
  if (meta.asOf) lane.asOf = meta.asOf;
  if (meta.stale) lane.stale = true;
  return lane;
}

async function buildFlowLane(symbol: string, assetClass: AssetClass): Promise<LaneResult | null> {
  if (assetClass === 'stock') {
    const uw = await fetchUnusualWhales(symbol);
    if (!uw) return null;
    return stamp(flowLane(uw.score, uw.rationale, 0.22), uw);
  }
  if (assetClass !== 'crypto') return null;

  const [binance, deribit] = await Promise.all([
    fetchCryptoFlow(symbol).catch(() => null),
    fetchDeribitOptions(symbol).catch(() => null),
  ]);
  if (!binance && !deribit) return null;

  let score = 0;
  let w = 0;
  const parts: string[] = [];
  const sources: string[] = [];
  let asOf: string | undefined;
  let stale = false;
  if (binance) {
    score += binance.score * 0.55;
    w += 0.55;
    parts.push(`Binance ${binance.rationale}`);
    sources.push('Binance');
  }
  if (deribit) {
    score += deribit.score * 0.45;
    w += 0.45;
    parts.push(deribit.rationale);
    sources.push(deribit.source);
    asOf = deribit.asOf;
    stale = deribit.stale;
  }
  return stamp(flowLane(score / w, parts.join(' · '), 0.22), {
    source: sources.join(' + '),
    asOf,
    stale,
  });
}

async function buildNewsLane(symbol: string, assetClass: AssetClass): Promise<LaneResult | null> {
  const parts: string[] = [];
  let score = 0;
  let weight = 0;
  let source: string | undefined;
  let asOf: string | undefined;
  let stale = false;

  const paid =
    assetClass === 'crypto'
      ? await fetchSantiment(symbol).catch(() => null)
      : assetClass === 'stock' || assetClass === 'forex'
        ? await fetchBenzinga(symbol).catch(() => null)
        : null;
  if (paid) {
    score += paid.score * 0.7;
    weight += 0.7;
    parts.push(paid.rationale);
    source = paid.source;
    asOf = paid.asOf;
    stale = paid.stale;
  }

  if (assetClass === 'crypto') {
    const fng = await fetchFearGreed();
    if (fng) {
      const w = paid ? 0.2 : 0.55;
      score += fng.score * w;
      weight += w;
      parts.push(`F&G ${fng.value} (${fng.label})`);
      if (!source) source = 'Fear & Greed';
    }
  }

  const since = new Date(Date.now() - 48 * 3600_000);
  const needle = symbol.replace(/USDT$|USDC$|USD$/i, '').slice(0, 12);
  try {
    const items = await prisma.newsItem.findMany({
      where: {
        publishedAt: { gte: since },
        sentiment: { not: null },
        OR: [
          { title: { contains: needle, mode: 'insensitive' } },
          { summary: { contains: needle, mode: 'insensitive' } },
        ],
      },
      select: { sentiment: true, publishedAt: true },
      take: 40,
      orderBy: { publishedAt: 'desc' },
    });
    if (items.length > 0) {
      const now = Date.now();
      let wSum = 0;
      let sSum = 0;
      for (const it of items) {
        const ageH = Math.max(0, (now - it.publishedAt.getTime()) / 3600_000);
        const decay = Math.exp(-ageH / 24); // ~24h half-ish life
        const s = it.sentiment === 'BULLISH' ? 1 : it.sentiment === 'BEARISH' ? -1 : 0;
        sSum += s * decay;
        wSum += decay;
      }
      if (wSum > 0) {
        const headlineScore = sSum / wSum;
        const hw = paid ? 0.2 : 0.45;
        score += headlineScore * hw;
        weight += hw;
        parts.push(`${items.length} headlines (48h)`);
        if (!source) source = 'Headlines';
      }
    }
  } catch {
    /* news table may be empty / unavailable — F&G alone is fine */
  }

  if (weight <= 0 || parts.length === 0) return null;
  const blended = score / weight;
  return stamp(newsLane(blended, parts.join(' · '), 0.15), { source, asOf, stale });
}

/**
 * Apply lane reconciliation onto a technical analysis. May force WAIT on
 * disagreement; never flips LONG↔SHORT without the technical baseline agreeing.
 */
function applyLanes(det: AnalysisResult, extras: LaneResult[], ltf: TfFeatures): {
  result: AnalysisResult;
  lanes: LaneResult[];
  agreement: number;
} {
  const rec = reconcileLanes(det.direction, det.confidence, extras);
  let result = { ...det, confidence: rec.confidence };

  if (rec.direction !== det.direction) {
    const levels = deriveLevels({
      price: ltf.features.price,
      atr: ltf.features.atr,
      direction: rec.direction,
      support: ltf.features.support,
      resistance: ltf.features.resistance,
    });
    result = {
      ...result,
      ...levels,
      direction: rec.direction,
      confidence: rec.confidence,
      invalidation: invalidationText(rec.direction, levels.stop),
      rationale: withNfa(
        `${det.rationale.replace(/\s*Not financial advice.*$/i, '').trim()} Lanes disagree (${Math.round(rec.agreement * 100)}% agree) — waiting for confluence.`,
      ),
    };
  } else if (extras.length > 0) {
    const agreePct = Math.round(rec.agreement * 100);
    result = {
      ...result,
      rationale: withNfa(
        `${det.rationale.replace(/\s*Not financial advice.*$/i, '').trim()} Lanes ${agreePct}% aligned.`,
      ),
    };
  }

  return { result, lanes: rec.lanes, agreement: rec.agreement };
}

async function persist(dto: TraderAnalysisDto, userId: string | undefined): Promise<string | undefined> {
  try {
    const row = await prisma.traderAnalysis.create({
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
        laneBreakdown: (dto.laneBreakdown ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        featureSnapshot: (dto.featureSnapshot ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        confidenceSource: dto.confidenceSource ?? undefined,
        rawConfidence: dto.rawConfidence ?? undefined,
        aiUsed: dto.aiUsed,
        asOf: new Date(dto.asOf),
        engineVer: dto.engineVer,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    logger.warn(`[trader] persist failed: ${(err as Error).message}`);
    return undefined;
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
  const ltf = [...perTf].sort((a, b) => rank(a.tf) - rank(b.tf))[0]!;
  const ctx = { price: ltf.features.price, atr: ltf.features.atr };

  const assetClass = classifyAsset(input.symbol);
  const extras = await collectExtraLanes(input.symbol, assetClass);
  const { result: laneResult, lanes: baseLanes, agreement } = applyLanes(det, extras, ltf);

  const snapshot = buildMetaFeatures({
    direction: laneResult.direction,
    heuristicConfidence: laneResult.confidence,
    features: ltf.features,
    lanes: baseLanes,
    agreement,
  });

  const meta = await applyMetaConfidence({
    direction: laneResult.direction,
    heuristicConfidence: laneResult.confidence,
    snapshot,
    lanes: baseLanes,
  });

  let engineResult: AnalysisResult = {
    ...laneResult,
    confidence: meta.confidence,
  };
  const lanes: TraderLaneResult[] = meta.lanes.map((l) => ({
    id: l.id as TraderLaneResult['id'],
    score: Math.round(l.score * 1000) / 1000,
    weight: l.weight,
    rationale: l.rationale,
  }));

  let result = engineResult;
  let aiUsed = false;
  if (isAiEnabled()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(input.symbol, timeframes, perTf, engineResult) },
        { role: 'user', content: `Analyze ${input.symbol} on ${timeframes.join(', ')} and return the JSON.` },
      ];
      const parsed = parseAnalysisObject(
        await getProvider().json(messages, ANALYSIS_JSON_SCHEMA, { effort: 'medium', maxTokens: 6000 }),
      );
      if (parsed) {
        result = mergeLlm(engineResult, parsed, ctx);
        // Keep calibrated confidence — LLM must not overwrite meta/heuristic confidence.
        result = { ...result, confidence: engineResult.confidence };
        aiUsed = true;
      }
    } catch (err) {
      logger.warn(`[trader] LLM analyze failed, using deterministic: ${(err as Error).message}`);
    }
  }

  if (result.direction !== 'WAIT' && !validateLevels(result, ctx).ok) {
    result = engineResult;
  }

  const dto = toDto(input.symbol, timeframes, result, aiUsed, lanes, {
    featureSnapshot: snapshot,
    confidenceSource: meta.confidenceSource,
    rawConfidence: meta.rawConfidence,
  });
  const id = await persist(dto, userId);
  if (id) dto.id = id;
  return dto;
}

const TF_RANK: Record<string, number> = { '15m': 1, '1h': 2, '4h': 3, '1d': 4 };
function rank(tf: string): number {
  return TF_RANK[tf] ?? 0;
}
