// RSS baseline provider — the always-on, no-key news source. A curated list of
// licensed/free financial + crypto feeds; each is fetched with a hard timeout
// and parsed with rss-parser. One failing feed never sinks the others.
//
// FinancialJuice has no public feed and must NOT be scraped — we replicate its
// UX with these feeds + LLM enrichment instead.
import Parser from 'rss-parser';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { NewsProvider, NormalizedNews, RawNewsCategory } from '../types.js';

interface FeedDef {
  url: string;
  outlet: string;
  category: RawNewsCategory;
}

// Sensible licensed defaults; override the whole set with NEWS_RSS_FEEDS
// (CSV of "url|Outlet|CATEGORY").
const DEFAULT_FEEDS: FeedDef[] = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', outlet: 'CoinDesk', category: 'CRYPTO' },
  { url: 'https://cointelegraph.com/rss', outlet: 'CoinTelegraph', category: 'CRYPTO' },
  { url: 'https://decrypt.co/feed', outlet: 'Decrypt', category: 'CRYPTO' },
  { url: 'https://www.investing.com/rss/news_25.rss', outlet: 'Investing.com', category: 'MACRO' },
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', outlet: 'WSJ Markets', category: 'MARKETS' },
];

const FETCH_TIMEOUT_MS = 10_000;
const PER_FEED_LIMIT = 25;

function parseFeeds(): FeedDef[] {
  if (!env.NEWS_RSS_FEEDS) return DEFAULT_FEEDS;
  const out: FeedDef[] = [];
  for (const entry of env.NEWS_RSS_FEEDS.split(',')) {
    const [url, outlet, category] = entry.split('|').map(s => s.trim());
    if (url && outlet) out.push({ url, outlet, category: (category as RawNewsCategory) || 'MARKETS' });
  }
  return out.length > 0 ? out : DEFAULT_FEEDS;
}

const parser = new Parser({ timeout: FETCH_TIMEOUT_MS });

async function fetchXml(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'TRADElogs/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function createRssProvider(): NewsProvider {
  const feeds = parseFeeds();
  return {
    name: 'rss',
    async fetchLatest(signal) {
      const settled = await Promise.allSettled(
        feeds.map(async feed => {
          const xml = await fetchXml(feed.url, signal);
          const parsed = await parser.parseString(xml);
          const items: NormalizedNews[] = [];
          for (const it of (parsed.items ?? []).slice(0, PER_FEED_LIMIT)) {
            const url = it.link?.trim();
            const title = it.title?.trim();
            if (!url || !title) continue;
            const when = it.isoDate ?? it.pubDate;
            items.push({
              source: `rss:${feed.outlet.toLowerCase().replace(/\s+/g, '')}`,
              outlet: feed.outlet,
              url,
              title,
              summary: (it.contentSnippet ?? '').trim().slice(0, 500) || undefined,
              publishedAt: when ? new Date(when) : new Date(),
              category: feed.category,
            });
          }
          return items;
        }),
      );

      const out: NormalizedNews[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') out.push(...r.value);
        else logger.warn(`RSS feed ${feeds[i]!.outlet} failed: ${(r.reason as Error).message}`);
      });
      return out;
    },
  };
}
