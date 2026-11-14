'use client';

// Analytics v2 ("D · AI"): a left menu of views (each with its headline
// number), an Overview hero ("where your edge comes from, and where you
// bleed") and six focused sections. Every number comes from one call,
// GET /api/insights/analytics (computed server-side from the account's closed
// trades, cached ~60s); account, date range and filters drive all of it. The
// AI shows up as one line per section and chart plus marks on the charts;
// "Explain" sends a chart's numbers to the AI coach, like the dashboard.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';
import { isCustom, spanBounds, type RangeKey, type Span } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import { rangeText } from '@/lib/date-presets';
import { dashV2, type DashParams, type DashRange, type DashSession } from '@/lib/dashboard-v2-api';
import { firstParagraph, SESSION_SHORT } from '@/lib/dashboard-v2-format';
import { anaV2, viewFromSearch, type AnalyticsV2DTO, type AnalyticsView } from '@/lib/analytics-v2-api';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import { IPlus } from '@/components/v6/icons';
import DateRangePicker from '@/components/v6/ui/date-range';
import { AskBox, type AskState } from '@/components/dashboard-v2/ask';
import { FilterSel, Hero, SECTIONS, ViewNav, type ViewCtx } from '@/components/analytics-v2/views';
import '@/components/dashboard-v2/dashboard-v2.css';
import '@/components/analytics-v2/analytics-v2.css';

const RANGES: { key: RangeKey; api: DashRange; short: string; label: string }[] = [
  { key: '1W', api: '7D', short: '7D', label: 'Last 7 days' },
  { key: '1M', api: '30D', short: '30D', label: 'Last 30 days' },
  { key: '3M', api: '90D', short: '90D', label: 'Last 90 days' },
  { key: '1Y', api: '1Y', short: '1Y', label: 'Last 12 months' },
  { key: 'ALL', api: 'ALL', short: 'All', label: 'All time' },
];
interface Filters { symbol?: string; session?: DashSession; side?: 'LONG' | 'SHORT'; tag?: string }
/** Same switch as the dashboard: one "AI notes" preference on this device. */
const AI_KEY = 'tl-dash-ai-notes';

function useMedia(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => { const mq = window.matchMedia(q); const set = () => setM(mq.matches); set(); mq.addEventListener('change', set); return () => mq.removeEventListener('change', set); }, [q]);
  return m;
}

