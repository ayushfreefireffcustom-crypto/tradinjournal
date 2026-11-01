// Chart patterns (E8) and their explanations (E9). Detection is the pure
// engine in @tradinjournal/core, run on closed bars and cached until the next
// close. Explanations come from Claude when AI is configured, written only
// from the pattern's own numbers, and fall back to plain templates otherwise.
import { detectPatterns, PATTERN_LABELS, type Pattern, type TraderCandle as Candle } from '@tradinjournal/core';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { NotFoundError, ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';

export const PATTERN_TFS = ['15m', '1h', '4h', '1d', '1w'] as const;
export type PatternTf = (typeof PATTERN_TFS)[number];
const TF_MS: Record<PatternTf, number> = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 7 * 86_400_000 };
const BARS = 500;

export interface PatternsDeps {
  loadCandles: (symbol: string, tf: string, limit: number) => Promise<Candle[]>;
  now: () => number;
  cache: boolean;
  ai: () => boolean;
  explainWithAi: (messages: ChatMessage[]) => Promise<unknown>;
}
export const defaultPatternsDeps: PatternsDeps = {
  loadCandles: (s, tf, limit) => loadPublicCandles(s, tf as never, limit),
  now: () => Date.now(),
  cache: true,
  ai: isAiEnabled,
  explainWithAi: (messages) => getProvider().json(messages, EXPLAIN_SCHEMA, { effort: 'low', maxTokens: 1500 }),
};

function check(symbol: string, tf: string): { symbol: string; tf: PatternTf } {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,30}$/.test(s)) throw new ValidationError('That isn’t a market symbol.');
  if (!(PATTERN_TFS as readonly string[]).includes(tf)) throw new ValidationError(`Timeframe must be one of ${PATTERN_TFS.join(', ')}.`);
  return { symbol: s, tf: tf as PatternTf };
}

export interface PatternsResult { symbol: string; tf: PatternTf; barTime: string | null; bars: number; price: number | null; patterns: Pattern[] }

/** Patterns on the last closed bar; computed once per bar. */
export async function findPatterns(rawSymbol: string, rawTf: string, deps = defaultPatternsDeps): Promise<PatternsResult> {
  const { symbol, tf } = check(rawSymbol, rawTf);
  const now = deps.now();
  const expected = Math.floor(now / TF_MS[tf]) * TF_MS[tf] - TF_MS[tf];
  const key = `patterns:${symbol}:${tf}:${expected}`;
  if (deps.cache) {
    const hit = await cacheGet<PatternsResult>(key);
    if (hit) return hit;
  }
  const all = await deps.loadCandles(symbol, tf, BARS);
  let end = all.length;
  while (end > 0 && all[end - 1]!.openTime + TF_MS[tf] > now) end -= 1;
  const closed = all.slice(0, end);
  if (!closed.length) throw new ValidationError(`No market data for ${symbol} on ${tf}.`);
  const { patterns } = detectPatterns(closed);
  const out: PatternsResult = { symbol, tf, barTime: new Date(closed.at(-1)!.openTime).toISOString(), bars: closed.length, price: closed.at(-1)!.close, patterns };
  if (deps.cache) {
    const fresh = closed.at(-1)!.openTime === expected;
    await cacheSet(key, out, fresh ? Math.ceil((expected + 2 * TF_MS[tf] - now) / 1000) : 60);
  }
  return out;
}

// ── Explanations (E9) ─────────────────────────────────────────────────────────

export interface Explanation { id: string; source: 'ai' | 'rules'; whatItIs: string; whyItMatters: string; whereItsWrong: string; measuredMove: string }

const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    whatItIs: { type: 'string', description: 'What this pattern is and how it formed on this chart. 2-3 sentences.' },
    whyItMatters: { type: 'string', description: 'What traders read into it and what usually happens next, as tendencies not promises. 2-3 sentences.' },
    whereItsWrong: { type: 'string', description: 'The price that would show the read was wrong, and why. 1-2 sentences.' },
    measuredMove: { type: 'string', description: 'The classic measured-move target and how it is worked out, or why there is none yet. 1-2 sentences.' },
  },
  required: ['whatItIs', 'whyItMatters', 'whereItsWrong', 'measuredMove'],
  additionalProperties: false,
} as const;

