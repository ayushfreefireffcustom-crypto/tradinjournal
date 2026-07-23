// Intent router for the AI coach. One cheap call decides which lane a question
// belongs to AND (for web/hybrid) rewrites it into a focused search query, so we
// only pay for a web search when needed and we search for the right thing:
//   personal — about the trader's OWN history (win rate, best day, tilt) → no search
//   web      — external/current facts (news, economic calendar, definitions) → search
//   hybrid   — needs both (their data AND the outside world) → search + TRADER_DATA
//
// Passing the raw user sentence to the search engine gives poor results for
// conversational questions ("what's coming up this week?" → entertainment). The
// router instead returns a concise, finance-scoped `searchQuery`.
//
// Fail SAFE: any parse error, timeout, or unexpected output → lane `personal`,
// so we never search on doubt (protects the search budget and privacy).
import type { AiProvider } from './provider.js';
import { logger } from '@tradinjournal/logger';

export type Lane = 'personal' | 'web' | 'hybrid';

export interface Route {
  lane: Lane;
  /** Focused, finance-scoped web query for web/hybrid lanes; '' for personal. */
  searchQuery: string;
}

const ROUTER_PROMPT = `You route questions for a trading-journal assistant. Reply with ONLY a JSON object: {"lane":"personal"|"web"|"hybrid","searchQuery":"..."}.

Lanes:
- "personal": about the user's OWN trading history, stats, behaviour, or journal (e.g. "why do I lose on Fridays?", "am I cutting winners early?", "what's my biggest leak?"). No outside information needed.
- "web": needs current or external facts from the internet (e.g. "what's on the economic calendar this week?", "what is a bull flag?", "what happened to gold today?"). Not about the user's own numbers.
- "hybrid": needs BOTH the user's own data AND external/current facts (e.g. "given my NFP losses, what's coming up this week?").

searchQuery rules:
- For "web" and "hybrid": write a concise, keyword-focused web search query (3-10 words) scoped to trading/markets/economy/finance that will retrieve the needed facts. Resolve vague time/topic words using the trading context — e.g. "what's coming up this week?" → "economic calendar this week high impact events". Never make it about entertainment, TV, or movies.
- For "personal": use an empty string "".

Reply with the JSON object only — no prose, no markdown.`;

/** Parse the first JSON object from a model reply, tolerant of code fences/prose. */
function parseRoute(raw: string): Route | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { lane?: unknown; searchQuery?: unknown };
    if (obj.lane !== 'personal' && obj.lane !== 'web' && obj.lane !== 'hybrid') return null;
    const searchQuery = typeof obj.searchQuery === 'string' ? obj.searchQuery.trim() : '';
    return { lane: obj.lane, searchQuery };
  } catch {
    return null;
  }
}

export async function routeQuery(query: string, provider: AiProvider, signal?: AbortSignal): Promise<Route> {
  const trimmed = query.trim();
  if (!trimmed) return { lane: 'personal', searchQuery: '' };
  try {
    const reply = await provider.complete(
      [
        { role: 'system', content: ROUTER_PROMPT },
        { role: 'user', content: trimmed.slice(0, 1000) },
      ],
      signal,
    );
    const route = parseRoute(reply);
    if (!route) {
      logger.warn(`Router returned unparseable output; defaulting to personal: ${reply.slice(0, 80)}`);
      return { lane: 'personal', searchQuery: '' };
    }
    // Safety: if a web lane came back without a usable query, fall back to the
    // raw question rather than searching for nothing.
    if (route.lane !== 'personal' && !route.searchQuery) route.searchQuery = trimmed;
    return route;
  } catch (err) {
    logger.warn(`Router failed, defaulting to personal: ${(err as Error).message}`);
    return { lane: 'personal', searchQuery: '' };
  }
}
