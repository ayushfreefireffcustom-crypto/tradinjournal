'use client';

// Dashboard v2 ("D · AI" pro grid): KPI ribbon and a widget grid where the AI
// shows up as marks on the charts plus one short line per widget. Every number
// comes from GET /api/insights/dashboard (computed server-side from the
// account's closed trades, cached ~60s); account, date range and filters drive
// all of it. "Ask your journal" answers chart-first and falls back to the coach.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CaretDown, Funnel, PencilSimple, Plus } from '@phosphor-icons/react';
import { api, type BrokerAccount } from '@/lib/api';
import { isCustom, spanBounds, type RangeKey, type Span } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import { rangeText } from '@/lib/date-presets';
import { dashV2, type DashboardV2DTO, type DashParams, type DashRange, type DashSession } from '@/lib/dashboard-v2-api';
import { firstParagraph, money, nextSession, pct, plural, SESSION_SHORT } from '@/lib/dashboard-v2-format';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import { IPlus } from '@/components/v6/icons';
import StrategiesCard from '@/components/v6/strategy/strategies-card';
import DateRangePicker from '@/components/v6/ui/date-range';
import { AiFoot, Empty, Toggle, Widget } from '@/components/dashboard-v2/ui';
import { DistChart, EquityChart, HourBars, MaeScatter, RollingChart } from '@/components/dashboard-v2/charts';
import { BeforeYouTrade, BehaviourBars, Heatmap, KpiRibbon, LeaksList, PlanList, RecentTable, SymbolsTable } from '@/components/dashboard-v2/widgets';
import { AskBox, type AskState } from '@/components/dashboard-v2/ask';
import { LayoutEditor, useDashLayouts, type EditTarget } from '@/components/dashboard-v2/layout-editor';
import { BUILTIN_TABS, fillAlone, MAX_TABS, newLayoutId, newLayoutName, packRows, type LayoutTab, type Slot, type WId } from '@/lib/dash-layouts';
import '@/components/dashboard-v2/dashboard-v2.css';

const RANGES: { key: RangeKey; api: DashRange; short: string; label: string }[] = [
  { key: '1W', api: '7D', short: '7D', label: 'Last 7 days' },
  { key: '1M', api: '30D', short: '30D', label: 'Last 30 days' },
  { key: '3M', api: '90D', short: '90D', label: 'Last 90 days' },
  { key: '1Y', api: '1Y', short: '1Y', label: 'Last 12 months' },
  { key: 'ALL', api: 'ALL', short: 'All', label: 'All time' },
];
interface Filters { symbol?: string; session?: DashSession; side?: 'LONG' | 'SHORT'; tag?: string }
const AI_KEY = 'tl-dash-ai-notes';

function useMedia(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => { const mq = window.matchMedia(q); const set = () => setM(mq.matches); set(); mq.addEventListener('change', set); return () => mq.removeEventListener('change', set); }, [q]);
  return m;
}

