'use client';

// Copy-trading leaderboard (C4.1, C4.9, C4.10): verified leaders with real
// stats from their exchange accounts, sort / range / search, and an FAQ.
// Browsing works without a connected exchange.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { ErrorCard, GradeBadge, Modal, Monogram, useLoad } from '@/components/v6/copy/parts';
import Sparkline from '@/components/v6/ui/sparkline';
import { IArrowRight, ILeader, ISearch } from '@/components/v3/icons';
import { TRADING_ENABLED } from '@/lib/features';
import { leadersApi, followsApi, pct, RANGE_LABEL, signedUsd, toneOf, usd, venueName, type LeaderCard, type LeaderDetail, type LeaderRange, type LeaderSort } from '@/lib/copy-api';

const SORTS: Array<{ id: LeaderSort; label: string }> = [
  { id: 'roi', label: 'Return' },
  { id: 'pnl', label: 'Profit' },
  { id: 'drawdown', label: 'Lowest drawdown' },
  { id: 'winrate', label: 'Win rate' },
  { id: 'sharpe', label: 'Risk-adjusted return' },
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
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? p : [...p, id]));

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
          <>
            {/* Top 3 when ranking by results; a podium for "newest" or a search would mislead. */}
            {!query && list.length >= 3 && sort !== 'newest' && sort !== 'followers' && list.slice(0, 3).every(l => l.stats.roiPct != null) && (
              <section className="cp-podium" aria-label="Top leaders" data-testid="leaders-podium">
                {list.slice(0, 3).map((l, i) => (
                  <Link key={l.id} href={`/copy/leaders/${l.id}`} className={`x-card cp-pod cp-pod--${i + 1}`}>
                    <span className="cp-pod-n m">{i + 1}</span>
                    <Monogram name={l.displayName} />
                    <b>{l.displayName}</b>
                    <span className={`cp-pod-v m ${toneOf(l.stats.roiPct)}`}>{pct(l.stats.roiPct, 1, true)}</span>
                    <small>{RANGE_LABEL[range].toLowerCase()} · max drawdown {pct(l.stats.maxDrawdownPct)}</small>
                    <Sparkline values={l.sparkline} width={180} height={40} label="Equity curve" />
                  </Link>
                ))}
              </section>
            )}
            <section className="cp-lb" aria-label="Leaders" data-testid="leaders-list">
              {list.map((l, i) => (
                <div key={l.id} className="cp-lb-row">
                  <LeaderRow l={l} rank={sort === 'newest' ? null : i + 1} />
                  <label className={`cp-pick ${picked.includes(l.id) ? 'on' : ''}`} title={picked.length >= 3 && !picked.includes(l.id) ? 'Compare up to 3 leaders' : 'Compare'}>
                    <input type="checkbox" className="x-check" checked={picked.includes(l.id)} disabled={picked.length >= 3 && !picked.includes(l.id)} onChange={() => togglePick(l.id)} aria-label={`Compare ${l.displayName}`} data-testid={`leader-pick-${l.id}`} />
                  </label>
                </div>
              ))}
            </section>
          </>
        )}
        {picked.length > 0 && (
          <div className="x-card cp-cmpbar" role="region" aria-label="Compare" data-testid="compare-bar">
            <span><b className="m">{picked.length}</b> of 3 selected{picked.length < 2 ? ': pick one more to compare' : ''}</span>
            <span className="cp-cmpbar-acts">
              <button className="x-btn x-btn--sm" onClick={() => setPicked([])}>Clear</button>
              <button className="x-btn x-btn--sm x-btn--hi" disabled={picked.length < 2} onClick={() => setComparing(true)} data-testid="compare-open">Compare</button>
            </span>
          </div>
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
      {comparing && <CompareDialog ids={picked} onClose={() => setComparing(false)} />}
    </AppShell>
  );
}

function CompareDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [range, setRange] = useState<LeaderRange>('30d');
  const data = useLoad(() => Promise.all(ids.map(id => leadersApi.get(id, range))), [ids.join(','), range]);
  const ls = data.data ?? [];
  // Best value per row gets a mark; "best" depends on direction.
  const best = (vals: Array<number | null>, dir: 1 | -1) => {
    const known = vals.filter((v): v is number => v != null);
    if (known.length < 2) return null;
    return dir > 0 ? Math.max(...known) : Math.min(...known);
  };
  const rows: Array<[string, (l: LeaderDetail) => number | null, (v: number | null) => string, 1 | -1 | 0]> = [
    ['Return', l => l.statsByRange[range].roiPct, v => pct(v, 1, true), 1],
    ['Equity change', l => l.statsByRange[range].pnlUsd, v => signedUsd(v, 0), 1],
    ['Max drawdown', l => l.statsByRange[range].maxDrawdownPct, v => pct(v), -1],
    ['Sharpe ratio', l => l.statsByRange[range].sharpe, v => (v == null ? '—' : v.toFixed(2)), 1],
    ['Profitable weeks', l => l.statsByRange[range].profitableWeeksPct, v => pct(v, 0), 1],
    ['Profit from top 3 trades', l => l.statsByRange[range].top3ProfitSharePct, v => pct(v, 0), -1],
    ['Win rate of copies', l => l.statsByRange.all.winRatePct, v => pct(v, 0), 1],
    ['Followers', l => l.followers, v => (v == null ? '—' : String(v)), 0],
    ['Days active', l => l.daysActive, v => (v == null ? '—' : String(v)), 0],
    ['Suggested balance', l => l.recommendedMarginUsd, v => usd(v, 0), 0],
  ];
  return (
    <Modal title="Compare leaders" onClose={onClose} wide testId="compare-dialog">
      <div className="x-seg x-seg--in cp-mb" role="tablist" aria-label="Range">
        {(['7d', '30d', 'all'] as LeaderRange[]).map(r => <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
      </div>
      {data.error ? <p className="x-muted">{data.error}</p> : !data.data ? <div className="x-skel cp-skel-table" /> : (
        <div className="x-tblwrap">
          <table className="x-tbl cp-cmp">
            <thead>
              <tr><th />{ls.map(l => <th key={l.id}><Link href={`/copy/leaders/${l.id}`} className="cp-cmp-name">{l.displayName}</Link><GradeBadge grade={l.riskGrade} /></th>)}</tr>
            </thead>
            <tbody>
              {rows.map(([label, get, fmt, dir]) => {
                const vals = ls.map(get);
                const top = dir ? best(vals, dir) : null;
                return (
                  <tr key={label}>
                    <td className="x-muted">{label}</td>
                    {vals.map((v, i) => <td key={ls[i]!.id} className={`m ${top != null && v === top ? 'cp-best' : ''}`}>{fmt(v)}</td>)}
                  </tr>
                );
              })}
              <tr><td className="x-muted">Curve</td>{ls.map(l => <td key={l.id}><Sparkline values={l.sparkline} width={140} height={34} label="Equity curve" /></td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="cp-fine">Past results don&rsquo;t predict future ones. The marked value is the best in each row.</p>
    </Modal>
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
      <div className="cp-leader-spark"><Sparkline values={l.sparkline} label="Equity curve" /></div>
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
