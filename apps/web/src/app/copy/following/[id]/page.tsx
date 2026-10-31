'use client';

// One copy in detail (C4.6): status and controls, P&L, tracking error and
// latency, open positions, and every copied order with the leader's price
// next to ours and the slippage. Updates live while open.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import FollowDialog from '@/components/v6/copy/follow-dialog';
import StopDialog from '@/components/v6/copy/stop-dialog';
import { ErrorCard, FollowStatusTag, ago, useCopyStream, useLoad, usePoll } from '@/components/v6/copy/parts';
import { IArrowLeft, IPause, IPlay } from '@/components/v3/icons';
import { followsApi, price, signedUsd, sizingLabel, toneOf, usd, type CopiedOrder } from '@/lib/copy-api';

const STATUS: Record<string, string> = { FILLED: 'Filled', PARTIAL: 'Part filled', SKIPPED: 'Not copied', REJECTED: 'Rejected', CANCELLED: 'Not filled', EXPIRED: 'Expired', PENDING: 'Sending', SUBMITTED: 'Sent', OPEN: 'Open' };

export default function FollowPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const follow = useLoad(() => followsApi.get(id), [id]);
  const [orders, setOrders] = useState<CopiedOrder[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const expanded = useRef(false);
  const first = useLoad(async () => {
    const p = await followsApi.orders(id);
    // After "Show more", a refresh only updates rows and adds new ones on top.
    setOrders(prev => (expanded.current && prev
      ? [...p.items.filter(n => !prev.some(o => o.id === n.id)), ...prev.map(o => p.items.find(n => n.id === o.id) ?? o)]
      : p.items));
    if (!expanded.current) setCursor(p.nextCursor);
    return p;
  }, [id]);
  const f = follow.data;
  useCopyStream(() => { void follow.reload(); void first.reload(); }, f?.status !== 'STOPPED');
  usePoll(() => { void follow.reload(); void first.reload(); }, 60_000, f?.status !== 'STOPPED');
  const [editing, setEditing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!f) return;
    setBusy(true);
    try {
      await followsApi.update(f.id, { action: f.status === 'ACTIVE' ? 'pause' : 'resume' });
      await follow.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    if (!cursor) return;
    expanded.current = true;
    try {
      const p = await followsApi.orders(id, cursor);
      setOrders(o => [...(o ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load more');
    }
  }

  return (
    <AppShell legacy={false} pageTitle={f ? `Copying ${f.leader.displayName}` : 'Copy'} pageSubtitle={f ? `${sizingLabel(f.sizingMode, f.sizingValue)} · ${f.connection.label}` : undefined}
      actions={f && f.status !== 'STOPPED' && (
        <>
          <button className="x-btn" onClick={toggle} disabled={busy} data-testid="fd-toggle">{f.status === 'ACTIVE' ? <><IPause size={14} />Pause</> : <><IPlay size={14} />Resume</>}</button>
          <button className="x-btn" onClick={() => setEditing(true)}>Settings</button>
          <button className="x-btn x-btn--danger" onClick={() => setStopping(true)} data-testid="fd-stop">Stop</button>
        </>
      )}>
      <div className="x-page" data-testid="follow-page">
        <Link href="/copy/following" className="x-link cp-back"><IArrowLeft size={14} />My copies</Link>
        {follow.error ? <ErrorCard message={follow.error} onRetry={follow.reload} /> : !f ? <div className="x-skel cp-skel-hero" /> : (
          <>
            <section className="x-card">
              <div className="x-ch">
                <FollowStatusTag f={f} />
                <span className="x-sub">{f.status === 'STOPPED' ? `Stopped ${ago(f.stoppedAt)}` : `Copying since ${new Date(f.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</span>
                <span className="x-r"><Link href={`/copy/leaders/${f.leader.id}`} className="x-link">Leader page</Link></span>
              </div>
              {f.status === 'PAUSED' && f.pauseReason && <div className="x-banner cp-mb" role="status">{f.pauseReason}. New trades aren&rsquo;t copied; when the leader exits, your copies still close.</div>}
              <div className="x-strip" style={{ ['--n' as string]: 5 }}>
                <div><span>Realized P&amp;L</span><b className={`m ${toneOf(f.realizedPnlUsd)}`}>{signedUsd(f.realizedPnlUsd)}</b></div>
                <div><span>Open P&amp;L</span><b className={`m ${toneOf(f.unrealizedPnlUsd)}`}>{signedUsd(f.unrealizedPnlUsd)}</b></div>
                <div><span>Copied / not copied</span><b className="m">{f.copiedOrders} / {f.skippedOrders + f.failedOrders}</b></div>
                <div><span title="Average gap between the leader's price and yours">Tracking error</span><b className="m">{f.trackingErrorBps == null ? '—' : `${f.trackingErrorBps.toFixed(1)} bps`}</b></div>
                <div><span>Typical delay</span><b className="m">{f.medianLatencyMs == null ? '—' : f.medianLatencyMs < 60_000 ? `${(f.medianLatencyMs / 1000).toFixed(1)} s` : `${Math.round(f.medianLatencyMs / 60_000)} min`}</b></div>
              </div>
              <div className="cp-limits">
                <span>Daily loss limit <b className="m">{f.dailyLossLimitUsd == null ? 'none' : usd(f.dailyLossLimitUsd, 0)}</b></span>
                <span>Profit target <b className="m">{f.maxProfitUsd == null ? 'none' : usd(f.maxProfitUsd, 0)}</b></span>
                {f.maxPositionUsd != null && <span>Max position <b className="m">{usd(f.maxPositionUsd, 0)}</b></span>}
                {f.leverage != null && <span>Leverage <b className="m">{f.leverage}×</b></span>}
                {f.copyReverse && <span>Reverse copy</span>}
              </div>
            </section>

            <section className="x-card" aria-label="Open positions">
              <div className="x-ch"><h2>Open positions</h2></div>
              {f.positions.length === 0 ? <p className="x-muted cp-pad">No open copies.</p> : (
                <div className="x-tblwrap">
                  <table className="x-tbl">
                    <thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Open P&amp;L</th><th>Opened</th></tr></thead>
                    <tbody>
                      {f.positions.map(p => (
                        <tr key={p.symbol}>
                          <td>{p.symbol}{p.drift && <span className="x-tag x-tag--r cp-you" title="Your exchange holds less than this copy opened; closes are capped at what's really there.">Changed on exchange</span>}</td>
                          <td><span className={`x-side ${p.side === 'LONG' ? 'x-side--long' : 'x-side--short'}`}>{p.side === 'LONG' ? 'Long' : 'Short'}</span></td>
                          <td className="m">{p.qty}</td>
                          <td className="m">{price(p.avgEntry)}</td>
                          <td className="m">{price(p.markPrice)}</td>
                          <td className={`m ${toneOf(p.unrealizedPnlUsd)}`}>{signedUsd(p.unrealizedPnlUsd)}</td>
                          <td>{ago(p.openedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="x-card" aria-label="Copied orders">
              <div className="x-ch"><h2>Copied orders</h2><span className="x-sub">leader&rsquo;s price next to yours</span></div>
              {first.error && !orders ? <p className="x-muted">{first.error}</p> : orders == null ? <div className="x-skel cp-skel-table" /> : orders.length === 0 ? (
                <p className="x-muted cp-pad">Nothing copied yet. The next trade {f.leader.displayName} opens shows up here within seconds.</p>
              ) : (
                <>
                  <div className="x-tblwrap">
                    <table className="x-tbl" data-testid="follow-orders">
                      <thead><tr><th>Time</th><th>Contract</th><th>Side</th><th>Size</th><th>Leader price</th><th>Your price</th><th>Slippage</th><th>P&amp;L</th><th>Result</th></tr></thead>
                      <tbody>
                        {orders.map(o => (
                          <tr key={o.id}>
                            <td>{new Date(o.requestedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</td>
                            <td>{o.symbol}</td>
                            <td><span className={o.side === 'BUY' ? 'pos' : 'neg'}>{o.side === 'BUY' ? 'Buy' : 'Sell'}</span>{o.reduceOnly && <span className="x-muted"> · close</span>}</td>
                            <td className="m">{o.status === 'SKIPPED' ? '—' : o.filledQty === o.qty ? o.qty : `${o.filledQty} / ${o.qty}`}</td>
                            <td className="m">{price(o.leaderPrice)}</td>
                            <td className="m">{price(o.fillPrice)}</td>
                            <td className={`m ${o.slippageBps == null ? '' : o.slippageBps > 0 ? 'neg' : o.slippageBps < 0 ? 'pos' : ''}`}>{o.slippageBps == null ? '—' : `${o.slippageBps > 0 ? '+' : ''}${o.slippageBps.toFixed(1)} bps`}</td>
                            {/* Only closes book P&L; an opening order shows none. */}
                            <td className={`m ${o.reduceOnly ? toneOf(o.realizedPnlUsd) : ''}`}>{!o.reduceOnly || o.realizedPnlUsd == null ? '—' : signedUsd(o.realizedPnlUsd)}</td>
                            <td><span className={`x-tag ${o.status === 'FILLED' ? 'x-tag--g' : o.status === 'REJECTED' ? 'x-tag--r' : ''}`} title={o.error ?? undefined}>{STATUS[o.status] ?? o.status}</span>{o.error && <small className="cp-why">{o.error}</small>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {cursor && <button className="x-btn cp-more-btn" onClick={more}>Show more</button>}
                </>
              )}
              <p className="cp-fine">Slippage is how much worse (+) or better (−) your fill was than the leader&rsquo;s, in basis points (1 bps = 0.01%).</p>
            </section>
          </>
        )}
      </div>
      {editing && f && (
        <FollowDialog leader={{ id: f.leader.id, displayName: f.leader.displayName, exchange: f.leader.exchange, environment: f.connection.environment }} follow={f}
          onClose={() => setEditing(false)} onDone={() => { setEditing(false); void follow.reload(); toast.success('Settings saved'); }} />
      )}
      {stopping && f && <StopDialog follow={f} onClose={() => setStopping(false)} onDone={() => { setStopping(false); void follow.reload(); void first.reload(); }} />}
    </AppShell>
  );
}
