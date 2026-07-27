// RSS baseline provider — the always-on, no-key news source. A curated list of
// licensed/free financial + crypto feeds; each is fetched with a hard timeout
// and parsed with rss-parser. One failing feed never sinks the others.
//
// FinancialJuice has no public feed and must NOT be scraped — we replicate its
// UX with these feeds + LLM enrichment instead.
import Parser from 'rss-parser';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { NewsProvider, NormalizedNews, NewsCategory } from '../types.js';

interface FeedDef {
  url: string;
  outlet: string;
  category: NewsCategory;
}

// Sensible licensed defaults; override the whole set with NEWS_RSS_FEEDS
// (CSV of "url|Outlet|CATEGORY").
const DEFAULT_FEEDS: FeedDef[] = [
  // ── Crypto ────────────────────────────────────────────────────────────────
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', outlet: 'CoinDesk', category: 'CRYPTO' },
  { url: 'https://cointelegraph.com/rss', outlet: 'CoinTelegraph', category: 'CRYPTO' },
  { url: 'https://decrypt.co/feed', outlet: 'Decrypt', category: 'CRYPTO' },
  { url: 'https://www.theblock.co/rss.xml', outlet: 'The Block', category: 'CRYPTO' },
  { url: 'https://bitcoinmagazine.com/.rss/full/', outlet: 'Bitcoin Magazine', category: 'CRYPTO' },
  { url: 'https://cryptoslate.com/feed/', outlet: 'CryptoSlate', category: 'CRYPTO' },
  // ── Macro / markets ───────────────────────────────────────────────────────
  { url: 'https://www.investing.com/rss/news_25.rss', outlet: 'Investing.com', category: 'MACRO' },
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', outlet: 'WSJ Markets', category: 'MARKETS' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', outlet: 'CNBC', category: 'MARKETS' },
  { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', outlet: 'CNBC Economy', category: 'MACRO' },
  { url: 'https://feeds.marketwatch.com/marketwatch/realtimeheadlines/', outlet: 'MarketWatch', category: 'MARKETS' },
  { url: 'https://finance.yahoo.com/news/rssindex', outlet: 'Yahoo Finance', category: 'MARKETS' },
  { url: 'https://www.fxstreet.com/rss/news', outlet: 'FXStreet', category: 'MACRO' },
  // ── Regulatory / central banks ────────────────────────────────────────────
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', outlet: 'Federal Reserve', category: 'REGULATORY' },
  { url: 'https://www.sec.gov/news/pressreleases.rss', outlet: 'SEC', category: 'REGULATORY' },
];

const FETCH_TIMEOUT_MS = 10_000;
const PER_FEED_LIMIT = 25;

function parseFeeds(): FeedDef[] {
  if (!env.NEWS_RSS_FEEDS) return DEFAULT_FEEDS;
  const out: FeedDef[] = [];
  for (const entry of env.NEWS_RSS_FEEDS.split(',')) {
    const [url, outlet, category] = entry.split('|').map(s => s.trim());
    if (url && outlet) out.push({ url, outlet, category: (category as NewsCategory) || 'MARKETS' });
  }
  return out.length > 0 ? out : DEFAULT_FEEDS;
}

// Capture the common image-carrying fields feeds use (Media RSS + full content).
const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** Best-effort image URL from an RSS item across the many places feeds put it. */
function extractImage(it: Record<string, unknown>): string | undefined {
  const enclosure = it.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && (enclosure.type?.startsWith('image') || IMG_EXT.test(enclosure.url))) return enclosure.url;

  const mc = it.mediaContent as Array<{ $?: { url?: string; medium?: string; type?: string } }> | { $?: { url?: string } } | undefined;
  if (Array.isArray(mc)) {
    const img = mc.find(m => m?.$?.url && (m.$.medium === 'image' || /image/.test(m.$.type ?? ''))) ?? mc[0];
    if (img?.$?.url) return img.$.url;
  } else if (mc?.$?.url) {
    return mc.$.url;
  }

  const thumb = it.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (thumb?.$?.url) return thumb.$.url;

  const html = String(it.contentEncoded ?? it.content ?? '');
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (m?.[1]) return m[1];

  return undefined;
}

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
              imageUrl: extractImage(it as unknown as Record<string, unknown>),
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