const fmt = (v: number | null | undefined) => (v == null ? 'n/a' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
const STATUS_TEXT: Record<Pattern['status'], string> = { forming: 'is still forming (no breakout yet)', broke_up: 'has broken out upward', broke_down: 'has broken out downward', confirmed: 'is confirmed: price closed through the neckline', target_hit: 'has already reached its measured-move target' };

const WHAT: Record<string, string> = {
  level: 'a price where the market has turned more than once, so buyers or sellers have shown up there before',
  channel: 'price moving between two roughly parallel lines, bouncing off one and turning at the other',
  triangle: 'a range that narrows as highs and lows close in on each other, with less and less room to move',
  wedge: 'two lines sloping the same way and converging, a trend that is losing momentum as it goes',
  double: 'two tests of the same extreme with a pullback between them; the second test failing to get further is the signal',
  flag: 'a sharp move (the pole) followed by a short, shallow pause that leans against it',
};
const WHY: Record<string, string> = {
  level: 'Levels that held before often attract orders again; a clean break through one can turn it into the opposite role.',
  channel: 'While price stays inside, traders lean on the edges; a close outside suggests the pace of the trend is changing.',
  triangle: 'Compression tends to end in an expansion. Ascending triangles lean bullish, descending bearish, symmetrical ones break either way.',
  wedge: 'Rising wedges often end with a drop and falling wedges with a rally, because each new push gets less follow-through.',
  double: 'Failing twice at the same place suggests the move behind it is tiring; the break of the neckline is what confirms the turn.',
  flag: 'A pause that gives back little of a strong move often resolves in the same direction as the pole.',
};

/** Plain-English fallback built from the pattern's numbers. */
export function ruleExplanation(p: Pattern, symbol: string, tf: string): Omit<Explanation, 'id' | 'source'> {
  const what = `On ${symbol} ${tf} this is a ${p.label.toLowerCase()}: ${WHAT[p.family]}. It ${STATUS_TEXT[p.status]}${p.touches ? `, with ${p.touches} touches near ${fmt(p.breakout)}` : ''}.`;
  const wrong = p.family === 'level'
    ? `A decisive close through ${fmt(p.breakout)} would mean this ${p.kind} gave way and may flip to ${p.kind === 'support' ? 'resistance' : 'support'}.`
    : p.invalidation != null
      ? `A close ${p.bias === 'bearish' ? 'above' : 'below'} ${fmt(p.invalidation)} would undo the ${p.bias} read.`
      : `It has no direction of its own: a close outside either line (now about ${fmt(p.lines[0]?.b.price)} and ${fmt(p.lines[1]?.b.price)}) tells you which way it resolved.`;
  const move = p.target != null
    ? `The classic target is about ${fmt(p.target)}, from projecting the pattern's height${p.family === 'flag' ? ' (the pole)' : ''} from the breakout at ${fmt(p.breakout)}. Targets are rough guides and are often missed.`
    : 'There is no measured move until price breaks out of it.';
  return { whatItIs: what, whyItMatters: WHY[p.family]!, whereItsWrong: wrong, measuredMove: move };
}

function promptFor(p: Pattern, r: PatternsResult): ChatMessage[] {
  const facts = {
    symbol: r.symbol, timeframe: r.tf, lastClose: r.price, pattern: p.label, bias: p.bias, status: STATUS_TEXT[p.status],
    breakout: p.breakout, invalidation: p.invalidation, target: p.target, touches: p.touches ?? null,
    lines: p.lines.map((l) => ({ role: l.role, from: { time: new Date(l.a.time).toISOString(), price: l.a.price }, to: { time: new Date(l.b.time).toISOString(), price: l.b.price } })),
    keyPoints: p.points.map((x) => ({ time: new Date(x.time).toISOString(), price: x.price, label: x.label ?? null })),
  };
  return [
    { role: 'system', content: 'You explain chart patterns to traders in plain, friendly English. Use only the facts given; never invent prices, dates or indicators. Round prices sensibly. Describe tendencies, not certainties, and never tell the reader to buy or sell. No markdown, no headings.' },
    { role: 'user', content: `Explain this pattern for the trader looking at the chart.\n${JSON.stringify(facts)}` },
  ];
}

const okText = (v: unknown) => typeof v === 'string' && v.trim().length >= 10 && v.length <= 900;

export async function explainPattern(rawSymbol: string, rawTf: string, id: string, deps = defaultPatternsDeps): Promise<Explanation> {
  const r = await findPatterns(rawSymbol, rawTf, deps);
  const p = r.patterns.find((x) => x.id === id);
  if (!p) throw new NotFoundError('That pattern isn’t on the chart any more. Refresh the patterns.');
  const key = `patterns:explain:${r.symbol}:${r.tf}:${id}:${p.status}`;
  if (deps.cache) {
    const hit = await cacheGet<Explanation>(key);
    if (hit) return hit;
  }
  let out: Explanation = { id, source: 'rules', ...ruleExplanation(p, r.symbol, r.tf) };
  if (deps.ai()) {
    try {
      const j = (await deps.explainWithAi(promptFor(p, r))) as Record<string, unknown>;
      if (j && okText(j.whatItIs) && okText(j.whyItMatters) && okText(j.whereItsWrong) && okText(j.measuredMove)) {
        out = { id, source: 'ai', whatItIs: String(j.whatItIs).trim(), whyItMatters: String(j.whyItMatters).trim(), whereItsWrong: String(j.whereItsWrong).trim(), measuredMove: String(j.measuredMove).trim() };
      }
    } catch (err) {
      logger.warn(`[patterns] AI explanation failed, using the template: ${(err as Error).message}`);
    }
  }
  if (deps.cache) await cacheSet(key, out, 6 * 3600);
  return out;
}

export { PATTERN_LABELS };