export default function DashboardPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const { data: session } = authClient.useSession();
  const toast = useToast();
  const [span, setSpan] = useState<Span>('3M');
  const [filters, setFilters] = useState<Filters>({});
  const [ai, setAi] = useState(true);
  const [data, setData] = useState<DashboardV2DTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [eqMode, setEqMode] = useState<'trades' | 'days'>('trades');
  const [eqUnit, setEqUnit] = useState<'$' | '%'>('$');
  const [heatMetric, setHeatMetric] = useState<'$' | 'win'>('$');
  const [ask, setAsk] = useState<AskState>({ status: 'idle' });
  const [, tick] = useState(0);
  // Where the ask box lives: top bar on very wide screens, the toolbar on laptops, the top of the page on phones and tablets.
  const wide = useMedia('(min-width: 1600px)');
  const mid = useMedia('(min-width: 1100px)');
  const req = useRef(0);
  const askReq = useRef<AbortController | null>(null);

  // Remembered on this device: AI notes on/off (the layout tab lives in useDashLayouts).
  useEffect(() => {
    try { if (localStorage.getItem(AI_KEY) === '0') setAi(false); } catch { /* storage unavailable */ }
  }, []);
  const toggleAi = () => setAi(v => { try { localStorage.setItem(AI_KEY, v ? '0' : '1'); } catch { /* ignore */ } return !v; });

  // ── layouts: tabs, Edit layout, + New layout ──
  const lay = useDashLayouts();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draftSlots, setDraftSlots] = useState<Slot[] | null>(null);
  const [draftName, setDraftName] = useState('');
  const [layBusy, setLayBusy] = useState(false);
  const [layNote, setLayNote] = useState('');
  const shownTab: LayoutTab = editing?.isNew ? editing.tab : lay.active;
  const startEdit = () => { setLayNote(''); setEditing({ tab: lay.active, isNew: false }); };
  const startNew = () => {
    setLayNote('');
    setEditing({ tab: { id: newLayoutId(lay.tabs), name: newLayoutName(lay.tabs), slots: [...lay.active.slots], builtin: false }, isNew: true });
  };
  const stopEdit = () => { setEditing(null); setDraftSlots(null); };
  const storeTabs = async (next: LayoutTab[], activeId: string) => {
    setLayBusy(true);
    const r = await lay.saveTabs(next);
    setLayBusy(false);
    if (!r.ok) { setLayNote(r.error ?? 'Couldn’t save the layout'); return; }
    lay.setActive(activeId);
    stopEdit();
    toast.success(r.where === 'device' ? 'Layout saved on this device' : 'Layout saved');
  };
  const saveLayout = (t: LayoutTab) => {
    const next = editing?.isNew ? [...lay.tabs, t] : lay.tabs.map(x => (x.id === t.id ? t : x));
    void storeTabs(next, t.id);
  };
  const deleteLayout = (id: string) => { void storeTabs(lay.tabs.filter(x => x.id !== id), BUILTIN_TABS[0]!.id); };
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
      const d = await dashV2.get(p);
      if (id === req.current) setData(d);
    } catch (err) {
      if (id === req.current) setError(err instanceof Error ? err.message : 'Failed to load the dashboard');
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

  // ── Ask your journal ──
  const askCoach = useCallback(async (q: string, prompt: string, kind: 'explain' | 'ask') => {
    if (!selected) return;
    askReq.current?.abort();
    const ctl = new AbortController();
    askReq.current = ctl;
    const used = data?.counts.allClosed ?? 0;
    let text = '';
    setAsk({ status: 'text', q, text: '', used, done: false });
    try {
      await api.ai.chat({ accountId: selected.id, kind, messages: [{ role: 'user', content: prompt.slice(0, 3900) }] }, t => {
        text += t;
        if (!ctl.signal.aborted) setAsk({ status: 'text', q, text: firstParagraph(text), used, done: false });
      }, { signal: ctl.signal, onError: m => { if (!text) setAsk({ status: 'error', q, error: m }); } });
      if (!ctl.signal.aborted && text) setAsk({ status: 'text', q, text: firstParagraph(text), used, done: true });
      else if (!ctl.signal.aborted && !text) setAsk({ status: 'error', q, error: 'The coach had no answer. Try again.' });
    } catch (err) {
      if (!ctl.signal.aborted) setAsk({ status: 'error', q, error: err instanceof Error ? err.message : 'The coach is unavailable right now.' });
    }
  }, [selected, data?.counts.allClosed]);

  const onAsk = useCallback(async (q: string) => {
    if (!params) return;
    askReq.current?.abort();
    askReq.current = null;
    setAsk({ status: 'loading', q });
    try {
      const a = await dashV2.ask({ ...params, q });
      if (a.kind === 'chart') { setAsk({ status: 'chart', q, a }); return; }
      await askCoach(q, `${q}\n\nAnswer in one short paragraph.`, 'ask');
    } catch (err) {
      setAsk({ status: 'error', q, error: err instanceof Error ? err.message : 'Could not answer that.' });
    }
  }, [params, askCoach]);
  const closeAsk = useCallback(() => { askReq.current?.abort(); setAsk({ status: 'idle' }); }, []);
  const explain = (what: string, summary: string) => {
    const scope = `${rangeLabel.toLowerCase()}${filters.symbol ? `, ${filters.symbol}` : ''}${filters.session ? `, ${SESSION_SHORT[filters.session]} session` : ''}${filters.side ? `, ${filters.side.toLowerCase()}s` : ''}${filters.tag ? `, tag ${filters.tag}` : ''}`;
    void askCoach(`Explain: ${what}`, `Explain my ${what} chart (${scope}, ${data?.counts.trades ?? 0} trades): ${summary}. Answer in one short paragraph.`, 'explain');
    if (!mid) document.querySelector('[data-testid=ask-page]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const rangeLabel = isCustom(span) ? rangeText(span) : RANGES.find(o => o.key === span)!.label;
  const rangeShort = isCustom(span) ? 'Range' : RANGES.find(o => o.key === span)!.short;
  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'trader';
  const subtitle = selected
    ? <><i className="d2-live" aria-hidden />{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · {syncedAt ? `synced ${timeAgo(syncedAt)}` : loading ? 'loading…' : 'not synced yet'}</>
    : `Welcome, ${first}`;
  const askBox = (placement: 'top' | 'bar' | 'page') => <AskBox state={ask} onAsk={onAsk} onClose={closeAsk} placement={placement} />;
  const hasFilters = !!(filters.symbol || filters.session || filters.side || filters.tag);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Dashboard" pageSubtitle={subtitle} onSync={selected ? sync : undefined} syncing={syncing} syncedAt={syncedAt}
      actions={selected ? (
        <>
          {wide && data && data.counts.allClosed > 0 && askBox('top')}
          <div className="x-seg" role="group" aria-label="Date range" data-testid="range-selector">
            {RANGES.map(r => <button key={r.key} aria-pressed={span === r.key} onClick={() => setSpan(r.key)} title={r.label} data-testid={`range-${r.key}`}>{r.short}</button>)}
          </div>
          <DateRangePicker value={isCustom(span) ? span : null} onChange={setSpan} note="Days in your time zone" />
        </>
      ) : null}>
      <div className={`d2${ai ? '' : ' ai-off'}`} data-testid="dashboard-page">
        {error && (
          <div className="d2-banner" role="alert" data-testid="dashboard-error">
            <span>{error}</span>
            <button type="button" className="x-btn x-btn--sm" onClick={() => params && load(params)}>Retry</button>
          </div>
        )}

        {!selected && !accountsLoading ? (
          <section className="d2-card d2-connect" data-testid="dashboard-empty">
            <h2>Connect your MT5 account</h2>
            <p>Use your investor (read-only) password. TRADElogs can read your trades but can never place or close one.</p>
            <ul><li>History imports in about a minute</li><li>New trades sync on their own</li><li>Every chart here fills in from your real trades</li></ul>
            <button className="x-btn x-btn--hi x-btn--lg" onClick={() => setShowConnect(true)} data-testid="dashboard-connect"><IPlus size={15} />Connect MT5</button>
          </section>
        ) : !data ? (error ? null : <Skeleton />) : data.counts.allClosed === 0 ? (
          <section className="d2-card d2-connect" data-testid="dashboard-waiting">
            <h2>Waiting for your first closed trade</h2>
            <p>{selected?.broker} is connected. As soon as a position closes it shows up here, usually within a few minutes.</p>
          </section>
        ) : (
          <>
            {!mid && askBox('page')}
            <div className="d2-bar" data-testid="dash-toolbar">
              <div className="d2-lay-w">
                <div className="d2-lay" role="tablist" aria-label="Layout">
                  {lay.tabs.map(l => (
                    <button key={l.id} type="button" role="tab" aria-selected={shownTab.id === l.id} className={shownTab.id === l.id ? 'on' : ''} disabled={!!editing && editing.tab.id !== l.id}
                      onClick={() => lay.setActive(l.id)} data-testid={`layout-${l.id}`}>{l.name}</button>
                  ))}
                  {editing?.isNew && <button type="button" role="tab" aria-selected className="on" data-testid="layout-new-tab">{draftName.trim() || 'New layout'}</button>}
                </div>
                {!editing && (
                  <>
                    <button type="button" className="d2-fp d2-lay-b" onClick={startEdit} aria-label="Edit layout" title="Edit layout" data-testid="edit-layout"><PencilSimple size={14} /><span>Edit layout</span></button>
                    {lay.tabs.length < MAX_TABS && <button type="button" className="d2-fp d2-lay-b" onClick={startNew} aria-label="New layout" title="New layout" data-testid="new-layout"><Plus size={14} /><span>New</span></button>}
                  </>
                )}
              </div>
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

            {editing && (
              <LayoutEditor target={editing} tabs={lay.tabs} onPreview={setDraftSlots} onName={setDraftName} onSave={saveLayout} onCancel={stopEdit} onDelete={deleteLayout} busy={layBusy}
                note={layNote || (lay.where === 'device' ? 'Saved on this device until settings storage is ready' : '')} />
            )}
            {data.counts.trades === 0 || !data.kpis ? (
              <section className="d2-card d2-connect" data-testid="dashboard-no-trades">
                <h2>No closed trades in this view</h2>
                <p>{data.counts.inWindow ? `${plural(data.counts.inWindow, 'trade')} in ${rangeLabel.toLowerCase()}, none match the filters.` : `Nothing closed in ${rangeLabel.toLowerCase()}. ${plural(data.counts.allClosed, 'trade')} in total.`}</p>
                <div className="d2-row">
                  {hasFilters && <button type="button" className="x-btn" onClick={() => setFilters({})}>Clear filters</button>}
                  {span !== 'ALL' && <button type="button" className="x-btn" onClick={() => setSpan('ALL')}>Show all time</button>}
                </div>
              </section>
            ) : (
              <div className={`d2-body${loading ? ' d2-stale' : ''}`} aria-busy={loading}>
                <KpiRibbon k={data.kpis} trades={data.counts.trades} behaviour={data.behaviour} minTrades={data.minTrades} ai={ai} />
                {data.counts.trades < data.minTrades && (
                  <p className="d2-few" data-testid="few-trades">{plural(data.counts.trades, 'trade')} in this view. Behaviour score, grades and the plan need {data.minTrades}.</p>
                )}
                <div className="d2-grid">
                  {(() => {
                    const slots = (editing && draftSlots) || shownTab.slots;
                    const cells = packRows(slots);
                    const full = fillAlone(cells);
                    return cells.map((c, i) => <div key={c.id} className={`d2-slot d2-s${c.span}${full.has(c.id) ? ' d2-m12' : ''}`}>{block(c.id, slots[i]!.span)}</div>);
                  })()}
                </div>
              </div>
            )}
            <details className="d2-how">
              <summary>How these numbers are computed</summary>
              <ul>
                <li>Every figure comes from your closed trades in this account, range and filters. Times are UTC; a trade belongs to the hour, weekday and session it opened in.</li>
                <li>Sessions: Asia 22:00–07:00, London 07:00–13:00, New York 13:00–22:00 UTC.</li>
                <li>Leaks: groups of trades you could have skipped before entry (late hours, after 2 losses in a row that day, within 15 min of a loss, more than 1.5× your usual size on that symbol, worst symbol, session and weekday), ranked by net loss. Skipping two leaks counts each trade once.</li>
                <li>Behaviour score ({data.minTrades}+ trades): the average of three pass rates. Discipline: not after 2 losses that day and not within 15 min of a loss. Risk: no more than 1.5× usual size{data.counts.withR ? ' and no loss past −1.25R' : ''}. Timing: opened in an hour that is net positive for you.</li>
                <li>Grades count the same flags (plus losing hour{data.counts.withR ? ' and past −1.25R' : ''}): none A, one B, two C, three D, four or more F. They grade process, not the result.</li>
                <li>Your own rules (Settings › Trading rules) count as flags too, labelled “Your rule”: in grades, the behaviour score and the plan.</li>
                <li>R-multiples need a stop at entry, and MAE/MFE need the price path of each trade. Without them those widgets show $ or stay empty.</li>
              </ul>
            </details>
          </>
        )}
        <StrategiesCard />
      </div>
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );

  // Plain render function (not a component) so widgets keep their state across renders.
  function block(id: WId, s: 3 | 4 | 6 | 8 | 12) {
    const d = data!;
    const T = d.counts.trades;
    switch (id) {
      case 'equity': {
        const leak = d.leaks.rows[0] ?? null;
        return (
          <Widget id="equity" span={s} title={d.equity?.basis === 'pnl' ? 'Cumulative P&L' : 'Equity & drawdown'}
            sub={ai && d.equity?.dotLabel ? <span data-ai>· red dot = {d.equity.dotLabel.toLowerCase()}</span> : d.equity?.basis === 'pnl' ? <span title="Deposits and withdrawals aren't in this account's history, so this is profit and loss from 0, not the balance">· from $0</span> : null}
            tools={<>
              <Toggle label="Points" value={eqMode} onChange={setEqMode} options={[{ v: 'trades', label: 'Trades' }, { v: 'days', label: 'Days' }]} />
              <span className="d2-unit"><Toggle label="Unit" value={eqUnit} onChange={setEqUnit} options={[{ v: '$', label: '$' }, { v: '%', label: '%', disabled: !(d.equity && d.equity.basis === 'balance' && d.equity.start > 0) }]} /></span>
            </>}
            onExplain={d.equity ? () => explain(d.equity!.basis === 'pnl' ? 'cumulative P&L curve' : 'equity curve', `${d.equity!.basis === 'pnl' ? 'cumulative P&L from $0 (deposits and withdrawals not known)' : `start ${money(d.equity!.start, { plus: false })}, now ${money(d.kpis!.balance, { plus: false })}, deposits and withdrawals shown at their dates`}, net ${money(d.kpis!.netPnl)}, deepest dip ${d.equity!.drawdown ? `${d.equity!.drawdown.pct != null ? pct(d.equity!.drawdown.pct, 1) : money(-d.equity!.drawdown.amount)} over ${plural(d.equity!.drawdown.trades, 'trade')}` : 'none'}${leak ? `, worst leak ${leak.label} ${money(leak.net)} on ${leak.trades} trades` : ''}`) : undefined}
            foot={ai ? <AiFoot line={d.ai.equity} /> : null}>
            {d.equity ? <EquityChart eq={d.equity} mode={eqMode} unit={eqUnit} ai={ai} leakNet={leak?.net ?? null} /> : <Empty title="No equity yet" />}
          </Widget>
        );
      }
      case 'leaks':
        return (
          <Widget id="leaks" span={s} title="Leaks" sub="· ranked by $ lost"
            onExplain={d.leaks.rows.length ? () => explain('leaks', d.leaks.rows.map(r => `${r.label} ${money(r.net)} on ${r.trades} trades (${r.wins} won)`).join('; ')) : undefined}
            foot={ai ? <AiFoot line={d.leaks.ai} /> : null}>
            <LeaksList rows={d.leaks.rows} trades={T} />
          </Widget>
        );
      case 'heatmap':
        return (
          <Widget id="heatmap" span={s} title="Session × weekday" sub={`· ${heatMetric === '$' ? 'net P&L' : 'win rate'}, UTC`}
            tools={<Toggle label="Metric" value={heatMetric} onChange={setHeatMetric} options={[{ v: '$', label: '$' }, { v: 'win', label: 'Win%' }]} />}
            onExplain={d.heatmap ? () => explain('session by weekday heatmap', d.heatmap!.cells.filter(c => c.n).map(c => `${SESSION_SHORT[c.session]} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.day]} ${money(c.net)} ${c.wins}/${c.n}`).join('; ')) : undefined}
            foot={ai ? <AiFoot line={d.ai.heatmap} /> : null}>
            {d.heatmap ? <Heatmap hm={d.heatmap} metric={heatMetric} ai={ai} /> : <Empty title="No trades" />}
          </Widget>
        );
      case 'mae':
        return (
          <Widget id="mae" span={s} title="MAE / MFE" sub="· worst vs best point"
            onExplain={d.maeMfe ? () => explain('MAE/MFE scatter', `${d.maeMfe!.points.length} trades${d.maeMfe!.gaveBack ? `, ${d.maeMfe!.gaveBack.trades} losers were in profit first (${money(d.maeMfe!.gaveBack.net)})` : ''}`) : undefined}
            foot={ai ? <AiFoot line={d.ai.maeMfe} /> : null}>
            {d.maeMfe ? <MaeScatter mm={d.maeMfe} ai={ai} /> : <Empty title="No MAE / MFE data yet" note={`Needs the price path of each trade. ${d.counts.withMae} of ${plural(T, 'trade')} ${T === 1 ? 'has' : 'have'} it.`} />}
          </Widget>
        );
      case 'dist': {
        const dist = d.distribution;
        return (
          <Widget id="dist" span={s} title={dist?.unit === 'R' ? 'R-multiple distribution' : 'P&L distribution'} sub={`· ${plural(T, 'trade')}`} className={dist ? '' : 'd2-w-empty'}
            onExplain={dist ? () => explain('trade result distribution', `unit ${dist.unit}, mean ${dist.unit === 'R' ? `${dist.mean}R` : money(dist.mean)}${dist.tail ? `, ${dist.tail.trades} trades past ${dist.unit === 'R' ? '−1.25R' : money(dist.tail.threshold)} lost ${money(dist.tail.net)}` : ''}`) : undefined}
            foot={<>
              {dist && dist.unit === '$' && <div className="d2-note" data-testid="r-note">In $: R needs a stop at entry ({d.counts.withR} of {T} have one).</div>}
              {ai ? <AiFoot line={d.ai.distribution} /> : null}
            </>}>
            {dist ? <DistChart dist={dist} ai={ai} /> : <Empty title="Needs 5 trades" note={`${T} so far.`} />}
          </Widget>
        );
      }
      case 'rolling':
        return (
          <Widget id="rolling" span={s} title="Rolling expectancy" sub={d.rolling ? `· ${d.rolling.window} trades` : ''} className={d.rolling ? '' : 'd2-w-empty'}
            onExplain={d.rolling ? () => explain('rolling expectancy', `${d.rolling!.window}-trade average now ${d.rolling!.now} ${d.rolling!.unit}, low ${d.rolling!.low.v} ${d.rolling!.unit}`) : undefined}
            foot={ai ? <AiFoot line={d.ai.rolling} /> : null}>
            {d.rolling ? <RollingChart roll={d.rolling} ai={ai} /> : <Empty title="Needs 30 trades" note={`${T} so far.`} />}
          </Widget>
        );
      case 'behaviour':
        return (
          <Widget id="behaviour" span={s} title="Behaviour" sub="· score /100" className={d.behaviour ? '' : 'd2-w-empty'}
            onExplain={d.behaviour ? () => explain('behaviour score', `score ${d.behaviour!.score}, last 30 ${d.behaviour!.last30}; ${d.behaviour!.parts.map(p => `${p.label} ${p.score} (last 30: ${p.last30})`).join(', ')}`) : undefined}
            foot={ai ? <AiFoot line={d.ai.behaviour} /> : null}>
            {d.behaviour ? <BehaviourBars b={d.behaviour} /> : <Empty title={`Needs ${d.minTrades} trades`} note={`${T} so far. The score uses your own history as the baseline.`} />}
          </Widget>
        );
      case 'before':
        return (
          <BeforeYouTrade hours={d.hours} symbols={d.options.symbols.map(x => x.symbol).filter(x => !filters.symbol || x === filters.symbol)}>
            {({ cells, symbol, now, picker }) => {
              const c = cells.find(x => x.hour === now.h);
              const all = cells.reduce((a, x) => ({ n: a.n + x.n, wins: a.wins + x.wins }), { n: 0, wins: 0 });
              const wr = c && c.n ? c.wins / c.n : null;
              const line = !c ? { text: 'No trades at this hour', value: null, fmt: 'text' as const, tone: 'flat' as const, trades: 0 }
                : c.n < 3 ? { text: 'Few trades this hour:', value: c.n, fmt: 'int' as const, tone: 'flat' as const, trades: c.n }
                  : { text: wr! < 0.4 ? 'Wait ·' : wr! >= 0.55 ? 'Your hour ·' : 'Mixed ·', value: wr!, fmt: 'pct' as const, tone: (wr! < 0.4 ? 'dn' : wr! >= 0.55 ? 'up' : 'flat') as 'dn' | 'up' | 'flat', suffix: 'won now', trades: c.n };
              return (
                <Widget id="before" span={s} title="Before you trade" sub={symbol ? `· ${symbol} by hour` : ''} foot={ai ? <AiFoot line={line} /> : null}>
                  {symbol ? <>
                    {picker}
                    {cells.length ? <>
                      <div className="d2-hsum">All hours: <b>{pct(all.wins / all.n)} won</b> · {plural(all.n, 'trade')}</div>
                      <HourBars cells={cells} nowH={now.h} nowFrac={now.m / 60} ai={ai} />
                    </> : <Empty title="No trades on this side" />}
                  </> : <Empty title="No symbols" />}
                </Widget>
              );
            }}
          </BeforeYouTrade>
        );
      case 'plan':
        return (
          <Widget id="plan" span={s} title={`Plan · ${nextSession(Date.now())}`} className={d.plan.length ? '' : 'd2-w-empty'} foot={ai ? <AiFoot line={d.ai.plan} /> : null}
            onExplain={d.plan.length ? () => explain('next-session plan', d.plan.map(r => `${r.text}: ${r.fmt === 'money' ? money(r.value) : `${pct(r.value)} won`}`).join('; ')) : undefined}>
            {d.plan.length ? <PlanList rules={d.plan} /> : <Empty title={T < d.minTrades ? `Needs ${d.minTrades} trades` : 'No rules stand out yet'} note={T < d.minTrades ? `${T} so far.` : 'Nothing in your history is clearly worth a rule.'} />}
          </Widget>
        );
      case 'symbols':
        return (
          <Widget id="symbols" span={s} title="Symbols" sub="· sorted by net" flush
            onExplain={() => explain('symbols table', d.symbols.slice(0, 10).map(r => `${r.symbol} ${r.trades} trades ${pct(r.winRate)} won net ${money(r.net)}`).join('; '))}
            foot={ai ? <AiFoot line={d.ai.symbols} /> : null}>
            <SymbolsTable rows={d.symbols} rangeLabel={rangeShort} />
          </Widget>
        );
      case 'recent':
        return (
          <Widget id="recent" span={s} title="Recent trades" sub={ai && d.recent.some(r => r.grade) ? <span data-ai>· AI grade</span> : null} flush tools={<Link href="/trades" className="d2-wl">Trade log</Link>}
            foot={ai && d.recent.length ? <AiFoot line={d.recent.some(r => r.grade)
              ? { text: 'Graded on process, not result', value: null, fmt: 'text', tone: 'flat', trades: d.recent.length }
              : { text: `Grades start at ${d.minTrades} trades`, value: null, fmt: 'text', tone: 'flat', trades: d.counts.trades }} /> : null}>
            <RecentTable rows={d.recent} />
          </Widget>
        );
    }
  }
}

function FilterSel({ label, value, all, options, onChange, icon, disabled }: { label: string; value: string; all: string; options: Array<{ v: string; label: string }>; onChange: (v: string) => void; icon?: boolean; disabled?: boolean }) {
  const cur = options.find(o => o.v === value);
  return (
    <label className={`d2-fp d2-fsel${value ? ' set' : ''}${disabled ? ' off' : ''}`} data-testid={`filter-${label.toLowerCase()}`}>
      {icon && <Funnel size={14} aria-hidden />}
      <span>{label}</span> <b>{cur ? cur.label.replace(/ \(\d+\)$/, '') : all}</b><CaretDown size={11} aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={`${label} filter`} disabled={disabled}>
        <option value="">{label}: {all}</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Skeleton() {
  return (
    <div className="d2-skel" aria-busy aria-label="Loading dashboard" data-testid="dashboard-loading">
      <div className="d2-card d2-sk" style={{ height: 40 }} />
      <div className="d2-card d2-sk" style={{ height: 88 }} />
      <div className="d2-grid">
        <div className="d2-card d2-sk d2-s8" style={{ height: 320 }} />
        <div className="d2-card d2-sk d2-s4" style={{ height: 320 }} />
        <div className="d2-card d2-sk d2-s4" style={{ height: 300 }} />
        <div className="d2-card d2-sk d2-s4" style={{ height: 300 }} />
        <div className="d2-card d2-sk d2-s4" style={{ height: 300 }} />
      </div>
    </div>
  );
}
