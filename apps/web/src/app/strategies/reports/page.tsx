'use client';

// Strategy reports and P&L (F23), with the paper / live switch (F22): KPIs,
// equity and drawdown, the spread of trade results, and P&L by market and by
// strategy. "Save as PDF" prints a clean page.
import EmptyState from '@/components/v6/ui/empty-state';
import Link from '@/components/v6/ui/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import EquityChart from '@/components/v6/strategy/equity-chart';
import { deploymentsApi, num, pct, tone, usd, type Report } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/strategy.css';
import '@/styles/v6/markets.css';

const MODE_KEY = 'tradelogs.strategies.mode';
const RANGES: Array<[number | 'all', string]> = [[30, '30 days'], [90, '90 days'], [365, '1 year'], ['all', 'All time']];

function stats(r: Report) {
  const t = r.trades;
  const pnl = t.reduce((a, x) => a + x.pnl, 0);
  const wins = t.filter(x => x.pnl > 0);
  const losses = t.filter(x => x.pnl <= 0);
  const gw = wins.reduce((a, x) => a + x.pnl, 0);
  const gl = Math.abs(losses.reduce((a, x) => a + x.pnl, 0));
  const start = r.capital || 0;
  let eq = start;
  let peak = start;
  let dd = 0;
  const curve = [{ t: t.length ? Date.parse(t[0]!.entryTime) : Date.now(), equity: start }];
  for (const x of t) { eq += x.pnl; peak = Math.max(peak, eq); if (peak > 0) dd = Math.min(dd, (eq / peak - 1) * 100); curve.push({ t: Date.parse(x.exitTime), equity: eq }); }
  return {
    pnl, trades: t.length, winRate: t.length ? (wins.length / t.length) * 100 : null, pf: gl > 0 ? gw / gl : null,
    avg: t.length ? t.reduce((a, x) => a + x.pnlPct, 0) / t.length : null, best: t.length ? Math.max(...t.map(x => x.pnl)) : null, worst: t.length ? Math.min(...t.map(x => x.pnl)) : null,
    fees: t.reduce((a, x) => a + x.fees, 0), maxDd: dd, ret: start > 0 ? (pnl / start) * 100 : null, curve,
  };
}

