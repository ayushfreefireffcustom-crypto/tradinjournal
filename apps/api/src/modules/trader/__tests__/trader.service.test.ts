import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedCandle } from '../../../lib/market/types.js';
import type { AnalysisResult } from '@tradinjournal/core';

// ── Mocks: market data, AI provider, and prisma persistence. ────────────────
const { loadPublicCandles } = vi.hoisted(() => ({ loadPublicCandles: vi.fn() }));
const { isAiEnabled, complete } = vi.hoisted(() => ({ isAiEnabled: vi.fn(() => false), complete: vi.fn() }));
const { create } = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));

vi.mock('../../market/market.service.js', () => ({ loadPublicCandles }));
vi.mock('../../../lib/ai/provider.js', () => ({
  isAiEnabled,
  getProvider: () => ({ model: 'test', complete, stream: async function* () {} }),
}));
vi.mock('@tradinjournal/db', () => ({ prisma: { traderAnalysis: { create } } }));

import { analyze, mergeLlm, classifyAsset } from '../trader.service.js';

/** Build a rising (uptrend) candle series → deterministic LONG. */
function upSeries(n = 120, start = 100, step = 0.6): NormalizedCandle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return { openTime: i * 3_600_000, open: c, high: c + 1, low: c - 1, close: c, volume: 1 };
  });
}

beforeEach(() => {
  loadPublicCandles.mockReset();
  isAiEnabled.mockReset().mockReturnValue(false);
  complete.mockReset();
  create.mockClear();
});

describe('classifyAsset', () => {
  it('labels crypto, forex, commodity and stock', () => {
    expect(classifyAsset('BTCUSDT')).toBe('crypto');
    expect(classifyAsset('EURUSD')).toBe('forex');
    expect(classifyAsset('XAUUSD')).toBe('commodity');
    expect(classifyAsset('AAPL')).toBe('stock');
  });
});

describe('analyze — data + AI paths', () => {
  it('throws a ValidationError when no timeframe has data', async () => {
    loadPublicCandles.mockResolvedValue([]);
    await expect(analyze({ symbol: 'NOPE', timeframes: ['1h'] }, 'u1')).rejects.toThrow(/No market data/);
  });

  it('AI off → deterministic LONG, aiUsed false, and it persists', async () => {
    loadPublicCandles.mockResolvedValue(upSeries());
    const dto = await analyze({ symbol: 'BTCUSDT', timeframes: ['1h'] }, 'u1');
    expect(dto.direction).toBe('LONG');
    expect(dto.aiUsed).toBe(false);
    expect(dto.t1).toBeGreaterThan(dto.entryHigh);
    expect(dto.t2).toBeGreaterThan(dto.t1);
    expect(create).toHaveBeenCalledOnce();
  });

  it('AI on with a valid JSON narrative → aiUsed true, LLM text adopted', async () => {
    loadPublicCandles.mockResolvedValue(upSeries());
    isAiEnabled.mockReturnValue(true);
    complete.mockResolvedValue(
      JSON.stringify({ direction: 'LONG', confidence: 72, rationale: 'Momentum favours longs.', detail: 'Top-down bullish.' }),
    );
    const dto = await analyze({ symbol: 'BTCUSDT', timeframes: ['1h'] }, 'u1');
    expect(dto.aiUsed).toBe(true);
    expect(dto.direction).toBe('LONG');
    expect(dto.confidence).toBe(72);
    expect(dto.rationale).toMatch(/Momentum favours longs/);
    expect(dto.rationale.toLowerCase()).toContain('not financial advice');
  });

  it('AI throwing falls back to deterministic (aiUsed false)', async () => {
    loadPublicCandles.mockResolvedValue(upSeries());
    isAiEnabled.mockReturnValue(true);
    complete.mockRejectedValue(new Error('groq down'));
    const dto = await analyze({ symbol: 'BTCUSDT', timeframes: ['1h'] }, 'u1');
    expect(dto.aiUsed).toBe(false);
    expect(dto.direction).toBe('LONG');
  });

  it('AI returning junk (unparseable) falls back to deterministic', async () => {
    loadPublicCandles.mockResolvedValue(upSeries());
    isAiEnabled.mockReturnValue(true);
    complete.mockResolvedValue('sorry, I cannot comply');
    const dto = await analyze({ symbol: 'BTCUSDT', timeframes: ['1h'] }, 'u1');
    expect(dto.aiUsed).toBe(false);
  });
});

// ── mergeLlm: the level-adoption gate (the anti-hallucination core). ─────────
const det: AnalysisResult = {
  direction: 'LONG',
  entryLow: 99.5,
  entryHigh: 100.5,
  stop: 97,
  t1: 103,
  t2: 106,
  t3: 109.4,
  support: [],
  resistance: [],
  confidence: 60,
  rationale: 'engine rationale',
  invalidation: 'engine invalidation',
  detail: 'engine detail',
  perTimeframe: [],
};
const ctx = { price: 100, atr: 2 };

describe('mergeLlm', () => {
  it('adopts valid LLM levels that keep the engine direction', () => {
    const r = mergeLlm(det, { direction: 'LONG', entryLow: 99.6, entryHigh: 100.4, stop: 98, t1: 102, t2: 104, t3: 106 }, ctx);
    expect(r.stop).toBe(98);
    expect(r.t1).toBe(102);
  });

  it('rejects LLM levels with a wrong-side stop — keeps engine levels', () => {
    const r = mergeLlm(det, { direction: 'LONG', entryLow: 99.6, entryHigh: 100.4, stop: 105, t1: 102, t2: 104, t3: 106 }, ctx);
    expect(r.stop).toBe(97); // engine stop preserved
  });

  it('ignores LLM levels when the LLM flips direction — keeps engine levels', () => {
    const r = mergeLlm(det, { direction: 'SHORT', entryLow: 99.6, entryHigh: 100.4, stop: 102, t1: 98, t2: 96, t3: 94 }, ctx);
    expect(r.direction).toBe('LONG');
    expect(r.stop).toBe(97);
  });

  it('always adopts LLM text and clamps confidence to 0–100', () => {
    const r = mergeLlm(det, { confidence: 999, rationale: 'llm words' }, ctx);
    expect(r.confidence).toBe(100);
    expect(r.rationale).toMatch(/llm words/);
  });
});
