'use client';

// A marketplace strategy card (H1).
import Link from '@/components/v6/ui/link';
import { catLabel, pctS, riskLabel, type Card } from '@/lib/marketplace-api';
import { usd } from '@/lib/strategies-api';

export default function TemplateCard({ c }: { c: Card }) {
  const b = c.backtest;
  return (
    <Link href={`/marketplace/${c.id}`} className="x-card mk-card" data-testid={`mk-card-${c.id}`}>
      <div className="mk-card-h">
        <div><b>{c.name}</b><span className="x-muted">by {c.creator}</span></div>
        <span className={`x-tag mk-risk-${c.risk}`}>{riskLabel(c.risk)}</span>
      </div>
      <p className="mk-sum">{c.summary}</p>
      <div className="mk-tags"><span className="x-tag">{catLabel(c.category)}</span><span className="x-tag m">{c.symbols.slice(0, 3).join(' · ')}{c.symbols.length > 3 ? ` +${c.symbols.length - 3}` : ''}</span><span className="x-tag m">{c.interval}</span>{c.facts.direction !== 'long' && <span className="x-tag">{c.facts.direction === 'both' ? 'Long + short' : 'Short'}</span>}</div>
      <div className="mk-stats">
        <div><span>Backtest {b ? `${b.days}d` : ''}</span><b className={`m ${b?.totalReturnPct == null ? '' : b.totalReturnPct >= 0 ? 'pos' : 'neg'}`}>{pctS(b?.totalReturnPct)}</b></div>
        <div><span>Max drawdown</span><b className="m neg">{pctS(b?.maxDrawdownPct)}</b></div>
        <div><span>Win rate</span><b className="m">{b?.winRatePct == null ? '—' : `${b.winRatePct.toFixed(0)}%`}</b></div>
        <div><span>Following</span><b className="m">{c.subscribers}</b></div>
      </div>
      <div className="mk-track x-muted">{c.track ? <>Creator’s {c.track.mode} run since {new Date(c.track.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: <b className={c.track.pnl >= 0 ? 'pos' : 'neg'}>{usd(c.track.pnl)}</b> over {c.track.trades} trade{c.track.trades === 1 ? '' : 's'}</> : 'No live track record yet'}</div>
    </Link>
  );
}

