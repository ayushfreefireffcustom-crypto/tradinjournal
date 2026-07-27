'use client';

// Real-Time Market News — a live, AI-tagged feed. High-impact items are flagged
// red (FinancialJuice cue); each carries sentiment, relevance and category from
// the enrichment pass. New items stream in over SSE (falling back to polling),
// and a one-click AI "morning brief" summarizes the session.
//
// Personalization: when a user picks preferred outlets, the feed splits into
// "From your sources" (those outlets) on top and "More headlines" (everything
// else) below. With no preference it renders as one plain feed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Newspaper, Sparkle, ArrowUpRight, Circle, Faders } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import EmptyState from '@/components/empty-state';
import MarkdownMessage from '@/components/coach/markdown-message';
import NewsModal from '@/components/news/news-modal';
import NewsThumb from '@/components/news/news-thumb';
import SourcePicker from '@/components/news/source-picker';
import { useAccounts } from '@/lib/use-accounts';
import { api, type NewsItem, type NewsCategory, type Sentiment, type EventImpact, type NewsSource, type BrokerAccount } from '@/lib/api';

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

/** One headline card — shared by the "your sources" and "more headlines" grids. */
function NewsCard({ it, onOpen }: { it: NewsItem; onOpen: (i: NewsItem) => void }) {
  const high = it.impact === 'HIGH' || it.marketMoving;
  return (
    <button
      type="button"
      onClick={() => onOpen(it)}
      data-testid="news-item"
      className={`group h-full flex gap-3 text-left rounded-[var(--radius-card)] border bg-surface/40 px-4 py-3.5 transition-colors hover:bg-surface ${
        high ? 'border-loss/40 border-l-2 border-l-loss bg-loss/[0.04]' : 'border-border-soft hover:border-border-strong'
      }`}
    >
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] mb-1.5">
          <span className="font-semibold tracking-wide text-fg-2">{it.source}</span>
          <span className="text-fg-3">· {timeAgo(it.publishedAt)}</span>
          {it.category && <span className="px-1.5 py-0.5 rounded border border-border-soft text-fg-3 tracking-wider uppercase">{it.category}</span>}
          {it.sentiment && <span className={`px-1.5 py-0.5 rounded border tracking-wider uppercase ${sentimentChip[it.sentiment]}`}>{it.sentiment}</span>}
          {high && <span className="px-1.5 py-0.5 rounded border border-loss/40 text-loss bg-loss/10 tracking-wider uppercase">High</span>}
        </div>
        <div className="text-[14px] font-medium text-fg leading-snug line-clamp-2">{it.title}</div>
        {it.summary && <p className="text-[12px] text-fg-3 mt-1.5 line-clamp-2 leading-relaxed">{it.summary}</p>}
        <div className="mt-auto pt-2 flex items-center gap-2">
          {typeof it.relevance === 'number' && (
            <span className="flex items-center gap-1 text-fg-3" title={`Relevance ${it.relevance}/100`}>
              <span className="w-10 h-1 rounded-full bg-surface-active overflow-hidden"><span className="block h-full bg-profit/70" style={{ width: `${it.relevance}%` }} /></span>
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity">Read <ArrowUpRight size={11} weight="bold" /></span>
        </div>
      </div>
      <NewsThumb src={it.imageUrl} className="shrink-0 w-16 h-16 rounded-md object-cover border border-border-soft" />
    </button>
  );
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

  // Personalization.
  const [prefs, setPrefs] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [catalog, setCatalog] = useState<NewsSource[]>([]);
  const [topItems, setTopItems] = useState<NewsItem[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState('');

  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  // Two-section mode: preferences set, and no category/impact filter narrowing
  // the view (filters collapse back to a single list to stay legible).
  const personalized = prefsLoaded && prefs.length > 0 && !category && !highOnly;

  // Load the picker catalog + saved preferences once.
  useEffect(() => {
    api.news.preferences().then(p => setPrefs(p.sources)).catch(() => {}).finally(() => setPrefsLoaded(true));
    api.news.sources().then(r => setCatalog(r.sources)).catch(() => {});
  }, []);

  // Featured lead story: only on the plain (non-personalized, unfiltered) feed —
  // in two-section mode the "your sources" band is the hero instead.
  const showLead = !category && !highOnly && !personalized;
  const lead = useMemo(() => {
    if (!showLead || items.length === 0) return null;
    return [...items.slice(0, 12)].sort(
      (a, b) => Number(b.marketMoving) - Number(a.marketMoving) || (b.relevance ?? 0) - (a.relevance ?? 0),
    )[0] ?? null;
  }, [items, showLead]);
  const gridItems = lead ? items.filter(i => i.id !== lead.id) : items;

  const sentinel = useRef<HTMLDivElement>(null);

  const filters = useCallback(
    () => ({
      ...(category ? { category } : {}),
      ...(highOnly ? { impact: 'HIGH' as EventImpact } : {}),
      ...(personalized ? { excludeSources: prefs } : {}),
    }),
    [category, highOnly, personalized, prefs],
  );

  // The bottom feed ("more headlines" when personalized, else the whole feed).
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

  // The "from your sources" top band. Capped (a highlight, not infinite-scrolled).
  useEffect(() => {
    if (!personalized) { setTopItems([]); return; }
    let cancelled = false;
    setTopLoading(true);
    api.news
      .list({ sources: prefs, limit: 24 })
      .then(p => { if (!cancelled) setTopItems(p.items); })
      .catch(() => { if (!cancelled) setTopItems([]); })
      .finally(() => { if (!cancelled) setTopLoading(false); });
    return () => { cancelled = true; };
  }, [personalized, prefs]);

  // Live updates over SSE; a poll acts as both fallback and a safety net. When
  // personalized, route each incoming item to the top or bottom by its source.
  useEffect(() => {
    if (category || highOnly) return; // stream only the unfiltered feed
    const controller = new AbortController();
    setLive(true);
    const pset = new Set(prefs);
    const route = (incoming: NewsItem[]) => {
      if (!personalized) { setItems(prev => dedupePrepend(prev, incoming)); return; }
      const top = incoming.filter(i => pset.has(i.source));
      const rest = incoming.filter(i => !pset.has(i.source));
      if (top.length) setTopItems(prev => dedupePrepend(prev, top));
      if (rest.length) setItems(prev => dedupePrepend(prev, rest));
    };
    api.news.stream(route, controller.signal).catch(() => setLive(false));
    const poll = setInterval(async () => {
      try {
        const page = await api.news.list({});
        route(page.items);
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => { controller.abort(); clearInterval(poll); setLive(false); };
  }, [category, highOnly, personalized, prefs]);

  // Infinite scroll (bottom feed).
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

  const savePrefs = useCallback(async (next: string[]) => {
    setSavingPrefs(true);
    setPrefsError('');
    try {
      const res = await api.news.setPreferences(next);
      setPrefs(res.sources);
      setPickerOpen(false);
    } catch {
      setPrefsError("Couldn't save your sources. Please try again.");
    } finally {
      setSavingPrefs(false);
    }
  }, []);

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
      <div className="flex flex-col h-full min-h-0" data-testid="news-page">
        {/* Filter bar */}
        <div className="shrink-0 border-b border-border-soft px-3 sm:px-4 lg:px-6 py-3 flex items-center gap-2">
          {/* Filter chips — scroll horizontally on narrow screens instead of wrapping */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 pr-1">
            <button
              onClick={() => setCategory(null)}
              className={`shrink-0 px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
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
                className={`shrink-0 px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                  category === c ? 'bg-profit/15 text-fg border-profit/30' : 'text-fg-3 border-border-soft hover:text-fg'
                }`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setHighOnly(v => !v)}
              data-testid="news-high"
              className={`shrink-0 px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                highOnly ? 'text-loss border-loss/40 bg-loss/10' : 'text-fg-3 border-border-soft hover:text-fg'
              }`}
            >
              High impact
            </button>
          </div>

          <div className="shrink-0 flex items-center gap-2.5">
            {live && !category && !highOnly && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase text-fg-3">
                <Circle size={7} weight="fill" className="text-profit pulse-dot" /> Live
              </span>
            )}
            <button
              onClick={() => setPickerOpen(true)}
              data-testid="news-customize-btn"
              title="Customize your feed"
              className={`shrink-0 flex items-center gap-1.5 py-1.5 px-2.5 text-[11px] tracking-[0.06em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                prefs.length > 0 ? 'text-fg border-profit/30 bg-profit/10' : 'text-fg-3 border-border-soft hover:text-fg'
              }`}
            >
              <Faders size={13} weight="bold" />
              <span className="hidden sm:inline">Sources{prefs.length > 0 ? ` · ${prefs.length}` : ''}</span>
            </button>
            <button onClick={runBrief} data-testid="news-brief-btn" className="shrink-0 btn btn-primary py-1.5 px-3 text-[11px] rounded-[var(--radius-btn)]">
              <Sparkle size={13} weight="fill" /> Brief
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4" data-testid="news-list">
          <div className="max-w-7xl mx-auto">
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
            ) : items.length === 0 && topItems.length === 0 ? (
              <EmptyState icon={Newspaper} title="No news yet" hint="The feed will fill in as headlines are ingested." />
            ) : (
              <>
                {/* ── FROM YOUR SOURCES (personalized top band) ── */}
                {personalized && (
                  <section className="mb-6" data-testid="news-your-sources">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] tracking-[0.2em] uppercase text-profit font-semibold">From your sources</span>
                      <span className="h-px flex-1 bg-border-soft" />
                      <button onClick={() => setPickerOpen(true)} className="text-[10px] tracking-[0.14em] uppercase text-fg-3 hover:text-fg transition-colors">Edit</button>
                    </div>
                    {topLoading ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-28" />)}</div>
                    ) : topItems.length === 0 ? (
                      <p className="text-[12px] text-fg-3 py-2">Nothing new from your sources yet — fresh headlines will appear here.</p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                        {topItems.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} />)}
                      </div>
                    )}
                  </section>
                )}

                {/* ── Featured lead (plain feed only) ── */}
                {lead && (() => {
                  const high = lead.impact === 'HIGH' || lead.marketMoving;
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedItem(lead)}
                      data-testid="news-lead"
                      className={`group w-full text-left rounded-[var(--radius-card)] border bg-surface/50 p-5 mb-3 transition-colors hover:bg-surface flex gap-5 ${
                        high ? 'border-loss/40 border-l-2 border-l-loss' : 'border-border-soft hover:border-border-strong'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
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
                        {lead.summary && <p className="text-[13.5px] text-fg-2 mt-2 leading-relaxed line-clamp-2">{lead.summary}</p>}
                        <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase text-fg-3 mt-3 group-hover:text-fg transition-colors">Read more <ArrowUpRight size={11} weight="bold" /></span>
                      </div>
                      <NewsThumb src={lead.imageUrl} className="hidden sm:block shrink-0 w-44 lg:w-56 aspect-video rounded-lg object-cover border border-border-soft" />
                    </button>
                  );
                })()}

                {/* ── MORE HEADLINES / the main feed ── */}
                {personalized && (
                  <div className="flex items-center gap-2 mb-3" data-testid="news-more">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-fg-3 font-semibold">More headlines</span>
                    <span className="h-px flex-1 bg-border-soft" />
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {gridItems.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} />)}
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

      {pickerOpen && (
        <SourcePicker
          catalog={catalog}
          initial={prefs}
          saving={savingPrefs}
          error={prefsError}
          onSave={savePrefs}
          onClose={() => { setPrefsError(''); setPickerOpen(false); }}
        />
      )}
      {selectedItem && <NewsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </AppShell>
  );
}
