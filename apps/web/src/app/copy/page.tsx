'use client';

// Copy-trading leaderboard (C4.1, C4.9, C4.10): verified leaders with real
// stats from their exchange accounts, sort / range / search, and an FAQ.
// Browsing works without a connected exchange.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { ErrorCard, GradeBadge, Monogram, Sparkline, useLoad } from '@/components/v6/copy/parts';
import { IArrowRight, ILeader, ISearch } from '@/components/v3/icons';
import { TRADING_ENABLED } from '@/lib/features';
import { leadersApi, followsApi, pct, RANGE_LABEL, signedUsd, toneOf, usd, venueName, type LeaderCard, type LeaderRange, type LeaderSort } from '@/lib/copy-api';

const SORTS: Array<{ id: LeaderSort; label: string }> = [
  { id: 'roi', label: 'Return' },
  { id: 'pnl', label: 'Profit' },
  { id: 'drawdown', label: 'Lowest drawdown' },
  { id: 'winrate', label: 'Win rate' },
  { id: 'followers', label: 'Followers' },
  { id: 'newest', label: 'Newest' },
];

const FAQ: Array<[string, string]> = [
  ['What is a leader?', 'A trader who connects their own exchange account and lets others copy it. Every number on a leader\'s card comes from that account: we don\'t accept screenshots or self-reported results.'],
  ['How does copying work?', 'When the leader\'s order fills, we place a matching order on your exchange account, usually within a couple of seconds. Your size follows the rule you pick: matched to your balance, a fixed amount per trade, or a multiple of the leader\'s size.'],
  ['Can I stop at any time?', 'Yes. Pause stops new entries but still closes trades when the leader exits. Stop ends copying; you choose whether to close the open copies or keep them.'],
  ['Does TRADElogs hold my money?', 'No. Your funds stay on your exchange account. The API key you connect can trade but can\'t withdraw.'],
  ['How do I choose a leader?', 'Look past the return. Check the max drawdown and risk grade, how long they\'ve been active, and whether their trade sizes fit your balance (the recommended amount on each card).'],
  ['Is profit guaranteed?', 'No. Past results don\'t predict future ones, copies can fill at a different price than the leader\'s, and you can lose money, including all of the margin on your account.'],
];

export default function LeadersPage() {
  const [sort, setSort] = useState<LeaderSort>('roi');
  const [range, setRange] = useState<LeaderRange>('30d');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const leaders = useLoad(() => leadersApi.list({ sort, range, q: query || undefined }), [sort, range, query]);
  const mine = useLoad(() => followsApi.list(), []);

  if (!TRADING_ENABLED) return <AppShell legacy={false} pageTitle="Copy trading"><div className="x-page"><div className="x-card x-empty"><b>Coming soon</b><p>Copy trading isn&rsquo;t available yet.</p></div></div></AppShell>;

  const list = leaders.data ?? [];
  const copying = (mine.data ?? []).length;

  return (
    <AppShell legacy={false} pageTitle="Copy trading" pageSubtitle="Copy verified traders onto your own exchange account"
      actions={<Link href="/copy/lead" className="x-btn">Become a leader</Link>}>
      <div className="x-page" data-testid="leaders-page">
        {copying > 0 && (
          <Link href="/copy/following" className="x-card cp-strip-link" data-testid="leaders-mine">
            <span>You&rsquo;re copying <b className="m">{copying}</b> {copying === 1 ? 'leader' : 'leaders'}</span>
            <span className="x-link">My copies <IArrowRight size={14} /></span>
          </Link>
        )}

        <div className="cp-tools">
          <label className="x-search cp-search">
            <ISearch size={15} />
            <input className="x-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search leaders" aria-label="Search leaders" data-testid="leaders-search" />
          </label>
          <div className="x-seg" role="tablist" aria-label="Range">
            {(['7d', '30d', 'all'] as LeaderRange[]).map(r => <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
          </div>
          <label className="cp-sort">
            <span className="x-muted">Sort</span>
            <select className="x-select" value={sort} onChange={e => setSort(e.target.value as LeaderSort)} aria-label="Sort leaders" data-testid="leaders-sort">
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {leaders.error ? <ErrorCard message={leaders.error} onRetry={leaders.reload} /> : leaders.loading && !leaders.data ? (
          <div className="cp-lb">{[0, 1, 2, 3].map(i => <div key={i} className="x-skel cp-skel-leader" />)}</div>
        ) : list.length === 0 ? (
          <div className="x-card x-empty" data-testid="leaders-empty">
            <span className="x-ic"><ILeader size={22} /></span>
            <b>{query ? `No leaders match “${query}”` : 'No leaders yet'}</b>
            <p>{query ? 'Try another name.' : 'Leaders appear here once we verify their exchange account. Trade well? Apply to be one of the first.'}</p>
            {!query && <Link href="/copy/lead" className="x-btn x-btn--hi">Become a leader</Link>}
          </div>
        ) : (
          <section className="cp-lb" aria-label="Leaders" data-testid="leaders-list">
            {list.map((l, i) => <LeaderRow key={l.id} l={l} rank={sort === 'newest' ? null : i + 1} />)}
          </section>
        )}

        <section className="x-card cp-faq" aria-label="Questions">
          <div className="x-ch"><h2>Questions</h2></div>
          {FAQ.map(([qq, a]) => (
            <details key={qq}>
              <summary>{qq}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function LeaderRow({ l, rank }: { l: LeaderCard; rank: number | null }) {
  const s = l.stats;
  return (
    <Link href={`/copy/leaders/${l.id}`} className="x-card cp-leader" data-testid={`leader-${l.id}`}>
      <div className="cp-leader-id">
        {rank != null && <span className="cp-rank m">{rank}</span>}
        <Monogram name={l.displayName} />
        <div>
          <b>{l.displayName}{l.isMine && <span className="x-tag cp-you">You</span>}{l.following && <span className="x-tag x-tag--g cp-you">Copying</span>}</b>
          <small>{venueName(l.exchange)}{l.environment === 'TESTNET' ? ' testnet' : ''} · {l.daysActive} {l.daysActive === 1 ? 'day' : 'days'} · {l.followers} {l.followers === 1 ? 'follower' : 'followers'}</small>
        </div>
      </div>
      <div className="cp-leader-k">
        <span>Return</span>
        <b className={`m ${toneOf(s.roiPct)}`}>{pct(s.roiPct, 1, true)}</b>
        <small className={`m ${toneOf(s.pnlUsd)}`}>{signedUsd(s.pnlUsd, 0)}</small>
      </div>
      <div className="cp-leader-spark"><Sparkline values={l.sparkline} /></div>
      <div className="cp-leader-k"><span>Max drawdown</span><b className="m">{pct(s.maxDrawdownPct)}</b></div>
      <div className="cp-leader-k">
        <span>Win rate</span>
        <b className="m">{pct(s.winRatePct, 0)}</b>
        {s.winRatePct != null && <i className="cp-bar" aria-hidden><i style={{ width: `${Math.min(100, s.winRatePct)}%` }} /></i>}
      </div>
      <div className="cp-leader-k"><span>Suggested balance</span><b className="m">{usd(l.recommendedMarginUsd, 0)}</b></div>
      <div className="cp-leader-g"><GradeBadge grade={l.riskGrade} /></div>
    </Link>
  );
}
