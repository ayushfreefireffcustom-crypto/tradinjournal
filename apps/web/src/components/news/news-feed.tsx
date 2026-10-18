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
import { Loader } from '@/components/loader';
import { matchSymbols, matchesUserSymbols } from '@/lib/symbol-match';
import { api, type NewsItem, type NewsCategory, type Sentiment, type EventImpact, type NewsSource } from '@/lib/api';

const EMPTY_SYMBOLS: ReadonlySet<string> = new Set();

/** Symbols an item mentions that the user also trades (for the YOUR MARKET flag). */
function itemText(it: NewsItem): string {
  return `${it.title} ${it.summary ?? ''}`;
}

const CATEGORIES: NewsCategory[] = ['CRYPTO', 'MACRO', 'GEOPOLITICAL', 'REGULATORY', 'MARKETS'];
const POLL_MS = 60_000;

const SENT_LABEL: Record<Sentiment, string> = { BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' };
const SENT_PILL: Record<Sentiment, string> = { BULLISH: 'g', BEARISH: 'r', NEUTRAL: 'v' };
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
 * One headline card — fixed-height horizontal layout: content on the left, a
 * full-height image column on the right (with a glyph placeholder when there's
 * no/broken image). The title is single-line + ellipsis so two-column rows never
 * mismatch on title line count. `matched` = symbols on it the user trades.
 */
function ArrowNE() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M7 17L17 7M9 7h8v8" /></svg>; }

function NewsCardBase({ it, onOpen, matched = [] }: { it: NewsItem; onOpen: (i: NewsItem) => void; matched?: string[] }) {
  const high = it.impact === 'HIGH' || it.marketMoving;
  const mine = matched.length > 0;
  const tone = it.sentiment ? SENT_PILL[it.sentiment] : 'v';
  return (
    <button type="button" onClick={() => onOpen(it)} data-testid="news-item" className={`mk-card ${mine ? 'mine' : ''}`}>
      <div className="mk-card-m">
        <div className="mk-meta">
          {mine && <span className="v3-pill v mk-mine" data-testid="news-your-market">Your market</span>}
          <span className="src">{it.source} · {timeAgo(it.publishedAt)}</span>
          {it.sentiment && <span className={`v3-pill ${SENT_PILL[it.sentiment]}`}>{SENT_LABEL[it.sentiment]}</span>}
          {high && <span className="v3-pill r">High</span>}
          {it.category && <span className="cat">{CAT_LABEL[it.category]}</span>}
        </div>
        <h3>{it.title}</h3>
        {it.summary ? <p>{it.summary}</p> : <p className="mute">Open to read at {it.source}.</p>}
        {typeof it.relevance === 'number' && (
          <span className="mk-rel" title={`Relevance to traders ${it.relevance}/100`}><i style={{ width: `${it.relevance}%` }} /></span>
        )}
      </div>
      <div className={`mk-tile ${tone}`}>
        <b>{tileFor(it, matched)}</b>
        {it.imageUrl && <NewsThumb src={it.imageUrl} className="mk-img" />}
      </div>
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
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);
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

  // Two-section mode: preferences set, and no category/impact/symbol filter
  // narrowing the view (filters collapse back to a single list to stay legible).
  const personalized = prefsLoaded && prefs.length > 0 && !category && !highOnly && !symbolFilter;

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
  const radarActive = symbolsReady && hasSymbols && !category && !highOnly && !symbolFilter;
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
  const showLead = symbolsReady && !category && !highOnly && !personalized && !symbolFilter;
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
  }, [category, highOnly, personalized, prefs]);

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
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) void loadMore();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // auto-fill when the first page is shorter than the container
    return () => el.removeEventListener('scroll', onScroll);
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

  return (
    <>
      <div className="mk-feed" data-testid="news-page">
        <div className="mk-bar">
          <div className="mk-chips" role="group" aria-label="Category">
            <button aria-pressed={!category} onClick={() => setCategory(null)}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)} data-testid={`news-cat-${c}`}>{CAT_LABEL[c]}</button>
            ))}
            <button aria-pressed={highOnly} className="hi" onClick={() => setHighOnly(v => !v)} data-testid="news-high">High impact</button>
          </div>
          <div className="mk-acts">
            {live && !category && !highOnly && <span className="mk-live"><i />Live</span>}
            <button onClick={() => setPickerOpen(true)} data-testid="news-customize-btn" className={`ch-pill ${prefs.length ? 'on' : ''}`} title="Choose your outlets">
              Sources{prefs.length > 0 ? ` · ${prefs.length}` : ` · ${catalog.length || ''}`.replace(/ · $/, '')}
            </button>
            <button onClick={runBrief} data-testid="news-brief-btn" className="mk-brief-btn">✦ Brief</button>
          </div>
        </div>

        {hasSymbols && (
          <div className="mk-syms" data-testid="news-symbol-tabs">
            <span className="lbl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg> Your markets</span>
            <button aria-pressed={!symbolFilter} onClick={() => setSymbolFilter(null)}>All</button>
            {symbolTabs.map(s => <button key={s} aria-pressed={symbolFilter === s} onClick={() => setSymbolFilter(symbolFilter === s ? null : s)} data-testid={`news-symbol-${s}`}>{s}</button>)}
          </div>
        )}

        <div ref={scrollRef} className="mk-list" data-testid="news-list">
          {briefOpen && (
            <section className="mk-brief" data-testid="news-brief" aria-live="polite">
              <div className="hd">
                <h3>✦ Your morning brief</h3>
                <span>{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · written for {hasSymbols ? `your ${userSymbols.size} market${userSymbols.size === 1 ? '' : 's'}` : 'today’s session'} · <button onClick={() => setBriefOpen(false)}>Close</button></span>
              </div>
              {brief ? <MarkdownMessage content={brief} /> : briefLoading ? <p className="wr">Writing your brief<span className="dots" /></p> : <p className="wr">The brief isn’t available right now.</p>}
            </section>
          )}

          {loading && items.length === 0 && topItems.length === 0 ? (
            <div className="mk-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 200, borderRadius: 20 }} />)}</div>
          ) : error ? (
            <div className="v3-card d-empty"><b>News unavailable</b>{error}</div>
          ) : items.length === 0 && topItems.length === 0 ? (
            <div className="v3-card d-empty"><b>No news yet</b>The feed fills in as headlines are ingested.</div>
          ) : symbolFilter ? (
            <>
              <div className="mk-grid" data-testid="news-symbol-view">
                {symbolMatched.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} matched={matchOf(it)} />)}
              </div>
              {symbolMatched.length === 0 && <div className="v3-card d-empty">No loaded headlines mention {symbolFilter} yet — they’ll appear as the feed updates.</div>}
            </>
          ) : (
            <>
              {lead && (() => {
                const high = lead.impact === 'HIGH' || lead.marketMoving;
                return (
                  <button type="button" onClick={() => setSelectedItem(lead)} data-testid="news-lead" className="mk-lead">
                    <div className="mk-lead-m">
                      <div className="mk-meta">
                        <span className="v3-pill v">Top story</span>
                        <span className="src">{lead.source} · {timeAgo(lead.publishedAt)}</span>
                        {lead.sentiment && <span className={`v3-pill ${SENT_PILL[lead.sentiment]}`}>{SENT_LABEL[lead.sentiment]}</span>}
                        {high && <span className="v3-pill r">High</span>}
                        {lead.category && <span className="cat">{CAT_LABEL[lead.category]}</span>}
                      </div>
                      <h2>{lead.title}</h2>
                      {lead.summary && <p>{lead.summary}</p>}
                      <div className="mk-lead-ft">
                        {matchSymbols(itemText(lead)).slice(0, 3).map(s => <span key={s} className="t-tag">{s}</span>)}
                        <span className="v3-link">Read more <ArrowNE /></span>
                      </div>
                    </div>
                    <div className={`mk-lead-art ${lead.sentiment === 'BEARISH' ? 'down' : ''}`} aria-hidden>
                      {lead.imageUrl ? <NewsThumb src={lead.imageUrl} className="mk-img" /> : (
                        <svg viewBox="0 0 400 300" preserveAspectRatio="none"><path className="ln" d={lead.sentiment === 'BEARISH' ? 'M0 90 L60 110 L100 95 L160 150 L200 140 L260 200 L300 185 L360 240 L400 250' : 'M0 220 L60 205 L100 215 L160 150 L200 162 L260 100 L300 115 L360 55 L400 45'} /></svg>
                      )}
                    </div>
                  </button>
                );
              })()}

              {radarShown.length > 0 && (
                <section data-testid="news-radar">
                  <div className="mk-sec"><span>On your radar</span></div>
                  <div className="mk-grid">{radarShown.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} matched={matchOf(it)} />)}</div>
                </section>
              )}
              {personalized && (
                <section data-testid="news-your-sources">
                  <div className="mk-sec"><span>From your sources</span><button className="v3-link" onClick={() => setPickerOpen(true)}>Edit</button></div>
                  {topLoading ? <div className="mk-grid">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 200, borderRadius: 20 }} />)}</div>
                    : topItems.length === 0 ? <p className="mute" style={{ fontSize: 14 }}>Nothing new from your sources yet.</p>
                    : <div className="mk-grid">{topItems.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} matched={matchOf(it)} />)}</div>}
                </section>
              )}
              {(radarShown.length > 0 || personalized) && <div className="mk-sec" data-testid="news-more"><span>More headlines</span></div>}
              <div className="mk-grid">{gridItems.map(it => <NewsCard key={it.id} it={it} onOpen={setSelectedItem} matched={matchOf(it)} />)}</div>
              {cursor && <div className="mk-more">{loadingMore && <Loader size={20} />}</div>}
              <p className="mk-foot">Aggregated headlines · AI tags are informational · not investment advice</p>
            </>
          )}
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
    </>
  );
}
