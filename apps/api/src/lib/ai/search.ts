// Web-search abstraction for the AI coach, mirroring provider.ts: callers depend
// only on the SearchProvider interface, never on a concrete backend. Tavily is
// used when keyed (purpose-built LLM search); otherwise the AI provider searches:
// Claude's server-side web search tool, or Groq's agentic `compound-mini`.
//
// getSearchProvider() returns null when neither backend is available, so the
// coach simply stays grounded on the trader's own data (no web search).
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { AiSource } from '@tradinjournal/contracts';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from './provider.js';

/** One web result. Shape matches the shared AiSource contract. */
export type SearchResult = AiSource;

export interface SearchProvider {
  readonly name: 'tavily' | 'claude' | 'compound';
  /** Return up to a few ranked results for the query. Never throws for "no
   *  results" — returns []. Honours the abort signal + an internal hard timeout. */
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}

/** Cap results and snippet length so the prompt stays small (413 / token guard). */
const MAX_RESULTS = 5;
const MAX_SNIPPET = 500;
/** Hard ceiling on a single search regardless of the caller's signal. */
const SEARCH_TIMEOUT_MS = 8000;

function clampSnippet(s: string): string {
  const t = (s ?? '').trim();
  return t.length > MAX_SNIPPET ? `${t.slice(0, MAX_SNIPPET)}…` : t;
}

/** Merge the caller signal with an internal timeout into one AbortSignal. */
function withTimeout(signal: AbortSignal | undefined, ms = SEARCH_TIMEOUT_MS): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

// ── Tavily (primary) ──────────────────────────────────────────────────────────
class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily' as const;
  constructor(private readonly apiKey: string) {}

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const { signal: s, clear } = withTimeout(signal);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: MAX_RESULTS,
          search_depth: 'basic',
        }),
        signal: s,
      });
      if (!res.ok) {
        logger.warn(`Tavily search failed: ${res.status}`);
        return [];
      }
      const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return (json.results ?? [])
        .filter(r => r.url)
        .slice(0, MAX_RESULTS)
        .map(r => ({ title: r.title?.trim() || r.url!, url: r.url!, snippet: clampSnippet(r.content ?? '') }));
    } finally {
      clear();
    }
  }
}

// ── Groq compound-mini (fallback) ─────────────────────────────────────────────
// The agentic model performs its own web search and returns the URLs it hit in a
// non-standard `executed_tools` field on the message. We call the raw
// OpenAI-compatible endpoint so we can read that field, and parse defensively
// because its exact shape is provider-specific and may evolve.
class CompoundMiniSearchProvider implements SearchProvider {
  readonly name = 'compound' as const;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const { signal: s, clear } = withTimeout(signal);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: `Search the web and briefly summarize current information about: ${query}`,
            },
          ],
          temperature: 0.2,
        }),
        signal: s,
      });
      if (!res.ok) {
        logger.warn(`compound-mini search failed: ${res.status}`);
        return [];
      }
      const json = (await res.json()) as CompoundResponse;
      return extractCompoundSources(json).slice(0, MAX_RESULTS);
    } finally {
      clear();
    }
  }
}

export interface CompoundResponse {
  choices?: Array<{
    message?: {
      content?: string;
      executed_tools?: Array<{
        // Groq returns the tool output as a JSON string or nested object.
        output?: unknown;
        search_results?: unknown;
        arguments?: unknown;
      }>;
    };
  }>;
}

/** Best-effort extraction of {title,url,snippet} from compound's executed_tools.
 *  Exported for unit testing — the shape is provider-specific, so we parse it
 *  defensively (nested objects, arrays, and JSON-string outputs). */
