// Web-search abstraction for the AI coach, mirroring provider.ts: callers depend
// only on the SearchProvider interface, never on a concrete backend. Tavily is
// the primary (purpose-built LLM search, clean ranked results); Groq's agentic
// `compound-mini` is the zero-config fallback when only an AI key is present.
//
// getSearchProvider() returns null when neither backend is available, so the
// coach simply stays grounded on the trader's own data (no web search).
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { AiSource } from '@tradinjournal/contracts';

/** One web result. Shape matches the shared AiSource contract. */
export type SearchResult = AiSource;

export interface SearchProvider {
  readonly name: 'tavily' | 'compound';
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
function withTimeout(signal: AbortSignal | undefined): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
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

interface CompoundResponse {
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

/** Best-effort extraction of {title,url,snippet} from compound's executed_tools. */
function extractCompoundSources(json: CompoundResponse): SearchResult[] {
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

// ── Selection (cached, like getProvider) ──────────────────────────────────────
let cached: SearchProvider | null | undefined;

export function getSearchProvider(): SearchProvider | null {
  if (cached !== undefined) return cached;
  if (env.SEARCH_PROVIDER_RESOLVED === 'tavily' && env.TAVILY_API_KEY) {
    cached = new TavilySearchProvider(env.TAVILY_API_KEY);
    logger.info('Search provider ready: tavily');
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
