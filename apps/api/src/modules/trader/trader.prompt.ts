// Trader Master LLM layer. The model is handed the ENGINE-COMPUTED features and
// candidate levels as trusted data and asked to (a) narrate and (b) optionally
// refine the numbers. Its output is parsed strictly; the service then validates
// any refined levels with the core guardrails before anything ships. The model
// can never introduce a price the engine hasn't vetted.
import { z } from 'zod';
import { traderDirectionSchema } from '@tradinjournal/contracts';
import type { AnalysisResult, TfFeatures } from '@tradinjournal/core';

export const NFA = 'Not financial advice — for educational use only.';

/** Lenient schema for the model's JSON reply — every field optional. */
export const llmAnalysisSchema = z.object({
  direction: traderDirectionSchema.optional(),
  entryLow: z.number().finite().optional(),
  entryHigh: z.number().finite().optional(),
  stop: z.number().finite().optional(),
  t1: z.number().finite().optional(),
  t2: z.number().finite().optional(),
  t3: z.number().finite().optional(),
  confidence: z.number().optional(),
  rationale: z.string().optional(),
  detail: z.string().optional(),
  invalidation: z.string().optional(),
});
export type LlmAnalysis = z.infer<typeof llmAnalysisSchema>;

function fmt(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : 'n/a';
}

/** Compact, model-friendly rendering of one timeframe's features. */
function renderTf(tf: TfFeatures): string {
  const f = tf.features;
  const sr = (levels: { price: number }[]) => levels.slice(0, 3).map((l) => fmt(l.price)).join(', ') || 'none';
  return [
    `[${tf.tf}] price=${fmt(f.price)} trend=${f.trend} rsi=${f.rsi.toFixed(0)} atr=${fmt(f.atr)}`,
    `  support=${sr(f.support)} resistance=${sr(f.resistance)}`,
  ].join('\n');
}

/**
 * System prompt: role, the computed feature bundle, the engine's candidate
 * levels, and a strict-JSON output contract.
 */
export function buildSystemPrompt(symbol: string, timeframes: string[], perTf: TfFeatures[], candidate: AnalysisResult): string {
  return [
    'You are a disciplined technical analyst for a markets tool. You ONLY do',
    'technical analysis of the instrument below from the pre-computed indicators.',
    'You never give personalized financial advice and never invent prices far from',
    'the data. Levels must stay anchored to the current price and the support/',
    'resistance provided.',
    '',
    `Instrument: ${symbol}`,
    `Timeframes: ${timeframes.join(', ')}`,
    '',
    'Computed features:',
    ...perTf.map(renderTf),
    '',
    'Engine candidate levels (already validated):',
    `  direction=${candidate.direction} entry=${fmt(candidate.entryLow)}–${fmt(candidate.entryHigh)}`,
    `  stop=${fmt(candidate.stop)} t1=${fmt(candidate.t1)} t2=${fmt(candidate.t2)} t3=${fmt(candidate.t3)}`,
    '',
    'Respond with ONLY a JSON object, no prose, no code fences, with keys:',
    '{"direction":"LONG|SHORT|WAIT","entryLow":num,"entryHigh":num,"stop":num,',
    '"t1":num,"t2":num,"t3":num,"confidence":0-100,"rationale":"2-3 sentences",',
    '"detail":"4-6 sentences of top-down reasoning","invalidation":"1 sentence"}',
    'Keep direction consistent with the higher-timeframe trend. If you keep the',
    `engine levels, just echo them. Always end the rationale with "${NFA}".`,
  ].join('\n');
}

/**
 * Parse the model's reply into LlmAnalysis, tolerating code fences and prose
 * around the JSON. Returns null on any failure so the caller keeps the
 * deterministic analysis.
 */
export function parseAnalysisJson(raw: string): LlmAnalysis | null {
  if (!raw || typeof raw !== 'string') return null;
  // Prefer a ```json fenced block, else the first balanced-looking {...}.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = llmAnalysisSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}
