import { describe, it, expect } from 'vitest';
import { canonicalUrl, titleKey, reconcileNews } from '../reconcile.js';
import type { NormalizedNews } from '../types.js';

function n(p: Partial<NormalizedNews> & Pick<NormalizedNews, 'source' | 'outlet' | 'url' | 'title'>): NormalizedNews {
  return { publishedAt: new Date('2026-07-25T10:00:00Z'), ...p };
}

describe('canonicalUrl', () => {
  it('strips protocol/www/query/fragment/trailing slash', () => {
    expect(canonicalUrl('https://www.coindesk.com/markets/story/?utm=x#top')).toBe('coindesk.com/markets/story');
    expect(canonicalUrl('http://coindesk.com/markets/story')).toBe('coindesk.com/markets/story');
  });
  it('falls back gracefully for a non-URL', () => {
    expect(canonicalUrl('not a url')).toBe('not a url');
  });
});

describe('titleKey', () => {
  it('normalizes case/punctuation/space', () => {
    expect(titleKey('Bitcoin ETF Approved!')).toBe('bitcoin etf approved');
    expect(titleKey('  Bitcoin   ETF  approved ')).toBe('bitcoin etf approved');
  });
});

describe('reconcileNews', () => {
  it('collapses the same URL (with different query strings), keeping the earliest', () => {
    const out = reconcileNews([
      n({ source: 'rss:a', outlet: 'CoinDesk', url: 'https://coindesk.com/s?utm=1', title: 'X', publishedAt: new Date('2026-07-25T10:05:00Z') }),
      n({ source: 'rss:a', outlet: 'CoinDesk', url: 'https://coindesk.com/s?utm=2', title: 'X', publishedAt: new Date('2026-07-25T10:00:00Z') }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt.toISOString()).toBe('2026-07-25T10:00:00.000Z');
  });

  it('clusters the same headline across different outlets into "also reported by"', () => {
    const out = reconcileNews([
      n({ source: 'rss:a', outlet: 'CoinDesk', url: 'https://coindesk.com/x', title: 'Fed holds rates' }),
      n({ source: 'rss:b', outlet: 'Decrypt', url: 'https://decrypt.co/y', title: 'Fed Holds Rates!' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.outlets.sort()).toEqual(['CoinDesk', 'Decrypt']);
  });

  it('keeps genuinely different stories separate, newest first', () => {
    const out = reconcileNews([
      n({ source: 'rss:a', outlet: 'A', url: 'https://a.com/1', title: 'Story one', publishedAt: new Date('2026-07-25T09:00:00Z') }),
      n({ source: 'rss:b', outlet: 'B', url: 'https://b.com/2', title: 'Story two', publishedAt: new Date('2026-07-25T11:00:00Z') }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe('Story two'); // newest first
  });
});
