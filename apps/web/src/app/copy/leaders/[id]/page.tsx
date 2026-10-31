'use client';

// Leader page (C4.3): header and KPIs, equity curve, stats by range, open
// positions, trade history, strategy, and the copy box with a "what if"
// estimate from the leader's real return over the range.
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import FollowDialog from '@/components/v6/copy/follow-dialog';
import { EquityLine, ErrorCard, GradeBadge, Monogram, ago, useLoad } from '@/components/v6/copy/parts';
import { IArrowLeft } from '@/components/v3/icons';
import { leadersApi, followsApi, pct, price, RANGE_LABEL, signedUsd, toneOf, usd, venueName, type LeaderDetail, type LeaderRange, type LeaderTrade } from '@/lib/copy-api';

export default function LeaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [range, setRange] = useState<LeaderRange>('30d');
  const leader = useLoad(() => leadersApi.get(id, range), [id, range]);
  const equity = useLoad(() => leadersApi.equity(id, range), [id, range]);
  const [trades, setTrades] = useState<LeaderTrade[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstTrades = useLoad(async () => {
    const p = await leadersApi.trades(id);
    setTrades(p.items);
    setCursor(p.nextCursor);
    return p;
  }, [id]);
  const myFollows = useLoad(() => followsApi.list(), []);
  const [following, setFollowing] = useState(false);

  const l = leader.data;
  const s = l?.stats;
  const mine = (myFollows.data ?? []).find(f => f.leader.id === id);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const p = await leadersApi.trades(id, cursor);
      setTrades(t => [...(t ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AppShell legacy={false} pageTitle={l?.displayName ?? 'Leader'} pageSubtitle={l ? `${venueName(l.exchange)}${l.environment === 'TESTNET' ? ' testnet' : ''} · active ${l.daysActive} ${l.daysActive === 1 ? 'day' : 'days'}` : undefined}
      actions={
        <div className="x-seg" role="tablist" aria-label="Range">
          {(['7d', '30d', 'all'] as LeaderRange[]).map(r => <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
        </div>
      }>
      <div className="x-page" data-testid="leader-page">
        <Link href="/copy" className="x-link cp-back"><IArrowLeft size={14} />All leaders</Link>
        {leader.error ? <ErrorCard message={leader.error} onRetry={leader.reload} /> : !l ? (
          <div className="cp-ld"><div className="x-skel cp-skel-hero" /><div className="x-skel cp-skel-hero" /></div>
        ) : (
          <>
            <div className="cp-ld">
              <section className="x-card cp-ld-main">
                <header className="cp-ld-h">
                  <Monogram name={l.displayName} />
                  <div>
                    <h1>{l.displayName}{l.isMine && <span className="x-tag cp-you">You</span>}</h1>
                    <small>{l.followers} {l.followers === 1 ? 'follower' : 'followers'}{l.maxFollowers != null ? ` of ${l.maxFollowers}` : ''} · last trade {ago(l.lastTradeAt)}</small>
                  </div>
                  <GradeBadge grade={l.riskGrade} />
                </header>
                <div className="x-strip cp-ld-k" style={{ ['--n' as string]: 4 }}>
                  <div><span>Return · {RANGE_LABEL[range].toLowerCase()}</span><b className={`m ${toneOf(s!.roiPct)}`}>{pct(s!.roiPct, 2, true)}</b></div>
                  <div><span>Equity change</span><b className={`m ${toneOf(s!.pnlUsd)}`}>{signedUsd(s!.pnlUsd)}</b></div>
                  <div><span>Max drawdown</span><b className="m">{pct(s!.maxDrawdownPct)}</b></div>
                  <div><span>Open trades</span><b className="m">{l.openPositions.length}</b></div>
                </div>
                {equity.error ? <p className="x-muted">{equity.error}</p> : <EquityLine points={equity.data ?? []} empty="The equity curve fills in as the engine samples this account (every 5 minutes)." />}
              </section>

              <MirrorBox l={l} range={range} following={mine} onFollow={() => setFollowing(true)} onOpen={() => mine && router.push(`/copy/following/${mine.id}`)} />
            </div>

            <div className="cp-ld-row">
              <section className="x-card" aria-label="Stats">
                <div className="x-ch"><h2>Stats</h2><span className="x-sub">from the leader&rsquo;s exchange account</span></div>
                <div className="x-tblwrap">
                  <table className="x-tbl cp-stats">
                    <thead><tr><th /><th>7 days</th><th>30 days</th><th>All time</th></tr></thead>
                    <tbody>
                      {([
                        ['Return', (r: LeaderRange) => <b className={`m ${toneOf(l.statsByRange[r].roiPct)}`}>{pct(l.statsByRange[r].roiPct, 2, true)}</b>],
                        ['Equity change', (r: LeaderRange) => <span className={`m ${toneOf(l.statsByRange[r].pnlUsd)}`}>{signedUsd(l.statsByRange[r].pnlUsd)}</span>],
                        ['Max drawdown', (r: LeaderRange) => <span className="m">{pct(l.statsByRange[r].maxDrawdownPct)}</span>],
                      ] as Array<[string, (r: LeaderRange) => React.ReactNode]>).map(([k, f]) => (
                        <tr key={k}><td className="x-muted">{k}</td><td>{f('7d')}</td><td>{f('30d')}</td><td>{f('all')}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="x-strip cp-ld-k2" style={{ ['--n' as string]: 3 }}>
                  <div><span>Win rate of copies</span><b className="m">{pct(l.statsByRange.all.winRatePct, 0)}</b></div>
                  <div><span>Leader trades</span><b className="m">{l.statsByRange.all.tradeCount}</b></div>
                  <div><span>Equity now</span><b className="m">{usd(l.equityUsd)}</b></div>
                </div>
                <p className="cp-fine">Equity change includes deposits and withdrawals. Risk grade comes from all-time max drawdown: A under 10%, B under 20%, C under 30%, D under 45%, E above; graded after 7 days.</p>
              </section>

              <section className="x-card" aria-label="Open positions">
                <div className="x-ch"><h2>Open now</h2></div>
                {l.openPositions.length === 0 ? <p className="x-muted cp-pad">No open positions.</p> : (
                  <ul className="cp-pos">
                    {l.openPositions.map(p => (
                      <li key={p.symbol}>
                        <span className="x-mk">{p.symbol.slice(0, 3)}</span>
                        <div><b>{p.symbol}</b><small>{p.since ? `since ${ago(p.since)}` : 'opened before tracking began'}</small></div>
                        <span className={`x-side ${p.side === 'LONG' ? 'x-side--long' : 'x-side--short'}`}>{p.side === 'LONG' ? 'Long' : 'Short'}</span>
                        <b className="m">{p.size}</b>
                      </li>
                    ))}
                  </ul>
                )}
                {l.bio && (
                  <>
                    <div className="x-ch cp-ch-gap"><h2>Strategy</h2></div>
                    <p className="cp-bio">{l.bio}</p>
                  </>
                )}
              </section>
            </div>

            <section className="x-card" aria-label="Trade history">
              <div className="x-ch"><h2>Trade history</h2><span className="x-sub">every fill on the leader&rsquo;s account</span></div>
              {firstTrades.error ? <p className="x-muted">{firstTrades.error}</p> : trades == null ? <div className="x-skel cp-skel-table" /> : trades.length === 0 ? <p className="x-muted cp-pad">No trades yet.</p> : (
                <>
                  <div className="x-tblwrap">
                    <table className="x-tbl cp-trades" data-testid="leader-trades">
                      <thead><tr><th>Time</th><th>Contract</th><th>Side</th><th>Size</th><th>Price</th><th>Position after</th></tr></thead>
                      <tbody>
                        {trades.map(t => (
                          <tr key={t.id}>
                            <td>{new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                            <td>{t.symbol}</td>
                            <td><span className={t.side === 'BUY' ? 'pos' : 'neg'}>{t.side === 'BUY' ? 'Buy' : 'Sell'}</span>{t.reduceOnly && <span className="x-muted"> · close</span>}</td>
                            <td className="m">{t.qty}</td>
                            <td className="m">{price(t.price)}</td>
                            <td className="m">{t.positionAfter == null ? '—' : t.positionAfter}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {cursor && <button className="x-btn cp-more-btn" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>}
                </>
              )}
            </section>
          </>
        )}
      </div>
      {following && l && (
        <FollowDialog leader={l} onClose={() => setFollowing(false)}
          onDone={f => { setFollowing(false); toast.success(`You're now copying ${l.displayName}`); router.push(`/copy/following/${f.id}`); }} />
      )}
    </AppShell>
  );
}

function MirrorBox({ l, range, following, onFollow, onOpen }: {
  l: LeaderDetail;
  range: LeaderRange; following: { id: string; status: string } | undefined; onFollow: () => void; onOpen: () => void;
}) {
  const [amount, setAmount] = useState(String(l.recommendedMarginUsd ?? 500));
  const a = Number(amount);
  const roi = l.stats.roiPct;
  const est = roi != null && Number.isFinite(a) && a > 0 ? (a * roi) / 100 : null;
  return (
    <aside className="x-card cp-mirror" aria-label="Copy this leader" data-testid="leader-mirror">
      <div className="x-ch"><h2>Copy {l.displayName}</h2></div>
      <div className="x-inset cp-mirror-k">
        <span>Suggested balance</span>
        <b className="m">{usd(l.recommendedMarginUsd, 0)}</b>
        <small>{l.recommendedMarginUsd == null ? 'Shown once the leader has traded.' : 'Smallest balance that copies their typical trade at 1× without rounding it to zero.'}</small>
      </div>
      <div className="x-field">
        <label htmlFor="cp-whatif">If you&rsquo;d copied with</label>
        <input id="cp-whatif" className="x-input m" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        <span className="x-help">
          over {RANGE_LABEL[range].toLowerCase()}, at their return of <b className={`m ${toneOf(roi)}`}>{pct(roi, 2, true)}</b>, you&rsquo;d be about <b className={`m ${toneOf(est)}`}>{signedUsd(est)}</b>. An estimate: real copies differ by fill prices, fees and rounding.
        </span>
      </div>
      {l.isMine ? <p className="x-muted">This is your leader profile.</p>
        : following ? <button className="x-btn x-btn--hi x-btn--full" onClick={onOpen}>View my copy</button>
          : <button className="x-btn x-btn--hi x-btn--full x-btn--lg" onClick={onFollow} data-testid="leader-follow">Copy this leader</button>}
      <p className="cp-fine">You can pause or stop at any time. Copies run on your own exchange account.</p>
    </aside>
  );
}
