'use client';

// Real-Time Market News — a live, AI-tagged feed. High-impact items are flagged
// red (FinancialJuice cue); each carries sentiment, relevance and category from
// the enrichment pass. New items stream in over SSE (falling back to polling),
// and a one-click AI "morning brief" summarizes the session.
//
// Personalization: when a user picks preferred outlets, the feed splits into
// "From your sources" (those outlets) on top and "More headlines" (everything
// else) below. With no preference it renders as one plain feed.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MarkdownMessage from '@/components/coach/markdown-message';
import NewsModal from '@/components/news/news-modal';
import NewsThumb from '@/components/news/news-thumb';
import SourcePicker from '@/components/news/source-picker';
import { matchSymbols, matchesUserSymbols } from '@/lib/symbol-match';
import { api, type NewsItem, type NewsCategory, type Sentiment, type EventImpact, type NewsSource } from '@/lib/api';
import '@/styles/v6/markets.css';

const EMPTY_SYMBOLS: ReadonlySet<string> = new Set();

/** Symbols an item mentions that the user also trades (for the YOUR MARKET flag). */
function itemText(it: NewsItem): string {
  return `${it.title} ${it.summary ?? ''}`;
}

const CATEGORIES: NewsCategory[] = ['CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS'];
const POLL_MS = 60_000;

