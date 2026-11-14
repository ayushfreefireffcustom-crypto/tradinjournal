'use client';

// The News page (direction E, "map"): controls, the story map with the
// calendar / your-trades rail, the moved-since scoreboard and the wire.
// Data: GET /api/news/today (scored kept stories + counts), GET
// /api/news/reactions (5m series), the calendar, and the selected account's
// trades. The live SSE feed triggers a refresh; everything else polls each minute.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type CalendarEvent, type NewsItem } from '@/lib/api';
import {
  byScore, hitsFor, inTab, mineFrom, newsMapApi, pickWire, printsFor, seriesIndex, TABS,
  type Mine, type NewsReactions, type NewsStory, type NewsToday, type Scope, type Tab, type TradeLite,
} from '@/lib/news-map-api';
import NewsModal from '@/components/news/news-modal';
import StoryMap from './story-map';
import Board from './board';
import Wire, { NoiseBar } from './wire';
import { Hits, NextUp } from './rail';

const POLL_MS = 60_000;
const fmtN = (n: number) => n.toLocaleString('en-US');

function useVisiblePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) ref.current(); }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function NewsMapPage({ accountId, now }: { accountId: string | null; now: number }) {
  const [today, setToday] = useState<NewsToday | null>(null);
  const [todayErr, setTodayErr] = useState('');
  const [rx, setRx] = useState<NewsReactions | null>(null);
  const [rxErr, setRxErr] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [calErr, setCalErr] = useState(false);
  const [trades, setTrades] = useState<TradeLite[]>([]);
  const [scope, setScope] = useState<Scope>('top');
  const [tab, setTab] = useState<Tab>('ALL');
  const [open, setOpen] = useState<NewsItem | null>(null);
  const [mapN, setMapN] = useState(0);
  const [feed, setFeed] = useState<{ items: NewsStory[]; cursor: string | null; loading: boolean; error: boolean }>({ items: [], cursor: null, loading: false, error: false });

  const loadToday = useCallback(async () => {
    try { setToday(await newsMapApi.today()); setTodayErr(''); }
    catch (e) { setTodayErr((e as Error).message || 'Could not load the news.'); }
  }, []);
  const loadRx = useCallback(async () => {
    try { setRx(await newsMapApi.reactions()); setRxErr(false); } catch { setRxErr(true); }
  }, []);
  const loadCal = useCallback(async () => {
    const n = Date.now();
    const d = new Date(n);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    try {
      setEvents(await api.calendar.list({ from: new Date(n - 26 * 3600_000).toISOString(), to: end.toISOString(), impacts: ['HIGH', 'MEDIUM'] }));
      setCalErr(false);
    } catch { setCalErr(true); setEvents([]); }
  }, []);

  useEffect(() => { void loadToday(); void loadRx(); void loadCal(); }, [loadToday, loadRx, loadCal]);
  useVisiblePoll(() => { void loadToday(); void loadRx(); }, POLL_MS);
  useVisiblePoll(() => { void loadCal(); }, 5 * POLL_MS);

  // Live: a new batch on the SSE feed refreshes the map (debounced).
  useEffect(() => {
    const ctl = new AbortController();
    let t: ReturnType<typeof setTimeout> | null = null;
    api.news.stream(() => { if (t) clearTimeout(t); t = setTimeout(() => void loadToday(), 2_000); }, ctl.signal).catch(() => {});
    return () => { ctl.abort(); if (t) clearTimeout(t); };
  }, [loadToday]);

  useEffect(() => {
    if (!accountId) { setTrades([]); return; }
    let off = false;
    api.trades.list(accountId).then(t => { if (!off) setTrades(t); }).catch(() => { if (!off) setTrades([]); });
    return () => { off = true; };
  }, [accountId]);

  // "Everything": the whole feed, paginated.
  const loadFeed = useCallback(async (cursor: string | null) => {
    setFeed(f => ({ ...f, loading: true, error: false }));
    try {
      const p = await newsMapApi.feed(cursor);
      setFeed(f => ({ items: cursor ? [...f.items, ...p.items] : p.items, cursor: p.nextCursor, loading: false, error: false }));
    } catch { setFeed(f => ({ ...f, loading: false, error: true })); }
  }, []);
  useEffect(() => { if (scope === 'all' && !feed.items.length && !feed.loading) void loadFeed(null); }, [scope, feed.items.length, feed.loading, loadFeed]);

  const idx = useMemo(() => seriesIndex(rx), [rx]);
  const mine: Mine = useMemo(() => mineFrom(trades), [trades]);
  const stories = useMemo(() => (today?.stories ?? []).filter(s => inTab(s, tab)), [today, tab]);
  const ranked = useMemo(() => [...stories].sort(byScore), [stories]);
  const mapStories = ranked.slice(0, 8);
  const prints = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    const all = [...(today?.stories ?? []), ...feed.items];
    for (const s of all) { const p = printsFor(s, events ?? []); if (p.length) m.set(s.id, p); }
    return m;
  }, [today, feed.items, events]);
  const rankOf = useCallback((s: NewsStory) => {
    const i = mapStories.findIndex(x => x.id === s.id);
    return i >= 0 && i < mapN ? `Story ${i + 1}` : `Wire ${new Date(s.publishedAt).toISOString().slice(11, 16)}`;
  }, [mapStories, mapN]);
  const hits = useMemo(() => hitsFor(ranked, mine, idx, rankOf), [ranked, mine, idx, rankOf]);
  const wire = pickWire(stories, scope);
  const allRows = useMemo(() => feed.items.filter(s => inTab(s, tab)), [feed.items, tab]);
  const c = today?.counts;
  const top = ranked[0] ?? null;
  const tabLabel = TABS.find(t => t.id === tab)!.label;

  const openStory = (s: NewsItem) => setOpen(s);

  return (
    <div className="nw" data-testid="news-page">
      <div className="nw-ctl">
        <div className="nw-seg" role="tablist" aria-label="How much to show">
          <button role="tab" aria-selected={scope === 'top'} className={scope === 'top' ? 'on' : ''} onClick={() => setScope('top')}>Top {mapN || 8}</button>
          <button role="tab" aria-selected={scope === 'important'} className={scope === 'important' ? 'on' : ''} onClick={() => setScope('important')}>Important {c && <i className="num">{fmtN(c.kept)}</i>}</button>
          <button role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Everything {c && <i className="num">{fmtN(c.headlines)}</i>}</button>
        </div>
        <div className="nw-tabs" role="tablist" aria-label="Category">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        {c && c.headlines > 0 && <div className="nw-ctl-r"><span className="nw-ai"><b>TRADElogs AI</b> · <span className="num">{fmtN(c.headlines)}</span> headlines → {mapN} on the map</span></div>}
      </div>

      <div className="nw-top">
        <div className="nw-mapcol">
          {!today && !todayErr ? (
            <div className="nw-sk nw-sk--map" aria-label="Loading stories"><i /><i /><i /><i /></div>
          ) : todayErr && !today ? (
            <div className="nw-empty" role="alert"><b>Couldn&apos;t load the news.</b><span>{todayErr}</span><button type="button" className="nw-btn" onClick={() => void loadToday()}>Retry</button></div>
          ) : !stories.length ? (
            <div className="nw-empty"><b>{tab === 'ALL' ? 'No stories in the last 24 hours yet.' : `Nothing on ${tabLabel} in the last 24 hours.`}</b><span>The map fills as the feeds come in.</span></div>
          ) : (
            <>
              <StoryMap stories={mapStories} idx={idx} prints={prints} mine={mine} onOpen={openStory} onCount={setMapN} />
              <div className="nw-key">
                <span><i className="nw-key-hot" />Market-moving, score 80+</span>
                <span><i className="nw-key-mid" />60–79</span>
                <span><i className="nw-key-low" />40–59</span>
                <span>Tile size = TRADElogs AI score</span>
              </div>
            </>
          )}
        </div>
        <aside className="nw-rail">
          <NextUp events={events} now={now} mine={mine} error={calErr} />
          <Hits hits={hits} onOpen={h => openStory(h.story)} />
        </aside>
      </div>

      <Board top={top} idx={idx} mine={mine} loading={!rx && !rxErr} failed={rxErr} />

      <section className="nw-sec">
        <div className="nw-sh">
          <h2>Wire</h2>
          <span className="nw-m">{scope === 'all' ? 'every story, newest first' : 'kept stories, newest first'}</span>
          {c && c.headlines > 0 && <div className="nw-sh-r"><NoiseBar c={c} /></div>}
        </div>
        {scope === 'all' ? (
          <>
            {allRows.length > 0 && <Wire rows={allRows} idx={idx} prints={prints} mine={mine} onOpen={openStory} />}
            {feed.loading && <div className="nw-sk nw-sk--rows" aria-label="Loading"><i /><i /><i /></div>}
            {!feed.loading && !allRows.length && !feed.error && <p className="nw-none nw-none--line">No stories here yet.</p>}
            {feed.error && <p className="nw-none nw-none--line">Couldn&apos;t load the feed. <button type="button" className="nw-link" onClick={() => void loadFeed(feed.cursor)}>Retry</button></p>}
            {feed.cursor && !feed.loading && <div className="nw-more"><button type="button" className="nw-link" onClick={() => void loadFeed(feed.cursor)}>Load older stories</button></div>}
          </>
        ) : !today ? (
          todayErr ? <p className="nw-none nw-none--line">The wire is unavailable right now.</p> : <div className="nw-sk nw-sk--rows" aria-hidden><i /><i /><i /><i /></div>
        ) : wire.rows.length ? (
          <>
            <Wire rows={wire.rows} idx={idx} prints={prints} mine={mine} onOpen={openStory} />
            <div className="nw-more">
              {wire.more > 0 && <button type="button" className="nw-link" onClick={() => setScope('important')}>Show {fmtN(wire.more)} more important</button>}
              {c && <button type="button" className="nw-link nw-link--m" onClick={() => setScope('all')}>Everything shows all {fmtN(c.headlines)} headlines from {fmtN(c.sources)} sources</button>}
            </div>
          </>
        ) : (
          <p className="nw-none nw-none--line">Nothing kept {tab === 'ALL' ? '' : `on ${tabLabel} `}in the last 24 hours.</p>
        )}
      </section>

      <p className="nw-foot">Scores, merges and picks are generated from source headlines · not investment advice</p>
      {open && <NewsModal item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

