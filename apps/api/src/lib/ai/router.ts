// Intent router for the AI coach. One cheap classification call decides which
// lane a question belongs to so we only pay for a web search when the question
// actually needs current/external facts:
//   personal — about the trader's OWN history (win rate, best day, tilt) → no search
//   web      — external/current facts (news, economic calendar, definitions) → search
//   hybrid   — needs both (their data AND the outside world) → search + TRADER_DATA
//
// Fail SAFE: any parse error, timeout, or unexpected output defaults to `personal`,
// so we never search on doubt (protects the search budget and privacy).
import type { AiProvider } from './provider.js';
import { logger } from '@tradinjournal/logger';

export type Lane = 'personal' | 'web' | 'hybrid';

const CLASSIFY_PROMPT = `You are a router for a trading-journal assistant. Classify the user's question into exactly one lane and reply with ONLY a JSON object: {"lane":"personal"|"web"|"hybrid"}.

- "personal": about the user's OWN trading history, stats, behaviour, or journal (e.g. "why do I lose on Fridays?", "am I cutting winners early?", "what's my biggest leak?"). No outside information needed.
- "web": needs current or external facts from the internet (e.g. "what's on the economic calendar this week?", "what is a bull flag?", "what happened to gold today?"). Not about the user's own numbers.
- "hybrid": needs BOTH the user's own data AND external/current facts (e.g. "given my NFP losses, what's coming up this week?").

Reply with the JSON object only — no prose, no markdown.`;

/** Extract the first JSON object from a model reply, tolerant of code fences/prose. */
function parseLane(raw: string): Lane | null {
  const match = raw.match(/\{[^}]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { lane?: unknown };
    if (obj.lane === 'personal' || obj.lane === 'web' || obj.lane === 'hybrid') return obj.lane;
  } catch {
    /* fall through */
  }
  return null;
}

export async function classifyLane(query: string, provider: AiProvider, signal?: AbortSignal): Promise<Lane> {
  const trimmed = query.trim();
  if (!trimmed) return 'personal';
  try {
    const reply = await provider.complete(
      [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: trimmed.slice(0, 1000) },
      ],
      signal,
    );
    const lane = parseLane(reply);
    if (!lane) {
      logger.warn(`Lane classifier returned unparseable output; defaulting to personal: ${reply.slice(0, 80)}`);
      return 'personal';
    }
    return lane;
  } catch (err) {
    logger.warn(`Lane classifier failed, defaulting to personal: ${(err as Error).message}`);
    return 'personal';
  }
}