function Bars({ rows, testId }: { rows: Array<{ label: string; value: number; sub?: string }>; testId: string }) {
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r.value)));
  return (
    <div className="rp-bars" data-testid={testId}>
      {rows.map(r => (
        <div key={r.label} className="rp-bar">
          <span className="rp-bar-l">{r.label}</span>
          <span className="rp-bar-t"><i className={r.value >= 0 ? 'g' : 'r'} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></span>
          <span className={`m ${tone(r.value)}`}>{usd(r.value)}</span>
          {r.sub && <span className="x-muted rp-bar-s">{r.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [days, setDays] = useState<number | 'all'>(90);
  useEffect(() => { try { const m = localStorage.getItem(MODE_KEY); if (m === 'paper' || m === 'live') setMode(m); } catch { /* ignore */ } }, []);
  const pick = (m: 'paper' | 'live') => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const r = useLoad(() => deploymentsApi.report(mode, days), [mode, days]);
  const s = useMemo(() => (r.data ? stats(r.data) : null), [r.data]);
  const dist = useMemo(() => {
    const t = r.data?.trades ?? [];
    const edges = [-Infinity, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, Infinity];
    const labels = ['< −5%', '−5 to −2', '−2 to −1', '−1 to −0.5', '−0.5 to 0', '0 to 0.5', '0.5 to 1', '1 to 2', '2 to 5', '> 5%'];
    // Under each bar only the bin's lower edge fits; the full range is in the tooltip.
    const short = ['< −5', '−5', '−2', '−1', '−0.5', '0', '0.5', '1', '2', '> 5'];
    return labels.map((label, k) => ({ label, short: short[k]!, n: t.filter(x => x.pnlPct >= edges[k]! && x.pnlPct < edges[k + 1]!).length, up: k >= 5 }));
  }, [r.data]);
  const bySymbol = useMemo(() => {
    const m = new Map<string, { pnl: number; n: number }>();
    for (const x of r.data?.trades ?? []) { const v = m.get(x.symbol) ?? { pnl: 0, n: 0 }; v.pnl += x.pnl; v.n += 1; m.set(x.symbol, v); }
    return [...m.entries()].sort((a, b) => b[1].pnl - a[1].pnl).map(([label, v]) => ({ label, value: v.pnl, sub: `${v.n} trade${v.n === 1 ? '' : 's'}` }));
  }, [r.data]);
  const byStrategy = useMemo(() => {
    const m = new Map<string, { pnl: number; n: number }>();
    for (const x of r.data?.trades ?? []) { const v = m.get(x.deployment) ?? { pnl: 0, n: 0 }; v.pnl += x.pnl; v.n += 1; m.set(x.deployment, v); }
    return [...m.entries()].sort((a, b) => b[1].pnl - a[1].pnl).map(([label, v]) => ({ label, value: v.pnl, sub: `${v.n} trade${v.n === 1 ? '' : 's'}` }));
  }, [r.data]);
  const maxN = Math.max(1, ...dist.map(d => d.n));

  return (
    <AppShell legacy={false} pageTitle="Strategy reports" pageSubtitle="Results from your strategy runs"
      actions={<button className="x-btn" onClick={() => window.print()} disabled={!s?.trades} data-testid="rp-pdf">Save as PDF</button>}>
      <div className="x-page rp-page" data-testid="rp-page">
        <div className="rp-bar-top">
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Paper or live">
            <button type="button" role="radio" aria-checked={mode === 'paper'} onClick={() => pick('paper')} data-testid="rp-paper">Paper</button>
            <button type="button" role="radio" aria-checked={mode === 'live'} onClick={() => pick('live')} data-testid="rp-live">Live</button>
          </div>
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Range">{RANGES.map(([d, l]) => <button key={String(d)} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} data-testid={`rp-d-${d}`}>{l}</button>)}</div>
          <span className="rp-print-h">{mode === 'live' ? 'Live' : 'Paper'} strategies · {RANGES.find(x => x[0] === days)![1]} · printed {new Date().toLocaleDateString()}</span>
        </div>
        {r.error ? <ErrorCard message={r.error} onRetry={r.reload} /> : !r.data || !s ? <div className="x-skel" style={{ height: 420 }} /> : !s.trades ? (
          <div className="x-card"><EmptyState icon="report" ghost="bars" testId="rp-empty" title={`No closed ${mode} trades ${days === 'all' ? 'yet' : 'in this period'}`}
            actions={r.data.deployments.length
              ? (days !== 'all' ? <button className="x-btn" onClick={() => setDays('all')}>Show all time</button> : undefined)
              : <Link className="x-btn x-btn--hi" href="/strategies">Run a strategy</Link>}>
            {r.data.deployments.length ? 'Your strategies haven’t closed a trade in this range yet. Results appear here as each one closes.' : `Run a strategy on ${mode} and its trades, P&L and drawdown show up here.`}
          </EmptyState></div>
        ) : (
          <>
            <section className="rp-kpis" aria-label="Summary" data-testid="rp-kpis">
              {([
                ['Net P&L', usd(s.pnl), tone(s.pnl)], ['Return on capital', pct(s.ret, 2), tone(s.ret)], ['Trades', String(s.trades)], ['Win rate', s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%`],
                ['Profit factor', num(s.pf)], ['Average trade', pct(s.avg, 2), tone(s.avg)], ['Best / worst', `${usd(s.best)} / ${usd(s.worst)}`], ['Max drawdown', pct(s.maxDd, 2), 'neg'], ['Fees', usd(s.fees)],
              ] as Array<[string, string, string?]>).map(([k, v, t]) => <div key={k} className="x-card"><span className="x-muted">{k}</span><b className={`m ${t ?? ''}`}>{v}</b></div>)}
            </section>
            <section className="x-card" aria-label="Equity"><div className="x-ch"><h2>Equity and drawdown</h2><span className="x-sub">Starting from {usd(r.data.capital)} across {r.data.deployments.length} run{r.data.deployments.length === 1 ? '' : 's'}</span></div><EquityChart equity={s.curve} drawdown height={260} testId="rp-equity" /></section>
            <div className="ov-two">
              <section className="x-card" aria-label="Distribution"><div className="x-ch"><h2>Trade results</h2><span className="x-sub">% per trade</span></div>
                <div className="rp-hist" data-testid="rp-hist">{dist.map(d => <div key={d.label} className="rp-hcol" title={`${d.label}: ${d.n}`}><span className="m">{d.n || ''}</span><i className={d.up ? 'g' : 'r'} style={{ height: `${(d.n / maxN) * 120}px` }} /><span className="rp-hl">{d.short}</span></div>)}</div>
              </section>
              <section className="x-card" aria-label="By market"><div className="x-ch"><h2>By market</h2></div><Bars rows={bySymbol} testId="rp-symbols" /></section>
            </div>
            <section className="x-card" aria-label="By strategy"><div className="x-ch"><h2>By strategy</h2></div><Bars rows={byStrategy} testId="rp-strategies" /></section>
            <p className="cp-fine">{mode === 'paper' ? 'Paper results are simulated on live prices with fees and slippage.' : 'Live results use the fill prices your exchange reported; fees aren’t included yet.'} Past results don’t predict future ones.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
