'use client';

// My strategies (F20) and the AI generator (F21).
import { ArrowRight } from '@phosphor-icons/react';
import EmptyState from '@/components/v6/ui/empty-state';
import Link from '@/components/v6/ui/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import SymbolSearch from '@/components/charts/symbol-search';
import { ApiError } from '@/lib/copy-api';
import { INTERVALS, deploymentsApi, pct, strategiesApi, tone, usd, type Interval, type StrategyRow } from '@/lib/strategies-api';
import { Kpi, Split } from '@/components/v6/ui/lux';
import CoinMark from '@/components/v6/ui/coin-mark';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/strategy.css';
import '@/styles/v6/markets.css';

type Filter = 'all' | 'live' | 'paused' | 'draft' | 'ai' | 'archived';
type Sort = 'updated' | 'name' | 'return';
const FILTERS: Array<[Filter, string]> = [['all', 'All'], ['live', 'Live'], ['paused', 'Paused'], ['draft', 'Draft'], ['ai', 'AI'], ['archived', 'Archived']];
const STATUS: Record<string, string> = { draft: 'Draft', paper: 'Paper', live: 'Live', paused: 'Paused', archived: 'Archived' };

export default function StrategiesPage() {
  const router = useRouter();
  const toast = useToast();
  const list = useLoad(() => strategiesApi.list(), []);
  const deps = useLoad(() => deploymentsApi.list(), []);
  const pnl = useMemo(() => {
    const ds = deps.data ?? [];
    return { closed: ds.reduce((a, d) => a + d.closedPnl, 0), open: ds.reduce((a, d) => a + d.openPnl, 0), any: ds.length > 0 };
  }, [deps.data]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const f = all.filter(r => filter === 'all' ? r.status !== 'archived' : filter === 'ai' ? r.source === 'ai' && r.status !== 'archived' : r.status === filter);
    const ret = (r: StrategyRow) => r.lastBacktest?.metrics.totalReturnPct ?? -Infinity;
    return [...f].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'return' ? ret(b) - ret(a) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [list.data, filter, sort]);
  const stats = useMemo(() => {
    const all = (list.data ?? []).filter(r => r.status !== 'archived');
    const tested = all.filter(r => r.lastBacktest);
    const best = tested.reduce<StrategyRow | null>((m, r) => (!m || r.lastBacktest!.metrics.totalReturnPct > m.lastBacktest!.metrics.totalReturnPct ? r : m), null);
    const worst = tested.reduce<StrategyRow | null>((m, r) => (!m || r.lastBacktest!.metrics.totalReturnPct < m.lastBacktest!.metrics.totalReturnPct ? r : m), null);
    return { total: all.length, live: all.filter(r => r.status === 'live').length, paper: all.filter(r => r.status === 'paper').length, ai: all.filter(r => r.source === 'ai').length, best, worst };
  }, [list.data]);

  async function createBlank() {
    setCreating(true);
    try {
      const s = await strategiesApi.create({ name: 'New strategy' });
      router.push(`/strategies/${s.id}`);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not create'); setCreating(false); }
  }

  return (
    <AppShell legacy={false} pageTitle="Strategies" pageSubtitle="Build, test and run your rules"
      actions={<>
        <Link className="x-btn" href="/strategies/deployments" data-testid="st-deployments">Deployments</Link>
        <Link className="x-btn" href="/strategies/reports">Reports</Link>
        <button className="x-btn" onClick={() => setAiOpen(true)} data-testid="st-ai">Generate with AI</button>
        <button className="x-btn x-btn--hi" onClick={() => void createBlank()} disabled={creating} data-testid="st-new">{creating ? 'Creating…' : 'New strategy'}</button>
      </>}>
      <div className="x-page" data-testid="st-page">
        {(list.data?.length ?? 0) > 0 && <section className="lx-kpis" aria-label="Summary" data-testid="st-strip">
          <Kpi label="Strategies" value={<span className="m">{stats.total}</span>} sub={`${stats.ai} made with AI`} />
          <Kpi label="Running" value={<><span className="m">{stats.live}</span><small>live</small> <span className="m">{stats.paper}</span><small>paper</small></>}
            sub={pnl.any ? <>Closed P&amp;L <span className={`m ${tone(pnl.closed)}`}>{usd(pnl.closed)}</span> · open <span className={`m ${tone(pnl.open)}`}>{usd(pnl.open)}</span></> : <>No runs yet</>}
            viz={stats.live + stats.paper > 0 ? <Split g={stats.live} n={stats.paper} r={0} /> : undefined} />
          <Kpi label="Best backtest" value={stats.best ? <span className={`m ${tone(stats.best.lastBacktest!.metrics.totalReturnPct)}`}>{pct(stats.best.lastBacktest!.metrics.totalReturnPct)}</span> : <span className="x-muted">—</span>} sub={stats.best ? stats.best.name : 'No runs yet'} />
          <Kpi label="Worst backtest" value={stats.worst ? <span className={`m ${tone(stats.worst.lastBacktest!.metrics.totalReturnPct)}`}>{pct(stats.worst.lastBacktest!.metrics.totalReturnPct)}</span> : <span className="x-muted">—</span>} sub={stats.worst ? stats.worst.name : 'No runs yet'} />
        </section>}
        <div className="st-bar">
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Filter">{FILTERS.map(([f, l]) => <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} data-testid={`st-f-${f}`}>{l}</button>)}</div>
          <select className="x-select st-sort" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" data-testid="st-sort"><option value="updated">Recently edited</option><option value="name">Name</option><option value="return">Backtest return</option></select>
        </div>
        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="x-skel cp-skel-table" /> : !rows.length ? (
          <div className="x-card">{filter === 'all' ? (
            <EmptyState icon="play" ghost="cards" testId="st-empty" title="Build your first strategy"
              hints={['1 · Set entry and exit rules', '2 · Backtest on real candles', '3 · Run it on paper']}
              actions={<><button className="x-btn x-btn--hi" onClick={() => void createBlank()} disabled={creating}>{creating ? 'Creating…' : 'New strategy'}</button><button className="x-btn" onClick={() => setAiOpen(true)}>Describe it to AI</button><Link className="x-btn" href="/marketplace">Browse the marketplace</Link></>}>
              Turn a trading idea into rules, see how it would have done, then let it run on paper before any real money.
            </EmptyState>
          ) : (
            <EmptyState icon="play" tone="warn" testId="st-empty" title={`No ${FILTERS.find(f => f[0] === filter)![1].toLowerCase()} strategies`}
              actions={<button className="x-btn" onClick={() => setFilter('all')}>Show all strategies</button>}>
              {filter === 'live' ? 'Open a strategy and run it live once its paper results look right.' : filter === 'ai' ? 'Strategies drafted with “Generate with AI” show up here.' : filter === 'archived' ? 'Archived strategies are kept here, out of the way.' : 'Nothing has this status right now.'}
            </EmptyState>
          )}</div>
        ) : (
          <div className="st-grid" data-testid="st-list">
            {rows.map(r => (
              <Link key={r.id} href={`/strategies/${r.id}`} className={`x-card st-card st-${r.status}`} data-testid={`st-card-${r.id}`}>
                <div className="st-card-h">
                  <span className="st-coins" aria-hidden>{r.symbols.slice(0, 3).map(sym => <CoinMark key={sym} symbol={sym} />)}</span>
                  <span className={`st-status st-status--${r.status}`}>{STATUS[r.status] ?? r.status}</span>
                </div>
                <div className="st-card-t">
                  <b>{r.name}</b>
                  <div className="st-card-s">
                    <span className="x-tag">{r.interval}</span>
                    <span className="x-tag">{r.direction === 'both' ? 'Long & short' : r.direction === 'long' ? 'Long' : 'Short'}</span>
                    {r.source === 'ai' && <span className="x-tag x-tag--g">AI</span>}
                    {r.source === 'legacy' && <span className="x-tag">SignalX</span>}
                    <span className="x-muted st-syms">{r.symbols.slice(0, 2).join(', ')}{r.symbols.length > 2 ? ` +${r.symbols.length - 2}` : ''}</span>
                  </div>
                </div>
                {r.blockers > 0 && <div className="st-card-warn neg">{r.blockers} issue{r.blockers === 1 ? '' : 's'} to fix</div>}
                {r.lastBacktest ? (
                  <div className="st-card-m">
                    <span className="st-ret"><span className="x-muted">Backtest return</span><b className={`m ${tone(r.lastBacktest.metrics.totalReturnPct)}`}>{pct(r.lastBacktest.metrics.totalReturnPct)}</b></span>
                    <span><span className="x-muted">Max DD</span><b className="m neg">{pct(r.lastBacktest.metrics.maxDrawdownPct)}</b></span>
                    <span><span className="x-muted">Trades</span><b className="m">{r.lastBacktest.metrics.trades}</b></span>
                    <span><span className="x-muted">Win</span><b className="m">{r.lastBacktest.metrics.winRatePct == null ? '—' : `${r.lastBacktest.metrics.winRatePct.toFixed(0)}%`}</b></span>
                  </div>
                ) : <div className="st-card-none">Not backtested yet <ArrowRight size={15} aria-hidden /></div>}
                <div className="st-card-f x-muted"><span>v{r.version} · edited {new Date(r.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span className="st-open" aria-hidden>Open <ArrowRight size={13} weight="bold" /></span></div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {aiOpen && <GenerateDialog onClose={() => setAiOpen(false)} onCreated={id => router.push(`/strategies/${id}`)} />}
    </AppShell>
  );
}

function GenerateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIv] = useState<Interval>('1h');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try { onCreated((await strategiesApi.generate({ prompt: prompt.trim(), symbol, interval })).id); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not generate'); setBusy(false); }
  }
  return (
    <Modal title="Generate a strategy with AI" sub="Describe the idea in plain words. Claude drafts the rules; you review, backtest and edit them before anything trades." onClose={onClose} busy={busy} wide testId="st-ai-dialog"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void go()} disabled={busy || prompt.trim().length < 10} data-testid="st-ai-go">{busy ? 'Drafting…' : 'Draft strategy'}</button></>}>
      <div className="x-field"><label htmlFor="st-ai-p">Idea</label><textarea id="st-ai-p" className="x-textarea" rows={4} maxLength={1000} placeholder="e.g. Buy when RSI crosses back above 30 while price is above the 200 EMA; stop 2× ATR, take profit at 2R; skip weekends." value={prompt} onChange={e => setPrompt(e.target.value)} data-testid="st-ai-prompt" /></div>
      <div className="ia-grid">
        <div className="x-field"><label>Market</label><SymbolSearch value={symbol} onSelect={setSymbol} /></div>
        <div className="x-field"><label>Interval</label><div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Interval">{INTERVALS.map(i => <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setIv(i)}>{i}</button>)}</div></div>
      </div>
      {err && <p className="cp-err" data-testid="st-ai-error">{err}</p>}
    </Modal>
  );
}