const SENT_LABEL: Record<Sentiment, string> = { BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' };
const SENT_TAG: Record<Sentiment, string> = { BULLISH: 'x-tag--g', BEARISH: 'x-tag--r', NEUTRAL: '' };
const CAT_LABEL: Record<string, string> = { CRYPTO: 'Crypto', MACRO: 'Macro', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory', MARKETS: 'Markets' };
// Short ticker for the card tile: the first traded symbol it mentions, else any
// symbol it mentions, else the category.
const TILE_ABBR: Record<string, string> = { XAUUSD: 'XAU', BTCUSD: 'BTC', ETHUSD: 'ETH', EURUSD: 'EUR', US100: 'NDX', NAS100: 'NDX', US30: 'DOW', US500: 'SPX', GBPUSD: 'GBP', USDJPY: 'JPY' };
function tileFor(it: NewsItem, matched: string[]): string {
  const sym = matched[0] ?? matchSymbols(itemText(it))[0];
  if (sym) return TILE_ABBR[sym] ?? sym.slice(0, 3);
  return it.category ? CAT_LABEL[it.category]!.slice(0, 3).toUpperCase() : 'NEWS';
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function dedupePrepend(prev: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const seen = new Set(prev.map(i => i.id));
  const fresh = incoming.filter(i => !seen.has(i.id));
  return fresh.length ? [...fresh, ...prev] : prev;
}

/**
 * One headline row: ticker tile, source/time line, title + one-line summary, and
 * the AI tags on the right. `matched` = symbols on it the user trades.
 */
function ArrowNE() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M7 17L17 7M9 7h8v8" /></svg>; }

function Tags({ it }: { it: NewsItem }) {
  const high = it.impact === 'HIGH' || it.marketMoving;
  return (
    <>
      {high && <span className="mk-hi"><i className="x-dot x-dot--r" aria-hidden />High impact</span>}
      {it.sentiment && <span className={`x-tag ${SENT_TAG[it.sentiment]}`}>{SENT_LABEL[it.sentiment]}</span>}
    </>
  );
}

function NewsCardBase({ it, onOpen, matched = [] }: { it: NewsItem; onOpen: (i: NewsItem) => void; matched?: string[] }) {
  const mine = matched.length > 0;
  return (
    <button type="button" onClick={() => onOpen(it)} data-testid="news-item" className={`mk-item ${mine ? 'mine' : ''}`}>
      <span className="x-mk mk-item-mk" aria-hidden>{tileFor(it, matched)}</span>
      <span className="mk-item-m">
        <span className="mk-item-meta">
          {mine && <span className="x-tag x-tag--g" data-testid="news-your-market">Your market</span>}
          <span className="mk-ell">{it.source} · {timeAgo(it.publishedAt)}{it.category ? ` · ${CAT_LABEL[it.category]}` : ''}</span>
        </span>
        <b className="mk-item-t">{it.title}</b>
        {it.summary ? <span className="mk-item-s">{it.summary}</span> : <span className="mk-item-s x-dim">Open to read at {it.source}.</span>}
        <span className="mk-item-tags"><Tags it={it} /></span>
      </span>
      <span className="mk-item-r">
        <span className="mk-item-tags"><Tags it={it} /></span>
        {typeof it.relevance === 'number' && (
          <span className="mk-relv" title={`Relevance to traders ${it.relevance}/100`}><span className="x-bar"><i style={{ width: `${it.relevance}%` }} /></span><small className="m">{it.relevance}</small></span>
        )}
      </span>
      {it.imageUrl && <NewsThumb src={it.imageUrl} className="mk-item-img" />}
    </button>
  );
}

// Memoized: appending/prepending a page re-renders the parent, but each existing
// card's `it` object keeps its reference and `onOpen` is stable, so untouched
// cards skip re-render. Without this, every load-more re-rendered the whole list
// (images + SVGs) synchronously — a heavy frame that flashed black mid-scroll.
const NewsCard = memo(
  NewsCardBase,
  (a, b) =>
    a.it === b.it &&
    a.onOpen === b.onOpen &&
    (a.matched?.length ?? 0) === (b.matched?.length ?? 0) &&
    (a.matched ?? []).every((m, i) => m === (b.matched ?? [])[i]),
);

// The Market-News feed: filter bar + personalized two-section list + brief +
// modals. Extracted from the old /news page so it can live inside the unified
// Markets page (two-pane) as well as stand alone.
export default function NewsFeed({ userSymbols = EMPTY_SYMBOLS, symbolsReady = true }: { userSymbols?: ReadonlySet<string>; symbolsReady?: boolean }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<NewsCategory | null>(null);
  const [highOnly, setHighOnly] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [, tick] = useState(0);
  // Keep "updated 2m ago" honest.
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

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

  // Two-section mode: preferences set, and no category/impact/symbol filter
  // narrowing the view (filters collapse back to a single list to stay legible).
  const personalized = prefsLoaded && prefs.length > 0 && !category && !highOnly && !sentiment && !symbolFilter;

  // Load the picker catalog + saved preferences once.
  useEffect(() => {
    api.news.preferences().then(p => setPrefs(p.sources)).catch(() => {}).finally(() => setPrefsLoaded(true));
    api.news.sources().then(r => setCatalog(r.sources)).catch(() => {});
  }, []);

  // ── Symbol matching ("matched to your symbols") ──
  const hasSymbols = userSymbols.size > 0;
  const symbolTabs = useMemo(() => [...userSymbols].sort(), [userSymbols]);
  const matchOf = useCallback((it: NewsItem) => matchesUserSymbols(itemText(it), userSymbols), [userSymbols]);

  // All loaded items (top band + main feed), deduped — the pool radar/filter draw from.
  const allLoaded = useMemo(() => {
    const seen = new Set<string>();
    return [...topItems, ...items].filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [topItems, items]);

  // "On your radar" — items touching a symbol the user trades. Hero when they have
  // symbols and aren't otherwise filtering. Wait for stats (symbolsReady) so the
  // band doesn't pop in after the lead already rendered.
  const radarActive = symbolsReady && hasSymbols && !category && !highOnly && !sentiment && !symbolFilter;
  const radar = useMemo(
    () => (radarActive ? allLoaded.filter(it => matchOf(it).length > 0).slice(0, 6) : []),
    [radarActive, allLoaded, matchOf],
  );
  const radarIds = useMemo(() => new Set(radar.map(i => i.id)), [radar]);

  // Symbol-filter view: everything loaded that mentions the picked symbol.
  const symbolMatched = useMemo(
    () => (symbolFilter ? allLoaded.filter(it => matchSymbols(itemText(it)).includes(symbolFilter)) : []),
    [symbolFilter, allLoaded],
  );

  // Featured lead story: only on the plain feed (no personalization, no symbols,
  // no filter) — otherwise a band above is the hero instead. Gated on symbolsReady
  // so it doesn't flash in then vanish once traded symbols resolve.
  const showLead = symbolsReady && !category && !highOnly && !sentiment && !personalized && !symbolFilter;
  const lead = useMemo(() => {
    if (!showLead || items.length === 0) return null;
    return [...items.slice(0, 12)].sort(
      (a, b) => Number(b.marketMoving) - Number(a.marketMoving) || (b.relevance ?? 0) - (a.relevance ?? 0),
    )[0] ?? null;
  }, [items, showLead]);
  const gridItems = (lead ? items.filter(i => i.id !== lead.id) : items).filter(i => !radarIds.has(i.id));
  // The lead never repeats in the radar band.
  const radarShown = lead ? radar.filter(i => i.id !== lead.id) : radar;

  const scrollRef = useRef<HTMLDivElement>(null);
  const prependAnchor = useRef<{ h: number; top: number } | null>(null);

  // After a live prepend (see route()), keep the reader where they were: add the
  // height that appeared above the viewport back onto scrollTop. Runs before
  // paint so there's no visible jump. Appends at the bottom never set the anchor.
  useLayoutEffect(() => {
    const a = prependAnchor.current;
    if (!a) return;
    prependAnchor.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.scrollHeight - a.h;
    if (delta > 0) el.scrollTop = a.top + delta;
  });

  const filters = useCallback(
    () => ({
      ...(category ? { category } : {}),
      ...(highOnly ? { impact: 'HIGH' as EventImpact } : {}),
      ...(sentiment ? { sentiment } : {}),
      ...(personalized ? { excludeSources: prefs } : {}),
    }),
    [category, highOnly, sentiment, personalized, prefs],
  );

  // The bottom feed ("more headlines" when personalized, else the whole feed).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.news.list(filters());
      setItems(page.items);
      setCursor(page.nextCursor);
      setError('');
      setUpdatedAt(new Date().toISOString());
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
    // Live items are prepended at the top of the feed. If the reader is scrolled
    // down, that would shove everything below the viewport and make the browser's
    // scroll-anchoring lurch (content flashing / snapping). So before a prepend
    // that actually adds something, record the pre-update scroll metrics; a
    // layout effect restores the visual position after commit (see below).
    const anchorIfScrolled = () => {
      const el = scrollRef.current;
      if (el && el.scrollTop > 40) prependAnchor.current = { h: el.scrollHeight, top: el.scrollTop };
    };
    const route = (incoming: NewsItem[]) => {
      setUpdatedAt(new Date().toISOString());
      if (!incoming.length) return;
      if (!personalized) {
        setItems(prev => { const next = dedupePrepend(prev, incoming); if (next !== prev) anchorIfScrolled(); return next; });
        return;
      }
      const top = incoming.filter(i => pset.has(i.source));
      const rest = incoming.filter(i => !pset.has(i.source));
      if (top.length) setTopItems(prev => { const next = dedupePrepend(prev, top); if (next !== prev) anchorIfScrolled(); return next; });
      if (rest.length) setItems(prev => { const next = dedupePrepend(prev, rest); if (next !== prev) anchorIfScrolled(); return next; });
    };
    api.news.stream(route, controller.signal).catch(() => setLive(false));
    const poll = setInterval(async () => {
      try {
        const page = await api.news.list({});
        route(page.items);
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => { controller.abort(); clearInterval(poll); setLive(false); };
  }, [category, highOnly, sentiment, personalized, prefs]);

  // Infinite scroll (bottom feed). The feed scrolls inside an inner
  // overflow-y-auto container, so we watch THAT element's scroll position. (An
  // IntersectionObserver rooted on it proved unreliable — it silently no-ops
  // when the tab loses focus and on some layout edges.) A ref guard prevents
  // double-fires; a ref for the cursor keeps the handler stable across pages.
  const loadingMoreRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !cursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await api.news.list({ ...filters(), cursor: cursorRef.current });
      setItems(prev => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      cursorRef.current = page.nextCursor;
    } catch { /* ignore */ } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Desktop: the list scrolls inside its card. Phones: the list is in the page
    // flow, so measure how far its bottom is below the viewport instead.
    const onScroll = () => {
      if (!el.offsetParent) return; // hidden (calendar tab on phones)
      const inner = el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible';
      const left = inner ? el.scrollHeight - el.scrollTop - el.clientHeight : el.getBoundingClientRect().bottom - window.innerHeight;
      if (left < 600) void loadMore();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll(); // auto-fill when the first page is shorter than the container
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [loadMore, cursor]);

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

  const skel = (n: number) => (
    <div className="mk-skels" aria-hidden>{Array.from({ length: n }).map((_, i) => <div key={i} className="mk-sk-item"><i className="x-skel x-skel--in" /><span><i className="x-skel x-skel--in" /><i className="x-skel x-skel--in" /></span></div>)}</div>
  );
  const rows = (list: NewsItem[]) => <div className="mk-items">{list.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} matched={matchOf(it)} />)}</div>;

  return (
    <>
      <section className="x-card mk-news" data-testid="news-page" aria-labelledby="mk-news-t">
        <div className="x-ch mk-news-hd">
          <h2 id="mk-news-t">Headlines</h2>
          <span className="x-sub mk-fresh">
            {live && !category && !highOnly && !sentiment && <span className="mk-onair"><i className="x-dot" aria-hidden />Live</span>}
            {updatedAt ? <span>Updated {timeAgo(updatedAt)}</span> : loading ? <span>Loading…</span> : null}
          </span>
          <div className="x-r">
            <button onClick={() => setPickerOpen(true)} data-testid="news-customize-btn" className="x-btn x-btn--sm" aria-pressed={prefs.length > 0} title="Choose your outlets">
              Sources{prefs.length > 0 ? <span className="mk-count m">{prefs.length}</span> : catalog.length ? <span className="x-dim m">{catalog.length}</span> : null}
            </button>
            <button onClick={runBrief} data-testid="news-brief-btn" className="x-btn x-btn--sm x-btn--hi">Brief</button>
          </div>
        </div>

        <div className="mk-hscroll mk-filters">
          <div className="x-seg x-seg--in x-seg--sm" role="group" aria-label="Category">
            <button aria-pressed={!category} onClick={() => setCategory(null)}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)} data-testid={`news-cat-${c}`}>{CAT_LABEL[c]}</button>
            ))}
          </div>
          <button aria-pressed={highOnly} className="mk-tog" onClick={() => setHighOnly(v => !v)} data-testid="news-high"><i className="x-dot x-dot--r" aria-hidden />High impact</button>
          <div className="x-seg x-seg--in x-seg--sm" role="group" aria-label="Sentiment">
            {(['BULLISH', 'BEARISH', 'NEUTRAL'] as const).map(v => (
              <button key={v} aria-pressed={sentiment === v} onClick={() => setSentiment(sentiment === v ? null : v)} data-testid={`news-sent-${v.toLowerCase()}`}>{SENT_LABEL[v]}</button>
            ))}
          </div>
        </div>

        {hasSymbols && (
          <div className="mk-hscroll mk-symrow" data-testid="news-symbol-tabs">
            <span className="mk-symrow-l">Your markets</span>
            <div className="x-seg x-seg--in x-seg--sm" role="group" aria-label="Your markets">
              <button aria-pressed={!symbolFilter} onClick={() => setSymbolFilter(null)}>All</button>
              {symbolTabs.map(s => <button key={s} aria-pressed={symbolFilter === s} onClick={() => setSymbolFilter(symbolFilter === s ? null : s)} data-testid={`news-symbol-${s}`}>{s}</button>)}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="mk-flist" data-testid="news-list">
          {briefOpen && (
            <section className="x-inset mk-briefbox" data-testid="news-brief" aria-live="polite">
              <div className="mk-briefbox-hd">
                <b>Morning brief</b>
                <span className="x-muted">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · for {hasSymbols ? `your ${userSymbols.size} market${userSymbols.size === 1 ? '' : 's'}` : 'today’s session'}</span>
                <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => setBriefOpen(false)}>Close</button>
              </div>
              <div className="mk-md">
                {brief ? <MarkdownMessage content={brief} /> : briefLoading ? <p className="x-muted">Writing your brief…</p> : <p className="x-muted">The brief isn’t available right now.</p>}
              </div>
            </section>
          )}

          {loading && items.length === 0 && topItems.length === 0 ? skel(7)
          : error ? (
            <div className="x-empty"><b>News unavailable</b><p>{error}</p><button className="x-btn x-btn--sm" onClick={() => void load()}>Try again</button></div>
          ) : items.length === 0 && topItems.length === 0 ? (
            <div className="x-empty"><b>No news yet</b><p>The feed fills in as headlines come in.</p></div>
          ) : symbolFilter ? (
            <div data-testid="news-symbol-view">
              {symbolMatched.length > 0 ? rows(symbolMatched)
                : <div className="x-empty"><b>Nothing on {symbolFilter} yet</b><p>Headlines that mention it appear here as the feed updates.</p></div>}
            </div>
          ) : (
            <>
              {lead && (
                <button type="button" onClick={() => setSelectedItem(lead)} data-testid="news-lead" className={`mk-top ${lead.imageUrl ? '' : 'mk-top--text'}`}>
                  <span className="mk-top-m">
                    <span className="mk-item-meta">
                      <span className="x-tag x-tag--solid">Top story</span>
                      <span className="mk-ell">{lead.source} · {timeAgo(lead.publishedAt)}{lead.category ? ` · ${CAT_LABEL[lead.category]}` : ''}</span>
                    </span>
                    <span className="mk-top-t">{lead.title}</span>
                    {lead.summary && <span className="mk-top-s">{lead.summary}</span>}
                    <span className="mk-top-ft">
                      <Tags it={lead} />
                      {matchSymbols(itemText(lead)).slice(0, 3).map(s => <span key={s} className="x-tag x-tag--m">{s}</span>)}
                      <span className="mk-top-go">Read more <ArrowNE /></span>
                    </span>
                  </span>
                  {/* Only a real picture; a drawn chart would suggest a price move the story may not be about (A4.9). */}
                  {lead.imageUrl && (
                    <span className="mk-top-art" aria-hidden>
                      <NewsThumb src={lead.imageUrl} className="mk-top-img" />
                    </span>
                  )}
                </button>
              )}

              {radarShown.length > 0 && (
                <section data-testid="news-radar">
                  <h3 className="mk-h">On your radar</h3>
                  {rows(radarShown)}
                </section>
              )}
              {personalized && (
                <section data-testid="news-your-sources">
                  <h3 className="mk-h">From your sources<button className="x-btn x-btn--sm x-btn--ghost" onClick={() => setPickerOpen(true)}>Edit</button></h3>
                  {topLoading ? skel(2)
                    : topItems.length === 0 ? <p className="mk-none">Nothing new from your sources yet.</p>
                    : rows(topItems)}
                </section>
              )}
              {(radarShown.length > 0 || personalized) && <h3 className="mk-h" data-testid="news-more">More headlines</h3>}
              {rows(gridItems)}
              {cursor && <div className="mk-loadmore">{loadingMore && <svg width="18" height="18" viewBox="0 0 24 24" className="x-spin" aria-label="Loading more"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="2.5" /><circle cx="12" cy="12" r="9" fill="none" stroke="var(--g)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" /></svg>}</div>}
              <p className="mk-fine">Aggregated headlines · AI tags are informational · not investment advice</p>
            </>
          )}
        </div>
      </section>

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
    </>
  );
}
