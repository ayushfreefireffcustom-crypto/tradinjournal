// News provider abstraction, mirroring the calendar one. Providers return a
// normalized shape; the reconciler clusters the same story across outlets, and
// the LLM enriches sentiment/relevance/impact/category afterwards.
//
// RSS is the always-on baseline (no key). Keyed aggregators (Finnhub, Marketaux,
// CryptoPanic) enrich coverage when their keys are present.

// Category vocabulary is shared with the request validators — re-exported from
// the contracts package (the single source).
export type { NewsCategory } from '@tradinjournal/contracts';
import type { NewsCategory } from '@tradinjournal/contracts';

/** One news item as a single provider reports it, already normalized. */
export interface NormalizedNews {
  /** Provider name, e.g. "rss:coindesk" | "finnhub" | "marketaux". */
  source: string;
  /** Human outlet label shown in the UI, e.g. "CoinDesk". */
  outlet: string;
  url: string;
  title: string;
  summary?: string;
  imageUrl?: string;
  publishedAt: Date;
  country?: string; // ISO-3166 alpha-2
  /** Provider-supplied category, if any (LLM enrichment refines/overrides). */
  category?: NewsCategory;
}

export interface NewsProvider {
  readonly name: string;
  /**
   * Return the latest items. Never throws for "no data" — returns []. Honours
   * the abort signal + an internal hard timeout. A provider missing its key is
   * simply never constructed.
   */
  fetchLatest(signal?: AbortSignal): Promise<NormalizedNews[]>;
}
