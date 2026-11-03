'use client';

// Strategy marketplace (H1): published strategies with performance TRADElogs
// computed itself. Filter by style, risk and market; sort by popularity,
// return, drawdown or newest.
import EmptyState from '@/components/v6/ui/empty-state';
import Link from '@/components/v6/ui/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import TemplateCard from '@/components/v6/marketplace/card';
import { CATEGORIES, RISKS, marketApi, type Sort } from '@/lib/marketplace-api';
import '@/styles/v6/markets.css';
import '@/styles/v6/marketplace.css';

const SORTS: Array<[Sort, string]> = [['popular', 'Most followed'], ['return', 'Best backtest'], ['drawdown', 'Smallest drawdown'], ['newest', 'Newest']];

export default function MarketplacePage() {
  const [category, setCategory] = useState('');
  const [risk, setRisk] = useState('');
  const [symbol, setSymbol] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [debounced, setDebounced] = useState({ symbol: '', q: '' });
  useEffect(() => { const t = setTimeout(() => setDebounced({ symbol: symbol.trim(), q: q.trim() }), 350); return () => clearTimeout(t); }, [symbol, q]);
  const list = useLoad(() => marketApi.browse({ category, risk, symbol: debounced.symbol, q: debounced.q, sort }), [category, risk, debounced.symbol, debounced.q, sort]);
  return (
    <AppShell legacy={false} pageTitle="Marketplace" pageSubtitle="Strategies from other traders"
      actions={<><Link className="x-btn" href="/marketplace/subscriptions" data-testid="mk-subs-link">My subscriptions</Link><Link className="x-btn" href="/marketplace/creator" data-testid="mk-creator-link">Publish yours</Link></>}>
      <div className="x-page mk-page" data-testid="mk-page">
        <div className="mk-filters">
          <div className="x-seg x-seg--in x-seg--sm mk-cats" role="radiogroup" aria-label="Style">
            <button type="button" role="radio" aria-checked={category === ''} onClick={() => setCategory('')}>All</button>
            {CATEGORIES.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={category === id} onClick={() => setCategory(id)} data-testid={`mk-cat-${id}`}>{l}</button>)}
          </div>
          <select className="x-input" value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Risk" data-testid="mk-risk"><option value="">Any risk</option>{RISKS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <input className="x-input m" placeholder="Market, e.g. BTCUSDT" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} aria-label="Market" data-testid="mk-symbol" />
          <input className="x-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" data-testid="mk-q" />
          <select className="x-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" data-testid="mk-sort">{SORTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        </div>
        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="mk-grid">{[0, 1, 2].map((i) => <div key={i} className="x-skel" style={{ height: 240 }} />)}</div> : !list.data.length ? (
          <div className="x-card">{category || risk || debounced.symbol || debounced.q ? (
            <EmptyState icon="search" tone="warn" testId="mk-empty" title="Nothing matches"
              actions={<button className="x-btn" onClick={() => { setCategory(''); setRisk(''); setSymbol(''); setQ(''); }}>Clear filters</button>}>No published strategy fits all of these filters.</EmptyState>
          ) : (
            <EmptyState icon="star" ghost="cards" testId="mk-empty" title="No strategies published yet"
              hints={['Backtested by TRADElogs', 'Fees and slippage included', 'Run it on paper first']}
              actions={<Link className="x-btn x-btn--hi" href="/marketplace/creator">Publish one of yours</Link>}>
              Traders in the creator programme publish their strategies here once we&rsquo;ve reviewed them.
            </EmptyState>
          )}</div>
        ) : <div className="mk-grid" data-testid="mk-grid">{list.data.map((c) => <TemplateCard key={c.id} c={c} />)}</div>}
        <p className="x-muted mk-fine">Backtests are run by TRADElogs on each strategy’s rules over recent history, with fees and slippage. A creator’s track record is their own paper or live run. Past results don’t predict future ones.</p>
      </div>
    </AppShell>
  );
}
