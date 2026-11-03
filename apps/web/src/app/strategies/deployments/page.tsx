'use client';

// Deployments (F17): every paper and live run, with P&L, a sparkline, recent
// trades and the size multiplier.
import Link from '@/components/v6/ui/link';
import { Fragment, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ago, useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import { ApiError } from '@/lib/copy-api';
import { STATUS_TEXT, deploymentsApi, tone, usd, type DeploymentRow } from '@/lib/strategies-api';
import { Kpi, Spark } from '@/components/v6/ui/lux';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/strategy.css';
import '@/styles/v6/markets.css';

type Tab = 'all' | 'live' | 'paper' | 'paused' | 'errored' | 'stopped' | 'archived';
const TABS: Array<[Tab, string]> = [['all', 'All'], ['live', 'Live'], ['paper', 'Paper'], ['paused', 'Paused'], ['errored', 'Needs attention'], ['stopped', 'Stopped'], ['archived', 'Archived']];

export default function DeploymentsPage() {
  const toast = useToast();
  const list = useLoad(() => deploymentsApi.list(), []);
  usePoll(() => void list.reload(), 30_000);
  const [tab, setTab] = useState<Tab>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter(d =>
    tab === 'all' ? d.status !== 'archived'
      : tab === 'live' ? d.mode === 'live' && d.status !== 'archived'
      : tab === 'paper' ? d.mode === 'paper' && d.status !== 'archived'
      : tab === 'stopped' ? d.status === 'stopped' || d.status === 'stopping'
      : d.status === tab), [list.data, tab]);
  const count = (t: Tab) => (list.data ?? []).filter(d => (t === 'live' || t === 'paper' ? d.mode === t && d.status !== 'archived' : t === 'stopped' ? d.status === 'stopped' || d.status === 'stopping' : t === 'all' ? d.status !== 'archived' : d.status === t)).length;
  const totals = useMemo(() => {
    const ds = (list.data ?? []).filter(d => d.status !== 'archived');
    return { running: ds.filter(d => d.status === 'running').length, live: ds.filter(d => d.status === 'running' && d.mode === 'live').length, attention: ds.filter(d => d.status === 'errored').length,
      closed: ds.reduce((a, d) => a + d.closedPnl, 0), open: ds.reduce((a, d) => a + (d.open.length ? d.openPnl : 0), 0), trades: ds.reduce((a, d) => a + d.tradeCount, 0), n: ds.length };
  }, [list.data]);
  async function size(d: DeploymentRow, v: string) {
    const m = Number(v);
    if (!(m > 0 && m <= 10) || m === d.multiplier) return;
    try { await deploymentsApi.size(d.id, m); toast.success(`Size ${m}× for new trades`); void list.reload(); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not change size'); }
  }
  return (
    <AppShell legacy={false} pageTitle="Deployments" pageSubtitle="Strategies running on paper and live"
      actions={<><Link className="x-btn" href="/strategies/reports">Reports</Link><Link className="x-btn" href="/strategies">Strategies</Link></>}>
      <div className="x-page" data-testid="dpl-page">
        {list.data && list.data.length > 0 && (
          <section className="lx-kpis" aria-label="Summary" data-testid="dpl-kpis">
            <Kpi label="Running now" value={<span className="m">{totals.running}<small>of {totals.n}</small></span>} sub={totals.attention ? <span className="neg">{totals.attention} need attention</span> : `${totals.live} live · ${totals.running - totals.live} paper`} />
            <Kpi label="Closed P&L" value={<span className={`m ${tone(totals.closed)}`}>{usd(totals.closed)}</span>} sub="Every run, after fees" />
            <Kpi label="Open P&L" value={<span className={`m ${tone(totals.open)}`}>{usd(totals.open)}</span>} sub="Positions still open" />
            <Kpi label="Trades" value={<span className="m">{totals.trades}</span>} sub="Closed across all runs" />
          </section>
        )}
        <div className="x-seg x-seg--in x-seg--sm dpl-tabs" role="tablist" aria-label="Filter">
          {TABS.map(([t, l]) => <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)} data-testid={`dpl-tab-${t}`}>{l}{list.data ? <span className="x-muted"> {count(t)}</span> : null}</button>)}
        </div>
        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="x-skel cp-skel-table" /> : !rows.length ? (
          <div className="x-card x-empty" data-testid="dpl-empty"><b>{tab === 'all' ? 'Nothing running yet' : 'Nothing here'}</b><p>{tab === 'all' ? 'Open a strategy and press Run to start it on paper or live.' : 'Try another tab.'}</p></div>
        ) : (
          <section className="x-card" aria-label="Deployments">
            <div className="x-tblwrap">
              <table className="x-tbl trd-tbl sc-tbl dpl-tbl" data-testid="dpl-table">
                <thead><tr><th>Strategy</th><th>Mode</th><th>Status</th><th>Equity</th><th className="r">Closed P&amp;L</th><th className="r">Open P&amp;L</th><th className="r">Trades</th><th>Last check</th><th className="r">Size</th><th /></tr></thead>
                <tbody>
                  {rows.map(d => (
                    <Fragment key={d.id}>
                      <tr data-testid={`dpl-row-${d.id}`}>
                        <td><Link className="dpl-name" href={`/strategies/deployments/${d.id}`}><b>{d.name}</b><span className="x-muted"> v{d.version}</span></Link></td>
                        <td data-label="Mode"><span className={`x-tag ${d.mode === 'live' ? 'x-tag--r' : ''}`}>{d.mode === 'live' ? 'Live' : 'Paper'}</span></td>
                        <td data-label="Status"><span className={`st-status dpl-st--${d.status}`}>{STATUS_TEXT[d.status]}</span>{d.killed && <span className="x-tag x-tag--r">Streak stop</span>}</td>
                        <td data-label="Equity">{d.spark.length > 2 ? <span className="dpl-spark" role="img" aria-label="Equity curve"><Spark values={d.spark} /></span> : <span className="x-muted">—</span>}</td>
                        <td className={`r m ${tone(d.closedPnl)}`} data-label="Closed P&L">{usd(d.closedPnl)}</td>
                        <td className={`r m ${tone(d.openPnl)}`} data-label="Open P&L">{d.open.length ? usd(d.openPnl) : '—'}</td>
                        <td className="r m" data-label="Trades">{d.tradeCount}</td>
                        <td data-label="Last check">{d.lastEvaluatedAt ? ago(d.lastEvaluatedAt) : <span className="x-muted">Waiting for a bar close</span>}</td>
                        <td className="r" data-label="Size">{['running', 'paused'].includes(d.status) ? <input className="x-input m dpl-size" type="number" min={0.01} max={10} step={0.1} defaultValue={d.multiplier} onBlur={e => void size(d, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Size multiplier" data-testid={`dpl-size-${d.id}`} /> : <span className="m">{d.multiplier}×</span>}</td>
                        <td className="trd-acts"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>{open === d.id ? 'Hide' : 'Trades'}</button></td>
                      </tr>
                      {open === d.id && (
                        <tr className="dpl-inline"><td colSpan={10}>
                          {d.error && <p className="cp-err">{d.error}</p>}
                          {!d.recentTrades?.length ? <p className="x-muted">No closed trades yet.</p> : (
                            <ul className="dpl-trades">{d.recentTrades.map((t, k) => <li key={k}><b>{t.symbol}</b> {t.side} · {new Date(t.exitTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · <span className={`m ${tone(t.pnl)}`}>{usd(t.pnl)}</span> <span className="x-muted">({t.reason})</span></li>)}</ul>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
