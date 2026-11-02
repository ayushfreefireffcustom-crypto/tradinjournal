'use client';

// A saved backtest run in full (F14): settings, every metric, equity and
// drawdown, per-market results and the trade list.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import EquityChart from '@/components/v6/strategy/equity-chart';
import { num, pct, strategiesApi, tone, usd, type Metrics, type Trade } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/strategy.css';
import '@/styles/v6/markets.css';

const REASON: Record<string, string> = { stop: 'Stop', target: 'Target', trailing: 'Trailing stop', breakeven: 'Break-even', time: 'Time stop', signal: 'Exit signal', opposite: 'Opposite signal', liquidation: 'Liquidated', end: 'End of test' };
const dt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function BacktestReportPage() {
  const { id, bid } = useParams<{ id: string; bid: string }>();
  const s = useLoad(() => strategiesApi.get(id), [id]);
  const b = useLoad(() => strategiesApi.getBacktest(id, bid), [id, bid]);
  const [page, setPage] = useState(0);
  const trades = useMemo(() => (b.data?.result.trades ?? []).slice().reverse(), [b.data]);
  if (b.error || s.error) return <AppShell legacy={false} pageTitle="Backtest"><div className="x-page"><ErrorCard message={(b.error ?? s.error)!} /></div></AppShell>;
  if (!b.data || !s.data) return <AppShell legacy={false} pageTitle="Backtest"><div className="x-page"><div className="x-skel" style={{ height: 480 }} /></div></AppShell>;
  const r = b.data.result;
  const m = r.metrics;
  const p = b.data.params;
  const cells: Array<[string, string, string?]> = [
    ['Return', pct(m.totalReturnPct, 2), tone(m.totalReturnPct)], ['CAGR', pct(m.cagrPct, 1), tone(m.cagrPct)], ['Max drawdown', pct(m.maxDrawdownPct, 2), 'neg'],
    ['Trades', String(m.trades)], ['Win rate', m.winRatePct == null ? '—' : `${m.winRatePct.toFixed(1)}%`], ['Profit factor', num(m.profitFactor)],
    ['Sharpe', num(m.sharpe)], ['Sortino', num(m.sortino)], ['Expectancy', m.expectancyR == null ? '—' : `${m.expectancyR.toFixed(2)}R`],
    ['Avg trade', pct(m.avgTradePct, 2), tone(m.avgTradePct)], ['Best / worst', `${pct(m.bestTradePct, 1)} / ${pct(m.worstTradePct, 1)}`], ['Time in market', `${m.exposurePct.toFixed(0)}%`],
    ['Fees', usd(m.fees)], ['Slippage', `${usd(m.slippage)}${m.avgSlippageBps != null ? ` · ${m.avgSlippageBps.toFixed(1)} bps` : ''}`], ['Long / short', `${m.longTrades} / ${m.shortTrades}`],
    ['End equity', usd(m.endEquity)], ['Avg bars held', m.avgBarsHeld == null ? '—' : m.avgBarsHeld.toFixed(1)],
  ];
  const PAGE = 50;
  const shown = trades.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <AppShell legacy={false} pageTitle={`${s.data.name} · backtest`} pageSubtitle={`Version ${b.data.version} · ${new Date(p.from).toLocaleDateString()} to ${new Date(p.to).toLocaleDateString()} · ${usd(p.capital)} start · ${p.slippageBps} bps slippage`}
      actions={<Link className="x-btn" href={`/strategies/${id}`}>Back to the builder</Link>}>
      <div className="x-page" data-testid="bt-page">
        <section className="x-card" aria-label="Equity"><div className="x-ch"><h2>Equity and drawdown</h2><span className="x-sub">{r.range.bars.toLocaleString('en-US')} bars</span></div><EquityChart equity={r.equity} drawdown height={300} testId="bt-equity" /></section>
        <section className="x-card" aria-label="Metrics"><div className="bt-cells" data-testid="bt-metrics">{cells.map(([k, v, t]) => <div key={k}><span className="x-muted">{k}</span><b className={`m ${t ?? ''}`}>{v}</b></div>)}</div>{r.notes.map((n, i) => <p key={i} className="cp-fine">{n}</p>)}</section>
        {r.perSymbol.length > 1 && (
          <section className="x-card" aria-label="By market"><div className="x-ch"><h2>By market</h2></div>
            <table className="x-tbl trd-tbl sc-tbl" data-testid="bt-symbols"><thead><tr><th>Market</th><th className="r">Trades</th><th className="r">P&amp;L</th><th className="r">Win rate</th></tr></thead>
              <tbody>{r.perSymbol.map(x => <tr key={x.symbol}><td><b>{x.symbol}</b></td><td className="r m" data-label="Trades">{x.trades}</td><td className={`r m ${tone(x.pnl)}`} data-label="P&L">{usd(x.pnl)}</td><td className="r m" data-label="Win rate">{x.winRatePct == null ? '—' : `${x.winRatePct.toFixed(0)}%`}</td></tr>)}</tbody></table>
          </section>
        )}
        <section className="x-card" aria-label="Trades">
          <div className="x-ch"><h2>Trades</h2><span className="x-sub">Newest first{r.tradesTotal && r.tradesTotal > r.trades.length ? ` · first ${r.trades.length} of ${r.tradesTotal} kept` : ''}</span></div>
          <div className="x-tblwrap">
            <table className="x-tbl trd-tbl sc-tbl" data-testid="bt-trades">
              <thead><tr><th>Market</th><th>Side</th><th>Entry</th><th>Exit</th><th className="r">Entry price</th><th className="r">Exit price</th><th className="r">P&amp;L</th><th className="r">R</th><th>Why it closed</th></tr></thead>
              <tbody>{shown.map((t: Trade, k) => (
                <tr key={k}>
                  <td><b>{t.symbol}</b></td><td data-label="Side"><span className={`x-side x-side--${t.side}`}>{t.side === 'long' ? 'Long' : 'Short'}</span></td>
                  <td data-label="Entry">{dt(t.entryTime)}</td><td data-label="Exit">{dt(t.exitTime)}</td>
                  <td className="r m" data-label="Entry price">{t.entryPrice.toPrecision(6)}</td><td className="r m" data-label="Exit price">{t.exitPrice.toPrecision(6)}</td>
                  <td className={`r m ${tone(t.pnl)}`} data-label="P&L">{usd(t.pnl)} <span className="x-muted">({pct(t.pnlPct, 2)})</span></td>
                  <td className="r m" data-label="R">{t.rMultiple == null ? '—' : t.rMultiple.toFixed(2)}</td>
                  <td data-label="Why it closed">{REASON[t.reason] ?? t.reason}{t.partialFills ? ` · ${t.partialFills} partial` : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {trades.length > PAGE && <div className="bt-pager"><button className="x-btn x-btn--sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Newer</button><span className="x-muted">{page * PAGE + 1}–{Math.min(trades.length, (page + 1) * PAGE)} of {trades.length}</span><button className="x-btn x-btn--sm" disabled={(page + 1) * PAGE >= trades.length} onClick={() => setPage(p => p + 1)}>Older</button></div>}
        </section>
        <p className="cp-fine">Simulated on historical candles: signals act at the next bar’s open, stops are assumed to fill before targets when both are inside one bar, and fees and slippage are included. Past results don’t predict future ones.</p>
      </div>
    </AppShell>
  );
}
