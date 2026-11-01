'use client';

// My strategies (F20) and the AI generator (F21).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad } from '@/components/v6/copy/parts';
import SymbolSearch from '@/components/charts/symbol-search';
import { ApiError } from '@/lib/copy-api';
import { INTERVALS, pct, strategiesApi, tone, type Interval, type StrategyRow } from '@/lib/strategies-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';

type Filter = 'all' | 'live' | 'paused' | 'draft' | 'ai' | 'archived';
type Sort = 'updated' | 'name' | 'return';
const FILTERS: Array<[Filter, string]> = [['all', 'All'], ['live', 'Live'], ['paused', 'Paused'], ['draft', 'Draft'], ['ai', 'AI'], ['archived', 'Archived']];
const STATUS: Record<string, string> = { draft: 'Draft', paper: 'Paper', live: 'Live', paused: 'Paused', archived: 'Archived' };

export default function StrategiesPage() {
  const router = useRouter();
  const toast = useToast();
  const list = useLoad(() => strategiesApi.list(), []);
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
    <AppShell legacy={false} pageTitle="Strategies" pageSubtitle="Build, backtest and run rule-based strategies"
      actions={<>
        <button className="x-btn" onClick={() => setAiOpen(true)} data-testid="st-ai">Generate with AI</button>
        <button className="x-btn x-btn--hi" onClick={() => void createBlank()} disabled={creating} data-testid="st-new">{creating ? 'Creating…' : 'New strategy'}</button>
      </>}>
      <div className="x-page" data-testid="st-page">
        <section className="st-strip" aria-label="Summary" data-testid="st-strip">
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Strategies</div><div className="ov-kpi-v"><b className="m">{stats.total}</b></div><div className="ov-kpi-s">{stats.ai} made with AI</div></div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Running</div><div className="ov-kpi-v"><b className="m">{stats.live}</b> live · <b className="m">{stats.paper}</b> paper</div><div className="ov-kpi-s">Closed P&amp;L (30d) <span className="m">—</span> until a deployment closes a trade</div></div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Best backtest</div>{stats.best ? <><div className="ov-kpi-v"><b className={`m ${tone(stats.best.lastBacktest!.metrics.totalReturnPct)}`}>{pct(stats.best.lastBacktest!.metrics.totalReturnPct)}</b></div><div className="ov-kpi-s">{stats.best.name}</div></> : <div className="x-muted">No runs yet</div>}</div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Worst backtest</div>{stats.worst ? <><div className="ov-kpi-v"><b className={`m ${tone(stats.worst.lastBacktest!.metrics.totalReturnPct)}`}>{pct(stats.worst.lastBacktest!.metrics.totalReturnPct)}</b></div><div className="ov-kpi-s">{stats.worst.name}</div></> : <div className="x-muted">No runs yet</div>}</div>
        </section>
        <div className="st-bar">
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Filter">{FILTERS.map(([f, l]) => <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} data-testid={`st-f-${f}`}>{l}</button>)}</div>
          <select className="x-select st-sort" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" data-testid="st-sort"><option value="updated">Recently edited</option><option value="name">Name</option><option value="return">Backtest return</option></select>
        </div>
        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="x-skel cp-skel-table" /> : !rows.length ? (
          <div className="x-card x-empty" data-testid="st-empty"><b>{filter === 'all' ? 'No strategies yet' : 'Nothing here'}</b><p>{filter === 'all' ? 'Start from a blank strategy or describe an idea and let AI draft it. Every strategy can be backtested before it trades.' : 'Try another filter.'}</p></div>
        ) : (
          <div className="st-grid" data-testid="st-list">
            {rows.map(r => (
              <Link key={r.id} href={`/strategies/${r.id}`} className="x-card st-card" data-testid={`st-card-${r.id}`}>
                <div className="st-card-h"><b>{r.name}</b><span className={`x-tag ${r.status === 'live' ? 'x-tag--g' : ''}`}>{STATUS[r.status] ?? r.status}</span>{r.source === 'ai' && <span className="x-tag">AI</span>}{r.source === 'legacy' && <span className="x-tag">SignalX</span>}</div>
                <div className="st-card-s x-muted">{r.symbols.slice(0, 3).join(', ')}{r.symbols.length > 3 ? ` +${r.symbols.length - 3}` : ''} · {r.interval} · {r.direction === 'both' ? 'long & short' : r.direction}</div>
                {r.blockers > 0 && <div className="st-card-warn neg">{r.blockers} issue{r.blockers === 1 ? '' : 's'} to fix</div>}
                {r.lastBacktest ? (
                  <div className="st-card-m">
                    <span><span className="x-muted">Return</span><b className={`m ${tone(r.lastBacktest.metrics.totalReturnPct)}`}>{pct(r.lastBacktest.metrics.totalReturnPct)}</b></span>
                    <span><span className="x-muted">Max DD</span><b className="m neg">{pct(r.lastBacktest.metrics.maxDrawdownPct)}</b></span>
                    <span><span className="x-muted">Trades</span><b className="m">{r.lastBacktest.metrics.trades}</b></span>
                    <span><span className="x-muted">Win</span><b className="m">{r.lastBacktest.metrics.winRatePct == null ? '—' : `${r.lastBacktest.metrics.winRatePct.toFixed(0)}%`}</b></span>
                  </div>
                ) : <div className="st-card-m x-muted">Not backtested yet</div>}
                <div className="st-card-f x-muted">v{r.version} · edited {new Date(r.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
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
