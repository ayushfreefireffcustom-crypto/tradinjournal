'use client';

// Trade log v2 ("D · AI"): saved views, search and filters, a summary of the
// current filter, the daily P&L strip, and a day-grouped table with price-path
// mini charts, R, P&L, rule chips and the AI process grade. Filtering, sorting
// and paging happen on the server (GET /api/insights/tradelog), so thousands of
// trades stay fast; mini charts load only for rows on screen. Clicking a row
// opens the side panel (chart, grade + reasons, similar trades, note).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowsLeftRight, DownloadSimple, Plus, Rows, X } from '@phosphor-icons/react';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';
import { useToast } from '@/components/toast';
import DateRangePicker from '@/components/v6/ui/date-range';
import { IPlus } from '@/components/v6/icons';
import { api, type BrokerAccount, type Deal } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { dateStamp, downloadCsv, toCsv } from '@/lib/csv';
import { rangeText } from '@/lib/date-presets';
import { isCustom, spanBounds, type RangeKey, type Span } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import type { DashRange } from '@/lib/dashboard-v2-api';
import {
  BUILTIN_FILTERS, cleanFilters, CSV_HEADERS, csvRow, loadViews, localDayKey, sameFilters, storeViews, tradelogApi, viewerTz,
  type BuiltinView, type SavedView, type TlDay, type TlFilters, type TlParams, type TlRow, type TlRuleKey, type TlSort, type TradelogDTO,
} from '@/lib/tradelog-v2-api';
import { FilterChips, SearchBox, ViewTabs, type ViewTab } from '@/components/tradelog-v2/toolbar';
import { DailyStrip, SummaryRibbon } from '@/components/tradelog-v2/summary';
import { LogCards, LogTable } from '@/components/tradelog-v2/table';
import { TradePanel } from '@/components/tradelog-v2/panel';
import { ComparePanel } from '@/components/tradelog-v2/compare';
import '@/components/dashboard-v2/dashboard-v2.css';
import '@/components/tradelog-v2/tradelog-v2.css';

const RANGES: { key: RangeKey; api: DashRange; short: string; label: string }[] = [
  { key: '1W', api: '7D', short: '7D', label: 'Last 7 days' },
  { key: '1M', api: '30D', short: '30D', label: 'Last 30 days' },
  { key: '3M', api: '90D', short: '90D', label: 'Last 90 days' },
  { key: '1Y', api: '1Y', short: '1Y', label: 'Last 12 months' },
  { key: 'ALL', api: 'ALL', short: 'All', label: 'All time' },
];
const PAGE = 50;

function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const set = () => setM(mq.matches); set(); mq.addEventListener('change', set); return () => mq.removeEventListener('change', set); }, [q]);
  return m;
}

export default function TradesPage() {
  return <Suspense fallback={null}><TradeLogPage /></Suspense>;
}