export default function AnalyticsPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const { data: session } = authClient.useSession();
  const toast = useToast();
  const [span, setSpan] = useState<Span>('3M');
  const [filters, setFilters] = useState<Filters>({});
  const [view, setView] = useState<AnalyticsView>('overview');
  const [ai, setAi] = useState(true);
  const [data, setData] = useState<AnalyticsV2DTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [ask, setAsk] = useState<AskState>({ status: 'idle' });
  const [, tick] = useState(0);
  const wide = useMedia('(min-width: 1600px)');
  const mid = useMedia('(min-width: 1100px)');
  const req = useRef(0);
  const askReq = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // The view lives in the URL (?view=time) so it can be linked and survives reloads.
  useEffect(() => {
    setView(viewFromSearch(window.location.search));
    try { if (localStorage.getItem(AI_KEY) === '0') setAi(false); } catch { /* storage unavailable */ }
    const onPop = () => setView(viewFromSearch(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const pickView = useCallback((v: AnalyticsView) => {
    setView(v);
    const u = new URL(window.location.href);
    if (v === 'overview') u.searchParams.delete('view'); else u.searchParams.set('view', v);
    window.history.replaceState(window.history.state, '', u.toString());
    const top = mainRef.current?.getBoundingClientRect().top;
    if (top != null && top < 0) mainRef.current?.scrollIntoView({ block: 'start' });
  }, []);
  const toggleAi = () => setAi(v => { try { localStorage.setItem(AI_KEY, v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(id); }, []);

  const params = useMemo<DashParams | null>(() => {
    if (!selected) return null;
    const base: DashParams = { accountId: selected.id, range: isCustom(span) ? 'ALL' : RANGES.find(r => r.key === span)!.api, ...filters };
    if (isCustom(span)) { const b = spanBounds(span); if (b.start != null) base.from = b.start; if (b.end != null) base.to = b.end; }
    return base;
  }, [selected, span, filters]);

  const load = useCallback(async (p: DashParams) => {
    const id = ++req.current;
    setLoading(true); setError('');
    try {
      const d = await anaV2.get(p);
      if (id === req.current) setData(d);
    } catch (err) {
      if (id === req.current) setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally { if (id === req.current) setLoading(false); }
  }, []);
  useEffect(() => {
    if (params) void load(params);
    else if (!accountsLoading) setLoading(false);
  }, [params, accountsLoading, load]);
  // New account: forget filters that belonged to the old one, and any open answer.
  useEffect(() => { setFilters({}); setAsk({ status: 'idle' }); setData(null); setSyncedAt(selected?.lastSyncAt ?? null); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useCallback(async () => {
    if (!selected || !params) return;
    setSyncing(true);
    try {
      const r = await api.accounts.sync(selected.id);
      setSyncedAt(r.account.lastSyncAt ?? new Date().toISOString());
      await load(params);
      toast.success(r.result === 'running' ? 'Still importing your history — this can take a minute on large accounts' : 'Synced');
    } catch (err) {
      toast.error(`Sync failed · ${err instanceof Error ? err.message : 'try again'}`);
    } finally { setSyncing(false); }
  }, [selected, params, load, toast]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.some(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
  }

  // ── Ask your journal + Explain (same flow as the dashboard) ──
  const askCoach = useCallback(async (q: string, prompt: string) => {
    if (!selected) return;
    askReq.current?.abort();
    const ctl = new AbortController();
    askReq.current = ctl;
    const used = data?.counts.trades ?? 0;
    let text = '';
    setAsk({ status: 'text', q, text: '', used, done: false });
    try {
      await api.ai.chat({ accountId: selected.id, messages: [{ role: 'user', content: prompt.slice(0, 3900) }] }, t => {
        text += t;
        if (!ctl.signal.aborted) setAsk({ status: 'text', q, text: firstParagraph(text), used, done: false });
      }, { signal: ctl.signal, onError: m => { if (!text) setAsk({ status: 'error', q, error: m }); } });
      if (!ctl.signal.aborted && text) setAsk({ status: 'text', q, text: firstParagraph(text), used, done: true });
      else if (!ctl.signal.aborted && !text) setAsk({ status: 'error', q, error: 'The coach had no answer. Try again.' });
    } catch (err) {
      if (!ctl.signal.aborted) setAsk({ status: 'error', q, error: err instanceof Error ? err.message : 'The coach is unavailable right now.' });
    }
  }, [selected, data?.counts.trades]);

  const onAsk = useCallback(async (q: string) => {
    if (!params) return;
    askReq.current?.abort();
    askReq.current = null;
    setAsk({ status: 'loading', q });
    try {
      const a = await dashV2.ask({ ...params, q });
      if (a.kind === 'chart') { setAsk({ status: 'chart', q, a }); return; }
      await askCoach(q, `${q}\n\nAnswer in one short paragraph.`);
    } catch (err) {
      setAsk({ status: 'error', q, error: err instanceof Error ? err.message : 'Could not answer that.' });
    }
  }, [params, askCoach]);
  const closeAsk = useCallback(() => { askReq.current?.abort(); setAsk({ status: 'idle' }); }, []);

  const rangeLabel = isCustom(span) ? rangeText(span) : RANGES.find(o => o.key === span)!.label;
  const rangeShort = isCustom(span) ? 'Range' : RANGES.find(o => o.key === span)!.short;
  const explain = useCallback((what: string, summary: string) => {
    const scope = `${rangeLabel.toLowerCase()}${filters.symbol ? `, ${filters.symbol}` : ''}${filters.session ? `, ${SESSION_SHORT[filters.session]} session` : ''}${filters.side ? `, ${filters.side.toLowerCase()}s` : ''}${filters.tag ? `, tag ${filters.tag}` : ''}`;
    void askCoach(`Explain: ${what}`, `Explain my ${what} chart (${scope}, ${data?.counts.trades ?? 0} trades, times in UTC): ${summary}. Answer in one short paragraph.`);
    if (!mid) document.querySelector('[data-testid=ask-page]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [askCoach, data?.counts.trades, filters, mid, rangeLabel]);

  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'trader';
  const subtitle = selected
    ? <><i className="d2-live" aria-hidden />{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · {syncedAt ? `synced ${timeAgo(syncedAt)}` : loading ? 'loading…' : 'not synced yet'}</>
    : `Welcome, ${first}`;
  const askBox = (placement: 'top' | 'bar' | 'page') => <AskBox state={ask} onAsk={onAsk} onClose={closeAsk} placement={placement} />;
  const hasFilters = !!(filters.symbol || filters.session || filters.side || filters.tag);
  const ctx: ViewCtx | null = data && data.overview ? { d: data, ai, rangeShort, explain } : null;
  const sectionNo = (id: AnalyticsView) => `0${SECTIONS.findIndex(s => s.id === id) + 1}`;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Analytics" pageSubtitle={subtitle} onSync={selected ? sync : undefined} syncing={syncing} syncedAt={syncedAt}
      actions={selected ? (
        <>
          {wide && data && data.counts.allClosed > 0 && askBox('top')}
          <div className="x-seg" role="group" aria-label="Date range" data-testid="range-selector">
            {RANGES.map(r => <button key={r.key} aria-pressed={span === r.key} onClick={() => setSpan(r.key)} title={r.label} data-testid={`range-${r.key}`}>{r.short}</button>)}
          </div>
          <DateRangePicker value={isCustom(span) ? span : null} onChange={setSpan} note="Days in your time zone" />
        </>
      ) : null}>
      <div className={`d2 a2${ai ? '' : ' ai-off'}`} data-testid="analytics-page">
        {error && (
          <div className="d2-banner" role="alert" data-testid="analytics-error">
            <span>{error}</span>
            <button type="button" className="x-btn x-btn--sm" onClick={() => params && load(params)}>Retry</button>
          </div>
        )}

        {!selected && !accountsLoading ? (
          <section className="d2-card d2-connect" data-testid="analytics-empty">
            <h2>Connect your MT5 account</h2>
            <p>Use your investor (read-only) password. TRADElogs can read your trades but can never place or close one.</p>
            <ul><li>History imports in about a minute</li><li>Every view here fills in from your real trades</li></ul>
            <button className="x-btn x-btn--hi x-btn--lg" onClick={() => setShowConnect(true)} data-testid="analytics-connect"><IPlus size={15} />Connect MT5</button>
          </section>
        ) : !data ? (error ? null : <Skeleton />) : data.counts.allClosed === 0 ? (
          <section className="d2-card d2-connect" data-testid="analytics-waiting">
            <h2>Waiting for your first closed trade</h2>
            <p>{selected?.broker} is connected. As soon as a position closes it shows up here, usually within a few minutes.</p>
          </section>
        ) : (
          <>
            {!mid && askBox('page')}
            <div className="d2-bar" data-testid="analytics-toolbar">
              {mid && !wide && askBox('bar')}
              <span className="d2-grow" />
              <FilterSel icon label="Symbol" value={filters.symbol ?? ''} all={`All ${data.options.symbols.length}`}
                options={data.options.symbols.map(s => ({ v: s.symbol, label: `${s.symbol} (${s.trades})` }))} onChange={v => setFilters(f => ({ ...f, symbol: v || undefined }))} />
              <FilterSel label="Session" value={filters.session ?? ''} all="All"
                options={(['ASIA', 'LONDON', 'NY'] as const).map(s => ({ v: s, label: SESSION_SHORT[s] }))} onChange={v => setFilters(f => ({ ...f, session: (v || undefined) as DashSession | undefined }))} />
              <FilterSel label="Side" value={filters.side ?? ''} all="Both"
                options={[{ v: 'LONG', label: 'Long' }, { v: 'SHORT', label: 'Short' }]} onChange={v => setFilters(f => ({ ...f, side: (v || undefined) as 'LONG' | 'SHORT' | undefined }))} />
              <FilterSel label="Tag" value={filters.tag ?? ''} all="Any" disabled={!data.options.tags.length && !filters.tag}
                options={data.options.tags.map(t => ({ v: t, label: t }))} onChange={v => setFilters(f => ({ ...f, tag: v || undefined }))} />
              <button type="button" className="d2-fp" role="switch" aria-checked={ai} onClick={toggleAi} data-testid="ai-notes">AI notes <span className={`d2-sw${ai ? ' on' : ''}`} aria-hidden /></button>
            </div>

            {data.counts.trades === 0 || !ctx ? (
              <section className="d2-card d2-connect" data-testid="analytics-no-trades">
                <h2>No closed trades in this view</h2>
                <p>{data.counts.inWindow ? `${data.counts.inWindow} trades in ${rangeLabel.toLowerCase()}, none match the filters.` : `Nothing closed in ${rangeLabel.toLowerCase()}. ${data.counts.allClosed} trades in total.`}</p>
                <div className="d2-row">
                  {hasFilters && <button type="button" className="x-btn" onClick={() => setFilters({})}>Clear filters</button>}
                  {span !== 'ALL' && <button type="button" className="x-btn" onClick={() => setSpan('ALL')}>Show all time</button>}
                </div>
              </section>
            ) : (
              <div className="a2-lay">
                <ViewNav view={view} nav={data.nav} ai={ai} onPick={pickView} />
                <div ref={mainRef} className={`a2-main${loading ? ' d2-stale' : ''}`} aria-busy={loading} data-testid={`analytics-view-${view}`}>
                  {data.counts.trades < data.minTrades && (
                    <p className="d2-few" data-testid="few-trades">{data.counts.trades} trades in this view. The rules, behaviour score and some charts need {data.minTrades}.</p>
                  )}
                  {view === 'overview'
                    ? <><Hero c={ctx} />{SECTIONS.map(({ id, C }) => <C key={id} c={ctx} no={sectionNo(id)} />)}</>
                    : SECTIONS.filter(s => s.id === view).map(({ id, C }) => <C key={id} c={ctx} no={sectionNo(id)} />)}
                </div>
              </div>
            )}
            <details className="a2-how" data-testid="analytics-how">
              <summary>How these numbers are computed</summary>
              <ul>
                <li>Every figure comes from your closed trades in this account, range and filters. Times are UTC: hour, weekday and session come from when a trade opened; days, weeks (Monday to Sunday) and months from when it closed. A win is net P&amp;L above $0, fees and swap included.</li>
                <li>Sessions: Asia 22:00–07:00, London 07:00–13:00, New York 13:00–22:00 UTC. Edge is your best session when it is net positive; Bleed is every net-negative session together.</li>
                <li>Rules are checks we run on every trade, the same ones as the dashboard grades: opened after 2 losing trades in a row that day; opened within 15 min of a losing trade closing; more than 1.5× your usual (median) size on that symbol; opened in a UTC hour that is net negative for you in this view{data.counts.withR ? '; lost more than 1.25R' : ''}. A trade that broke several counts once, under the first. They need {data.minTrades}+ trades.</li>
                <li>Behaviour score: the average of three pass rates. Discipline: not after 2 losses and not within 15 min of a loss. Risk: no more than 1.5× usual size{data.counts.withR ? ' and no loss past −1.25R' : ''}. Timing: opened in an hour that is net positive for you.</li>
                <li>What-if skips the dashboard&apos;s leaks (groups of 3+ trades you could have avoided before entry, ranked by $ lost). Fixes are added in order and each trade is counted once.</li>
                <li>R values need a stop at entry; with fewer than half the trades (or under 10) carrying one, those charts use $. MAE/MFE, exit efficiency and the break-even what-if need the price path of each trade and stay empty without it.</li>
              </ul>
            </details>
          </>
        )}
      </div>
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}

function Skeleton() {
  return (
    <div className="d2-skel" aria-busy aria-label="Loading analytics" data-testid="analytics-loading">
      <div className="d2-card d2-sk" style={{ height: 40 }} />
      <div className="a2-lay">
        <div className="d2-card d2-sk a2-sk-nav" style={{ height: 300 }} />
        <div className="d2-skel">
          <div className="d2-card d2-sk" style={{ height: 120 }} />
          <div className="d2-card d2-sk" style={{ height: 380 }} />
        </div>
      </div>
    </div>
  );
}