export function extractCompoundSources(json: CompoundResponse): SearchResult[] {
  const tools = json.choices?.[0]?.message?.executed_tools ?? [];
  const out: SearchResult[] = [];
  const seen = new Set<string>();

  const pushResult = (r: unknown): void => {
    if (!r || typeof r !== 'object') return;
    const obj = r as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url : typeof obj.link === 'string' ? obj.link : undefined;
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : url;
    const snippetRaw =
      typeof obj.content === 'string' ? obj.content : typeof obj.snippet === 'string' ? obj.snippet : '';
    out.push({ title, url, snippet: clampSnippet(snippetRaw) });
  };

  const walk = (value: unknown): void => {
    if (!value) return;
    if (typeof value === 'string') {
      // The output is sometimes a JSON string — try to parse it.
      try {
        walk(JSON.parse(value));
      } catch {
        /* not JSON — ignore */
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.url === 'string' || typeof obj.link === 'string') pushResult(obj);
      for (const v of Object.values(obj)) walk(v);
    }
  };

  for (const t of tools) walk(t.output ?? t.search_results ?? t.arguments ?? t);
  return out;
}

// ── Claude web search (when the AI provider is anthropic) ────────────────────
// One call on the fast model with Claude's server-side web search tool. Result
// blocks give ranked title+URL; the passages Claude cites become the snippets.
/** A search plus a short write-up takes longer than a plain search API call. */
const CLAUDE_SEARCH_TIMEOUT_MS = 20_000;

class ClaudeSearchProvider implements SearchProvider {
  readonly name = 'claude' as const;
  constructor(private readonly client: Anthropic, private readonly model: string) {}

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const { signal: s, clear } = withTimeout(signal, CLAUDE_SEARCH_TIMEOUT_MS);
    try {
      const msg = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 2000,
          output_config: { effort: 'low' },
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
          messages: [
            {
              role: 'user',
              content: `Search the web for: ${query}\n\nThen list the specific facts a trader needs (dates, figures, what happened), citing your sources. Facts only, no advice.`,
            },
          ],
        },
        { signal: s },
      );
      return claudeSearchResults(msg);
    } finally {
      clear();
    }
  }
}

/** Ranked sources from the search result blocks, with cited passages as snippets. */
export function claudeSearchResults(msg: Pick<Anthropic.Message, 'content'>): SearchResult[] {
  const cited = new Map<string, string[]>();
  const ranked: { title: string; url: string }[] = [];
  for (const block of msg.content) {
    // An error result arrives as an object instead of a list — nothing to rank.
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) ranked.push({ title: r.title || r.url, url: r.url });
    }
    if (block.type === 'text') {
      for (const c of block.citations ?? []) {
        if (c.type !== 'web_search_result_location') continue;
        const prev = cited.get(c.url) ?? [];
        if (!prev.includes(c.cited_text)) cited.set(c.url, [...prev, c.cited_text]);
      }
    }
  }
  const seen = new Set<string>();
  const out = ranked
    .filter(r => !seen.has(r.url) && seen.add(r.url))
    .map(r => ({ ...r, snippet: clampSnippet((cited.get(r.url) ?? []).join(' … ')) }));
  // Sources Claude actually cited first, then the rest of the ranking.
  out.sort((a, b) => Number(!!b.snippet) - Number(!!a.snippet));
  return out.slice(0, MAX_RESULTS);
}

// ── Selection (cached, like getProvider) ──────────────────────────────────────
let cached: SearchProvider | null | undefined;

export function getSearchProvider(): SearchProvider | null {
  if (cached !== undefined) return cached;
  if (env.SEARCH_PROVIDER_RESOLVED === 'tavily' && env.TAVILY_API_KEY) {
    cached = new TavilySearchProvider(env.TAVILY_API_KEY);
    logger.info('Search provider ready: tavily');
  } else if (env.SEARCH_PROVIDER_RESOLVED === 'claude' && getAnthropicClient()) {
    cached = new ClaudeSearchProvider(getAnthropicClient()!, env.AI_FAST_MODEL_RESOLVED);
    logger.info(`Search provider ready: claude web search · ${env.AI_FAST_MODEL_RESOLVED}`);
  } else if (env.SEARCH_PROVIDER_RESOLVED === 'compound' && env.AI_API_KEY) {
    cached = new CompoundMiniSearchProvider(env.AI_API_KEY, env.AI_BASE_URL_RESOLVED, env.SEARCH_FALLBACK_MODEL);
    logger.info(`Search provider ready: compound · ${env.SEARCH_FALLBACK_MODEL}`);
  } else {
    cached = null;
  }
  return cached;
}

export function isSearchEnabled(): boolean {
  return getSearchProvider() !== null;
}
