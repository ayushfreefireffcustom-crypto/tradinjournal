'use client';

// Real-Time Market News — a live, AI-tagged feed. High-impact items are flagged
// red (FinancialJuice cue); each carries sentiment, relevance and category from
// the enrichment pass. New items stream in over SSE (falling back to polling),
// and a one-click AI "morning brief" summarizes the session.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Newspaper, Sparkle, ArrowUpRight, Circle } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import EmptyState from '@/components/empty-state';
import MarkdownMessage from '@/components/coach/markdown-message';
import NewsModal from '@/components/news/news-modal';
import { useAccounts } from '@/lib/use-accounts';
import { api, type NewsItem, type NewsCategory, type Sentiment, type EventImpact, type BrokerAccount } from '@/lib/api';

const CATEGORIES: NewsCategory[] = ['CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS'];
const POLL_MS = 60_000;

const sentimentChip: Record<Sentiment, string> = {
  BULLISH: 'text-profit border-profit/40 bg-profit/10',
  BEARISH: 'text-loss border-loss/40 bg-loss/10',
  NEUTRAL: 'text-fg-3 border-border-strong bg-surface',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function dedupePrepend(prev: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const seen = new Set(prev.map(i => i.id));
  const fresh = incoming.filter(i => !seen.has(i.id));
  return fresh.length ? [...fresh, ...prev] : prev;
}

export default function NewsPage() {
  const { accounts, selected, select } = useAccounts();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<NewsCategory | null>(null);
  const [highOnly, setHighOnly] = useState(false);
  const [live, setLive] = useState(false);

  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  // Featured lead story: the most market-moving / relevant of the recent items.
  // Only used on the unfiltered feed, so filtered views stay a pure grid.
  const showLead = !category && !highOnly;
  const lead = useMemo(() => {
    if (!showLead || items.length === 0) return null;
    return [...items.slice(0, 12)].sort(
      (a, b) => Number(b.marketMoving) - Number(a.marketMoving) || (b.relevance ?? 0) - (a.relevance ?? 0),
    )[0] ?? null;
  }, [items, showLead]);
  const gridItems = lead ? items.filter(i => i.id !== lead.id) : items;

  const sentinel = useRef<HTMLDivElement>(null);

  const filters = useCallback(
    () => ({ ...(category ? { category } : {}), ...(highOnly ? { impact: 'HIGH' as EventImpact } : {}) }),
    [category, highOnly],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.news.list(filters());
      setItems(page.items);
      setCursor(page.nextCursor);
      setError('');
    } catch {
      setError('The news feed is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  // Live updates over SSE; a poll acts as both fallback and a safety net.
  useEffect(() => {
    if (category || highOnly) return; // stream only the unfiltered feed
    const controller = new AbortController();
    setLive(true);
    api.news.stream(incoming => setItems(prev => dedupePrepend(prev, incoming)), controller.signal).catch(() => setLive(false));
    const poll = setInterval(async () => {
      try {
        const page = await api.news.list({});
        setItems(prev => dedupePrepend(prev, page.items));
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => { controller.abort(); clearInterval(poll); setLive(false); };
  }, [category, highOnly]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(async entries => {
      if (!entries[0]?.isIntersecting || loadingMore || !cursor) return;
      setLoadingMore(true);
      try {
        const page = await api.news.list({ ...filters(), cursor });
        setItems(prev => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      } catch { /* ignore */ } finally {
        setLoadingMore(false);
      }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore, filters]);

  const runBrief = useCallback(() => {
    setBriefOpen(true);
    setBrief('');
    setBriefLoading(true);
    const controller = new AbortController();
    api.news
      .brief(t => setBrief(prev => prev + t), () => setBriefLoading(false), controller.signal)
      .catch(() => setBriefLoading(false))
      .finally(() => setBriefLoading(false));
  }, []);

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Market News"
      pageSubtitle="// LIVE FEED"
    >
      <div className="flex flex-col h-[calc(100vh-var(--topbar-h,7rem))] min-h-0" data-testid="news-page">
        {/* Filter bar */}
        <div className="shrink-0 border-b border-border-soft px-3 sm:px-4 lg:px-6 py-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCategory(null)}
            className={`px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
              !category ? 'bg-profit/15 text-fg border-profit/30' : 'text-fg-3 border-border-soft hover:text-fg'
            }`}
          >
            All
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(category === c ? null : c)}
              data-testid={`news-cat-${c}`}
              className={`px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                category === c ? 'bg-profit/15 text-fg border-profit/30' : 'text-fg-3 border-border-soft hover:text-fg'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setHighOnly(v => !v)}
            data-testid="news-high"
            className={`px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
              highOnly ? 'text-loss border-loss/40 bg-loss/10' : 'text-fg-3 border-border-soft hover:text-fg'
            }`}
          >
            High impact
          </button>

          <div className="ml-auto flex items-center gap-2.5">
            {live && !category && !highOnly && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase text-fg-3">
                <Circle size={7} weight="fill" className="text-profit pulse-dot" /> Live
              </span>
            )}
            <button onClick={runBrief} data-testid="news-brief-btn" className="btn btn-primary py-1.5 px-3 text-[11px] rounded-[var(--radius-btn)]">
              <Sparkle size={13} weight="fill" /> Morning brief
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4" data-testid="news-list">
          <div className="max-w-6xl mx-auto">
            {/* Brief panel */}
            {briefOpen && (
              <div className="max-w-3xl mx-auto mb-5 rounded-[var(--radius-card)] border border-profit/25 bg-surface/40 p-4" data-testid="news-brief">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkle size={14} weight="fill" className="text-profit" />
                  <span className="text-[10px] tracking-[0.2em] uppercase text-fg-3">AI morning brief</span>
                  <button onClick={() => setBriefOpen(false)} className="ml-auto text-[11px] text-fg-3 hover:text-fg">Close</button>
                </div>
                {brief ? <MarkdownMessage content={brief} /> : briefLoading ? <div className="coach-shimmer text-[13px]">Writing your brief…</div> : null}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-28" />)}</div>
            ) : error ? (
              <EmptyState icon={Newspaper} title="News unavailable" hint={error} />
            ) : items.length === 0 ? (
              <EmptyState icon={Newspaper} title="No news yet" hint="The feed will fill in as headlines are ingested." />
            ) : (
              <>
                {/* Featured lead story */}
                {lead && (() => {
                  const high = lead.impact === 'HIGH' || lead.marketMoving;
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedItem(lead)}
                      data-testid="news-lead"
                      className={`group w-full text-left rounded-[var(--radius-card)] border bg-surface/50 p-5 mb-3 transition-colors hover:bg-surface ${
                        high ? 'border-loss/40 border-l-2 border-l-loss' : 'border-border-soft hover:border-border-strong'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap text-[10px] mb-2">
                        <span className="text-[9px] tracking-[0.2em] uppercase text-profit font-semibold">Top story</span>
                        <span className="text-fg-3">·</span>
                        <span className="font-semibold tracking-wide text-fg-2">{lead.source}</span>
                        <span className="text-fg-3">· {timeAgo(lead.publishedAt)}</span>
                        {lead.category && <span className="px-1.5 py-0.5 rounded border border-border-soft text-fg-3 tracking-wider uppercase">{lead.category}</span>}
                        {lead.sentiment && <span className={`px-1.5 py-0.5 rounded border tracking-wider uppercase ${sentimentChip[lead.sentiment]}`}>{lead.sentiment}</span>}
                        {high && <span className="px-1.5 py-0.5 rounded border border-loss/40 text-loss bg-loss/10 tracking-wider uppercase">High impact</span>}
                      </div>
                      <h2 className="font-display font-bold text-[20px] sm:text-[22px] leading-tight tracking-tight text-fg">{lead.title}</h2>
                      {lead.summary && <p className="text-[13.5px] text-fg-2 mt-2 leading-relaxed line-clamp-2 max-w-3xl">{lead.summary}</p>}
                      <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase text-fg-3 mt-3 group-hover:text-fg transition-colors">Read more <ArrowUpRight size={11} weight="bold" /></span>
                    </button>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {gridItems.map(it => {
                    const high = it.impact === 'HIGH' || it.marketMoving;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setSelectedItem(it)}
                        data-testid="news-item"
                        className={`group h-full flex flex-col text-left rounded-[var(--radius-card)] border bg-surface/40 px-4 py-3.5 transition-colors hover:bg-surface ${
                          high ? 'border-loss/40 border-l-2 border-l-loss bg-loss/[0.04]' : 'border-border-soft hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap text-[10px] mb-1.5">
                          <span className="font-semibold tracking-wide text-fg-2">{it.source}</span>
                          <span className="text-fg-3">· {timeAgo(it.publishedAt)}</span>
                          {it.category && <span className="px-1.5 py-0.5 rounded border border-border-soft text-fg-3 tracking-wider uppercase">{it.category}</span>}
                          {it.sentiment && (
                            <span className={`px-1.5 py-0.5 rounded border tracking-wider uppercase ${sentimentChip[it.sentiment]}`}>{it.sentiment}</span>
                          )}
                          {high && <span className="px-1.5 py-0.5 rounded border border-loss/40 text-loss bg-loss/10 tracking-wider uppercase">High</span>}
                          {typeof it.relevance === 'number' && (
                            <span className="ml-auto flex items-center gap-1 text-fg-3" title={`Relevance ${it.relevance}/100`}>
                              <span className="w-10 h-1 rounded-full bg-surface-active overflow-hidden">
                                <span className="block h-full bg-profit/70" style={{ width: `${it.relevance}%` }} />
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="text-[14px] font-medium text-fg leading-snug line-clamp-2">{it.title}</div>
                        {it.summary && <p className="text-[12px] text-fg-3 mt-1.5 line-clamp-2 leading-relaxed">{it.summary}</p>}
                        <div className="mt-auto pt-2 flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          Read more <ArrowUpRight size={11} weight="bold" />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {cursor && <div ref={sentinel} className="h-10 flex items-center justify-center text-[11px] text-fg-3">{loadingMore ? 'Loading…' : ''}</div>}
                <p className="text-center text-[9px] tracking-[0.2em] text-fg-3 mt-4">
                  AGGREGATED HEADLINES · AI TAGS ARE INFORMATIONAL · NOT INVESTMENT ADVICE
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedItem && <NewsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </AppShell>
  );
}
