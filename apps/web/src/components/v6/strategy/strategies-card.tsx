'use client';

// Strategy P&L on the dashboard with the paper / live switch (F22). Shown only
// once you've run a strategy. The switch is shared with the reports page.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLoad } from '@/components/v6/copy/parts';
import { deploymentsApi, tone, usd } from '@/lib/strategies-api';
import '@/styles/v6/copy.css';

const MODE_KEY = 'tradelogs.strategies.mode';

export default function StrategiesCard() {
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  useEffect(() => { try { const m = localStorage.getItem(MODE_KEY); if (m === 'paper' || m === 'live') setMode(m); } catch { /* ignore */ } }, []);
  const pick = (m: 'paper' | 'live') => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const rep = useLoad(() => deploymentsApi.report(mode, 30), [mode]);
  const all = useLoad(() => deploymentsApi.list(), []);
  if (!all.data?.length) return null;
  const running = all.data.filter(d => d.mode === mode && ['running', 'paused', 'stopping'].includes(d.status));
  const t = rep.data?.trades ?? [];
  const pnl = t.reduce((a, x) => a + x.pnl, 0);
  const open = running.reduce((a, d) => a + d.openPnl, 0);
  return (
    <section className="x-card dk-strat" aria-label="Strategies" data-testid="dash-strategies">
      <div className="x-ch">
        <h2>Strategies</h2>
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Paper or live">
          <button type="button" role="radio" aria-checked={mode === 'paper'} onClick={() => pick('paper')} data-testid="dash-paper">Paper</button>
          <button type="button" role="radio" aria-checked={mode === 'live'} onClick={() => pick('live')} data-testid="dash-live">Live</button>
        </div>
      </div>
      <div className="dk-strat-row">
        <div><span className="x-muted">Closed P&amp;L · 30 days</span><b className={`m ${tone(pnl)}`} data-testid="dash-strat-pnl">{rep.data ? usd(pnl) : '…'}</b></div>
        <div><span className="x-muted">Open P&amp;L</span><b className={`m ${tone(open)}`}>{running.length ? usd(open) : '—'}</b></div>
        <div><span className="x-muted">Trades · 30 days</span><b className="m">{t.length}</b></div>
        <div><span className="x-muted">Win rate</span><b className="m">{t.length ? `${Math.round((t.filter(x => x.pnl > 0).length / t.length) * 100)}%` : '—'}</b></div>
        <div><span className="x-muted">Running</span><b className="m">{running.length}</b></div>
      </div>
      <div className="dk-strat-links"><Link className="x-link" href="/strategies/deployments">Deployments</Link><Link className="x-link" href="/strategies/reports">Full report</Link></div>
    </section>
  );
}
