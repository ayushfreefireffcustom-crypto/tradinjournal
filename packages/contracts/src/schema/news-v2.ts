// News v2 (the story map page): the day's scored stories, kept/merged/hidden
// counts, and intraday reaction series for "moved since publish".
// Nothing here is persisted: tickers, desk and the fallback score are derived
// from the NewsItem row at read time (see apps/api/src/lib/news/tickers.ts).
import { z } from 'zod';

/** The page's category tabs. RATES is derived (yields, cut odds, bonds), the rest map to NewsCategory. */
export const NEWS_DESKS = ['MACRO', 'RATES', 'CRYPTO', 'MARKETS', 'GEOPOLITICAL', 'REGULATORY'] as const;
export const newsDeskSchema = z.enum(NEWS_DESKS);
export type NewsDesk = z.infer<typeof newsDeskSchema>;

/** `ai` = the LLM relevance score; `rules` = the keyword/impact/source-count fallback. */
export type NewsScoreSource = 'ai' | 'rules';

/** Watch-set keys served by GET /api/news/reactions. */
export const REACTION_KEYS = [
  'US10Y', 'DXY', 'EURUSD', 'XAUUSD', 'US500', 'US100', 'BTCUSD', 'ETHUSD', 'WTI',
  'BRENT', 'USDJPY', 'GBPUSD', 'SOLUSD',
] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

export const newsReactionsQuerySchema = z.object({
  /** Only return points at or after this instant (ISO). Defaults to ~24h of 5m bars. */
  since: z.string().datetime().optional(),
});
export type NewsReactionsQuery = z.infer<typeof newsReactionsQuerySchema>;

export interface ReactionSeriesDTO {
  key: ReactionKey;
  /** `bp` for yields (move = Δ × 100), `pct` for prices. */
  unit: 'bp' | 'pct';
  /** Decimals to show the price with. */
  dp: number;
  /** [epoch ms, close], oldest first, 5-minute bars. */
  points: [number, number][];
}

export interface NewsReactionsDTO {
  asOf: string;
  interval: '5m';
  series: ReactionSeriesDTO[];
}

export interface NewsCountsDTO {
  /** Every headline seen in the window, merged duplicates included. */
  headlines: number;
  /** Distinct stories (rows) in the window. */
  stories: number;
  kept: number;
  merged: number;
  hidden: number;
  /** Distinct outlets that carried anything in the window. */
  sources: number;
}

export interface NewsTodayDTO<Story = unknown> {
  asOf: string;
  /** Window start (ISO), 24h back. */
  from: string;
  counts: NewsCountsDTO;
  /** Kept stories, newest first. */
  stories: Story[];
}