function TradeLogPage() {
  const router = useRouter();
  // ?symbol=XAUUSD (from the ⌘K palette) opens the log filtered to that symbol.
  const symbolParam = useSearchParams().get('symbol');
  const toast = useToast();
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const tz = useMemo(() => viewerTz(), []);
  const wide = useMedia('(min-width: 1360px)');
  const phone = useMedia('(max-width: 639px)');

  const [span, setSpan] = useState<Span>('ALL');
  const [filters, setFilters] = useState<TlFilters>(() => (symbolParam ? { symbol: symbolParam } : {}));
  useEffect(() => { if (symbolParam) setFilters(f => ({ ...f, symbol: symbolParam })); }, [symbolParam]);
  const [sort, setSort] = useState<TlSort>('time');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [data, setData] = useState<TradelogDTO | null>(null);
  const [rows, setRows] = useState<TlRow[]>([]);
  const [days, setDays] = useState<Map<string, TlDay>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ kind: 'trade'; row: TlRow } | { kind: 'compare'; rows: TlRow[] } | null>(null);
  const [tab, setTab] = useState<'positions' | 'deals'>('positions');
  const [deals, setDeals] = useState<{ acc: string; list: Deal[] | null; error: string }>({ acc: '', list: null, error: '' });
  const [views, setViews] = useState<SavedView[]>([]);
  const [tagging, setTagging] = useState(false);
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [, tick] = useState(0);
  const req = useRef<AbortController | null>(null);
  const moreReq = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { setViews(loadViews(userId)); }, [userId]);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(id); }, []);

  const params = useMemo<TlParams | null>(() => {
    if (!selected) return null;
    const p: TlParams = { accountId: selected.id, range: isCustom(span) ? 'ALL' : RANGES.find(r => r.key === span)!.api, tz, sort, dir, ...cleanFilters(filters) };
    if (isCustom(span)) { const b = spanBounds(span); if (b.start != null) p.from = b.start; if (b.end != null) p.to = b.end; }
    return p;
  }, [selected, span, filters, sort, dir, tz]);

  const load = useCallback(async (p: TlParams) => {
    req.current?.abort();
    const ctl = new AbortController();
    req.current = ctl;
    moreReq.current++;
    setLoading(true); setError('');
    try {
      const d = await tradelogApi.list({ ...p, offset: 0, limit: PAGE }, ctl.signal);
      if (ctl.signal.aborted) return;
      setData(d); setRows(d.rows); setDays(new Map(d.days.map(x => [x.day, x]))); setHasMore(d.hasMore);
    } catch (err) {
      if (!ctl.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally { if (!ctl.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (params) void load(params);
    else if (!accountsLoading) setLoading(false);
  }, [params, accountsLoading, load]);
  // New filters: forget the selection. New account: forget everything that belonged to the old one.
  useEffect(() => { setSelectedIds(new Set()); setTagging(false); }, [params]);
  useEffect(() => { setPanel(null); setData(null); setRows([]); setSyncedAt(selected?.lastSyncAt ?? null); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!params || !hasMore || loadingMore || loading) return;
    const id = ++moreReq.current;
    setLoadingMore(true);
    try {
      const d = await tradelogApi.list({ ...params, offset: rows.length, limit: PAGE });
      if (id !== moreReq.current) return;
      setRows(prev => { const seen = new Set(prev.map(r => r.id)); return [...prev, ...d.rows.filter(r => !seen.has(r.id))]; });
      setDays(prev => { const m = new Map(prev); for (const x of d.days) m.set(x.day, x); return m; });
      setHasMore(d.hasMore);
    } catch (err) {
      if (id === moreReq.current) toast.error(err instanceof Error ? err.message : 'Could not load more trades');
    } finally { if (id === moreReq.current) setLoadingMore(false); }
  }, [params, hasMore, loadingMore, loading, rows.length, toast]);
  // Infinite scroll: load the next page when the end of the list comes near.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) void loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // Raw deals (loaded on first use).
  useEffect(() => {
    if (tab !== 'deals' || !selected || deals.acc === selected.id) return;
    setDeals({ acc: selected.id, list: null, error: '' });
    api.trades.deals(selected.id).then(list => setDeals({ acc: selected.id, list, error: '' })).catch(e => setDeals({ acc: selected.id, list: [], error: e instanceof Error ? e.message : 'Couldn’t load deals' }));
  }, [tab, selected, deals.acc]);

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

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a); setShowConnect(false);
  }

  // ── filters + views ──
  const setF = useCallback((patch: Partial<TlFilters>) => {
    setFilters(f => cleanFilters({ ...f, ...patch }));
    if (symbolParam && 'symbol' in patch) router.replace('/trades', { scroll: false });
  }, [symbolParam, router]);
  const clearAll = () => { setFilters({}); if (symbolParam) router.replace('/trades', { scroll: false }); };
  const onSort = (k: TlSort) => {
    if (sort === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'symbol' ? 'asc' : 'desc'); }
  };
  const filtersOn = Object.keys(cleanFilters(filters)).length > 0;
  const viewTabs: ViewTab[] = useMemo(() => {
    if (!data) return [];
    const v = data.views;
    const b: Array<[BuiltinView, string, number | null, boolean, string?]> = [
      ['all', 'All trades', v.all, true],
      ['rule', 'Rule broken', v.ruleBroken, data.graded],
      ['grade', 'Grade D–F', v.gradeDF, data.graded],
      ['bigloss', data.bigLoss?.unit === 'R' ? 'Losers past −1R' : 'Big losers', v.bigLosers, !!data.bigLoss,
        data.bigLoss?.unit === '$' ? `Lost more than 1.5× your average loss ($${Math.round(Math.abs(data.bigLoss.threshold)).toLocaleString('en-US')}) — R needs a stop at entry` : undefined],
    ];
    return [
      ...b.filter(x => x[3]).map(([id, name, count, , title]) => ({ id, name, count, active: sameFilters(filters, BUILTIN_FILTERS[id]), title })),
      ...views.map(sv => ({ id: sv.id, name: sv.name, count: null, active: sameFilters(filters, sv.filters), custom: true })),
    ];
  }, [data, views, filters]);
  const pickView = (id: string) => {
    const f = id in BUILTIN_FILTERS ? BUILTIN_FILTERS[id as BuiltinView] : views.find(v => v.id === id)?.filters;
    if (f) { setFilters({ ...f }); if (symbolParam) router.replace('/trades', { scroll: false }); }
  };
  const saveView = (name: string) => {
    const next = [...views.filter(v => v.name !== name), { id: `v${Date.now().toString(36)}`, name, filters: cleanFilters(filters) }];
    setViews(next);
    if (storeViews(userId, next)) toast.success(`Saved “${name}” on this device`);
    else toast.error('Couldn’t save the view: this browser blocks storage');
  };
  const deleteView = (id: string) => { const next = views.filter(v => v.id !== id); setViews(next); storeViews(userId, next); };

  const dateCtl = useMemo(() => {
    const options: Array<{ v: string; label: string }> = RANGES.filter(r => r.key !== 'ALL').map(r => ({ v: r.key, label: r.label }));
    if (isCustom(span)) options.push({ v: 'custom', label: rangeText(span) });
    return {
      value: isCustom(span) ? 'custom' : span === 'ALL' ? '' : span,
      label: 'All time', options,
      onChange: (v: string) => { if (v === 'custom') return; setSpan((v || 'ALL') as RangeKey); },
    };
  }, [span]);

  // ── selection + bulk ──
  const toggle = useCallback((id: string) => setSelectedIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleAll = useCallback(() => setSelectedIds(s => (rows.every(r => s.has(r.id)) ? new Set() : new Set(rows.map(r => r.id)))), [rows]);
  const selRows = useMemo(() => rows.filter(r => selectedIds.has(r.id)), [rows, selectedIds]);
  const openRow = useCallback((r: TlRow) => setPanel(p => (p?.kind === 'trade' && p.row.id === r.id ? null : { kind: 'trade', row: r })), []);
  const closePanel = useCallback(() => setPanel(null), []);

  const accSlug = selected?.broker.replace(/\s+/g, '-').toLowerCase() ?? 'account';
  const exportRows = (list: TlRow[], label: string) => {
    downloadCsv(`tradelogs-trades-${accSlug}-${dateStamp()}.csv`, toCsv(CSV_HEADERS, list.map(csvRow)));
    toast.success(`Exported ${list.length} ${label} to CSV`);
  };
  const exportAll = async () => {
    if (!params || !selected) return;
    if (tab === 'deals') {
      const list = deals.list ?? [];
      const headers = ['Deal Ticket', 'Position ID', 'Symbol', 'Type', 'Entry', 'Volume', 'Price', 'Profit', 'Commission', 'Swap', 'Deal Time'];
      downloadCsv(`tradelogs-deals-${accSlug}-${dateStamp()}.csv`, toCsv(headers, list.map(d => [d.dealTicket, d.positionId, d.symbol, d.type, d.entry, d.volume, d.price, d.profit, d.commission, d.swap, d.dealTime])));
      toast.success(`Exported ${list.length} deals to CSV`);
      return;
    }
    setBusy(true);
    try {
      const { sort: s, dir: d, tz: z, accountId, range, from, to, ...f } = params;
      const r = await tradelogApi.export({ accountId, range, from, to, tz: z, sort: s, dir: d, ...f });
      exportRows(r.rows, 'trades');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally { setBusy(false); }
  };
  const addTag = async () => {
    const tag = tagText.trim();
    if (!tag || !selected || !selRows.length) return;
    setBusy(true);
    try {
      const ids = selRows.map(r => r.id);
      await tradelogApi.tag(selected.id, ids, tag);
      const set = new Set(ids);
      setRows(prev => prev.map(r => (set.has(r.id) && !r.tags.includes(tag) ? { ...r, tags: [...r.tags, tag] } : r)));
      setData(d => (d && !d.options.tags.includes(tag) ? { ...d, options: { ...d.options, tags: [...d.options.tags, tag].sort((a, b) => a.localeCompare(b)) } } : d));
      toast.success(`Tagged ${ids.length} trade${ids.length === 1 ? '' : 's'} “${tag}”`);
      setTagging(false); setTagText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the tag');
    } finally { setBusy(false); }
  };

  // ── render ──
  const today = localDayKey();
  const subtitle = selected
    ? <><i className="d2-live" aria-hidden />{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · {syncedAt ? `synced ${timeAgo(syncedAt)}` : loading ? 'loading…' : 'not synced yet'}</>
    : 'Every position from your broker';
  const grouped = sort === 'time';
  const panelMode: 'inline' | 'drawer' = wide ? 'inline' : 'drawer';
  const rangeLabel = isCustom(span) ? rangeText(span) : RANGES.find(r => r.key === span)!.label;

  const bulkBar = selRows.length > 0 && (
    <div className="tl-bulk" role="toolbar" aria-label="Selected trades" data-testid="bulk-bar">
      <b>{selRows.length} selected</b>
      {tagging ? (
        <form className="tl-tagf" onSubmit={e => { e.preventDefault(); void addTag(); }}>
          <input autoFocus value={tagText} onChange={e => setTagText(e.target.value)} placeholder="Tag name" maxLength={40} list="tl-tags" aria-label="Tag to add"
            onKeyDown={e => { if (e.key === 'Escape') setTagging(false); }} data-testid="tag-input" />
          <datalist id="tl-tags">{data?.options.tags.map(t => <option key={t} value={t} />)}</datalist>
          <button type="submit" disabled={!tagText.trim() || busy}>Add</button>
        </form>
      ) : <button type="button" onClick={() => setTagging(true)} data-testid="bulk-tag"><Plus size={13} />Add tag</button>}
      <button type="button" disabled={selRows.length < 2 || selRows.length > 4} title={selRows.length < 2 || selRows.length > 4 ? 'Select 2 to 4 trades' : undefined}
        onClick={() => setPanel({ kind: 'compare', rows: selRows })} data-testid="bulk-compare"><ArrowsLeftRight size={13} />Compare</button>
      <button type="button" onClick={() => exportRows(selRows, selRows.length === 1 ? 'trade' : 'trades')} data-testid="bulk-export"><DownloadSimple size={13} />Export</button>
      <button type="button" className="tl-bulk-x" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())}><X size={14} /></button>
    </div>
  );

  const panelEl = selected && panel && (panel.kind === 'trade'
    ? <TradePanel key={panel.row.id} accountId={selected.id} row={panel.row} tz={tz} minTrades={data?.minTrades ?? 20} onClose={closePanel} mode={panelMode} />
    : <ComparePanel accountId={selected.id} rows={panel.rows} onClose={closePanel} onOpen={r => setPanel({ kind: 'trade', row: r })} mode={panelMode} />);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Trade log" pageSubtitle={subtitle} onSync={selected ? sync : undefined} syncing={syncing} syncedAt={syncedAt}
      actions={selected ? (
        <>
          <div className="x-seg" role="group" aria-label="Date range" data-testid="range-selector">
            {RANGES.map(r => <button key={r.key} aria-pressed={span === r.key} onClick={() => setSpan(r.key)} title={r.label} data-testid={`range-${r.key}`}>{r.short}</button>)}
          </div>
          <DateRangePicker value={isCustom(span) ? span : null} onChange={setSpan} note="Days in your time zone" />
        </>
      ) : null}>
      <div className="d2 tl2" data-testid="trades-page">
        {error && (
          <div className="d2-banner" role="alert" data-testid="trades-error">
            <span>{error}</span>
            <button type="button" className="x-btn x-btn--sm" onClick={() => params && load(params)}>Retry</button>
          </div>
        )}

        {!selected && !accountsLoading ? (
          <section className="d2-card d2-connect" data-testid="trades-empty">
            <h2>Connect your MT5 account</h2>
            <p>Use your investor (read-only) password. Every closed position shows up here, graded and searchable.</p>
            <button className="x-btn x-btn--hi x-btn--lg" onClick={() => setShowConnect(true)}><IPlus size={15} />Connect MT5</button>
          </section>
        ) : !data ? (error ? null : <Skeleton />) : data.counts.all === 0 ? (
          <section className="d2-card d2-connect" data-testid="trades-none">
            <h2>No positions yet</h2>
            <p>{selected?.broker} is connected. Closed trades appear here after your next MT5 sync.</p>
          </section>
        ) : (
          <>
            <div className="tl-top">
              {tab === 'positions' ? <ViewTabs tabs={viewTabs} onPick={pickView} onDelete={deleteView} onSave={saveView} canSave={filtersOn} /> : <h2 className="tl-dealsh">Raw deals</h2>}
              <div className="tl-top-r">
                {tab === 'positions' && <SearchBox value={filters.q ?? ''} onChange={q => setF({ q: q || undefined })} />}
                <button type="button" className="d2-fp tl-btn" aria-pressed={tab === 'deals'} onClick={() => setTab(t => (t === 'deals' ? 'positions' : 'deals'))} data-testid="tab-deals" aria-label={tab === 'deals' ? 'Show positions' : 'Show raw deals'}>
                  <Rows size={15} /><span>{tab === 'deals' ? 'Positions' : 'Raw deals'}</span>
                </button>
                <button type="button" className="d2-fp tl-btn" onClick={() => void exportAll()} disabled={busy || (tab === 'positions' ? !data.counts.matching : !deals.list?.length)} data-testid="export-csv" aria-label="Export CSV">
                  <DownloadSimple size={15} /><span>Export</span>
                </button>
              </div>
            </div>

            {tab === 'deals' ? (
              <section className="d2-card tl-deals">
                <DealsTable deals={deals.list ?? []} loading={!deals.list} error={deals.error || undefined} limit={2000} />
              </section>
            ) : (
              <>
                <FilterChips data={data} f={filters} set={setF} date={dateCtl} onClear={filtersOn || span !== 'ALL' ? () => { clearAll(); setSpan('ALL'); } : null} />

                {data.counts.matching === 0 ? (
                  <section className="d2-card d2-connect" data-testid="no-match">
                    <h2>No trades match</h2>
                    <p>{data.counts.inWindow ? `${data.counts.inWindow} trades in ${rangeLabel.toLowerCase()}, none match these filters.` : `Nothing closed in ${rangeLabel.toLowerCase()}. ${data.counts.all} positions in total.`}</p>
                    <div className="d2-row">
                      {filtersOn && <button type="button" className="x-btn" onClick={clearAll}>Clear filters</button>}
                      {span !== 'ALL' && <button type="button" className="x-btn" onClick={() => setSpan('ALL')}>Show all time</button>}
                    </div>
                  </section>
                ) : (
                  <div className={`tl-body${loading ? ' d2-stale' : ''}`} aria-busy={loading}>
                    {data.summary && <SummaryRibbon s={data.summary} useR={data.useR} graded={data.graded} />}
                    {data.strip.days.length > 1 && (
                      <DailyStrip days={data.strip.days} ai={data.strip.ai} filtered={filtersOn}
                        onDay={d => setSpan({ from: d, to: d })} onRule={(r: TlRuleKey) => setF({ rule: r })} />
                    )}
                    {data.counts.allClosed > 0 && !data.graded && (
                      <p className="d2-few" data-testid="few-trades">{data.counts.allClosed} closed trade{data.counts.allClosed === 1 ? '' : 's'}. AI grades and rule checks start at {data.minTrades}.</p>
                    )}
                    <div className={`tl-main${panel && panelMode === 'inline' ? ' with-panel' : ''}`}>
                      <section className={`tl-list${phone ? ' bare' : ' d2-card'}`} aria-label="Trades">
                        {bulkBar}
                        {phone
                          ? <LogCards rows={rows} days={days} grouped={grouped} accountId={selected!.id} activeId={panel?.kind === 'trade' ? panel.row.id : null} today={today} onOpen={openRow} />
                          : <LogTable rows={rows} days={days} grouped={grouped} useR={data.useR} graded={data.graded} accountId={selected!.id} selected={selectedIds}
                            activeId={panel?.kind === 'trade' ? panel.row.id : null} sort={sort} dir={dir} today={today} onSort={onSort} onToggle={toggle} onToggleAll={toggleAll} onOpen={openRow} />}
                        <div ref={sentinel} className="tl-foot" data-testid="showing-count">
                          <span>Showing <b className="d2-n">{rows.length.toLocaleString('en-US')}</b> of {data.counts.matching.toLocaleString('en-US')}</span>
                          {hasMore && <button type="button" className="tl-link" onClick={() => void loadMore()} disabled={loadingMore} data-testid="load-more">{loadingMore ? 'Loading…' : 'Load more'}</button>}
                        </div>
                      </section>
                      {panelMode === 'inline' && panelEl}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {panelMode === 'drawer' && panelEl && typeof document !== 'undefined' && createPortal(
        <div className="v6 tl-drawer" data-testid="panel-drawer">
          <button type="button" className="tl-drawer-bg" aria-label="Close panel" onClick={closePanel} tabIndex={-1} />
          <div className="d2 tl2 tl-drawer-in">{panelEl}</div>
        </div>,
        document.body,
      )}
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}

function Skeleton() {
  return (
    <div className="d2-skel" aria-busy aria-label="Loading trades" data-testid="trades-loading">
      <div className="d2-card d2-sk" style={{ height: 40 }} />
      <div className="d2-card d2-sk" style={{ height: 88 }} />
      <div className="d2-card d2-sk" style={{ height: 100 }} />
      <div className="d2-card d2-sk" style={{ height: 420 }} />
    </div>
  );
}

