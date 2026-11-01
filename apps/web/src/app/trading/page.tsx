'use client';

// Trading desk (Part D): every exchange account's positions in one place.
// Open / Pending / Closed / Rejected with counts (D1), close all or part of a
// position (D3, D4), a details sheet with copyable IDs (D9), and the log of
// every order we sent (D12).
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad, usePoll } from '@/components/v6/copy/parts';
import { ApiError, price, signedUsd, toneOf, tradingApi, venueName, type DeskClosedTrade, type DeskOrder, type DeskOrderStatus, type DeskPendingOrder, type DeskPosition } from '@/lib/copy-api';
import '@/styles/v6/copy.css';

type Tab = 'open' | 'pending' | 'closed' | 'rejected' | 'log';
type Detail = { title: string; rows: Array<[string, string | null]> };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const acct = (r: { connectionLabel: string; environment: string; exchange: string }) => `${r.connectionLabel}${r.environment === 'TESTNET' ? ' · testnet' : ''}`;
const hold = (a: string, b: string) => {
  const s = Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)}d`;
};

export default function TradingPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const desk = useLoad(() => tradingApi.overview(), []);
  usePoll(() => void desk.reload(), 15_000, tab === 'open' || tab === 'pending');
  const [closing, setClosing] = useState<DeskPosition | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const d = desk.data;
  const tabs: Array<{ id: Tab; label: string; n?: number }> = [
    { id: 'open', label: 'Open', n: d?.counts.open },
    { id: 'pending', label: 'Pending', n: d?.counts.pending },
    { id: 'closed', label: 'Closed', n: d?.counts.closed },
    { id: 'rejected', label: 'Rejected', n: d?.counts.rejected },
    { id: 'log', label: 'Order log' },
  ];
  const upnl = d ? d.positions.reduce((s, p) => s + p.unrealizedPnl, 0) : null;
  const realized30 = d ? d.closed.reduce((s, t) => s + t.pnlUsd, 0) : null;

  return (
    <AppShell legacy={false} pageTitle="Positions" pageSubtitle="Your exchange accounts: what's open, waiting and done"
      actions={<button className="x-btn" onClick={() => void desk.reload()} disabled={desk.loading} data-testid="desk-refresh">{desk.loading ? 'Refreshing…' : 'Refresh'}</button>}>
      <div className="x-page" data-testid="desk-page">
        <div className="x-strip x-strip--card trd-strip" style={{ ['--n' as string]: 3 }}>
          <div><span>Open P&amp;L</span><b className={`m ${toneOf(upnl ?? 0)}`}>{upnl == null ? '—' : signedUsd(upnl)}</b></div>
          <div><span>Closed P&amp;L · 30 days</span><b className={`m ${toneOf(realized30 ?? 0)}`}>{realized30 == null ? '—' : signedUsd(realized30)}</b><small>before fees and funding</small></div>
          <div><span>Open positions</span><b className="m">{d ? d.counts.open : '—'}</b></div>
        </div>

        {d?.errors.map(e => (
          <p key={e.connectionId} className="cp-err" role="status" data-testid="desk-account-error">
            Couldn&rsquo;t read <b>{e.connectionLabel}</b>: {e.message} Its rows are missing below, not zero.
          </p>
        ))}

        <div className="x-tabs" role="tablist" aria-label="Positions">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`desk-tab-${t.id}`}>
              {t.label}{t.n != null && <span className={t.id === 'rejected' && t.n > 0 ? 'x-badge trd-badge--r' : 'x-badge trd-badge'}>{t.n}</span>}
            </button>
          ))}
        </div>

        {desk.error ? <ErrorCard message={desk.error} onRetry={desk.reload} /> : !d && tab !== 'log' && tab !== 'rejected' ? (
          <div className="x-skel cp-skel-table" />
        ) : tab === 'open' ? (
          <OpenTable rows={d!.positions} onClose={setClosing} onDetail={setDetail} />
        ) : tab === 'pending' ? (
          <PendingTable rows={d!.pending} onDetail={setDetail} />
        ) : tab === 'closed' ? (
          <ClosedTable rows={d!.closed} onDetail={setDetail} />
        ) : (
          <OrderLog key={tab} status={tab === 'rejected' ? 'rejected' : 'all'} onDetail={setDetail} />
        )}
        <p className="cp-note">Prices and sizes come straight from the exchange. Sizes are in contracts.</p>
      </div>

      {closing && (
        <CloseDialog p={closing} onClose={() => setClosing(null)}
          onDone={(msg, ok) => { setClosing(null); (ok ? toast.success : toast.error)(msg); void desk.reload(); }} />
      )}
      {detail && <DetailSheet d={detail} onClose={() => setDetail(null)} />}
    </AppShell>
  );
}

function Empty({ title, body, testId }: { title: string; body: React.ReactNode; testId: string }) {
  return <div className="x-card x-empty" data-testid={testId}><b>{title}</b><p>{body}</p></div>;
}

function OpenTable({ rows, onClose, onDetail }: { rows: DeskPosition[]; onClose: (p: DeskPosition) => void; onDetail: (d: Detail) => void }) {
  if (!rows.length) return <Empty testId="desk-open-empty" title="No open positions" body={<>Nothing is open on your connected exchange accounts. <Link className="x-link" href="/exchanges">Exchanges</Link></>} />;
  return (
    <section className="x-card" aria-label="Open positions">
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl" data-testid="desk-open">
          <thead><tr><th>Contract</th><th>Account</th><th>Side</th><th className="n">Size</th><th className="n">Entry</th><th className="n">Mark</th><th className="n">Open P&amp;L</th><th className="n">Liq.</th><th /></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={`${p.connectionId}-${p.symbol}`} data-testid={`desk-pos-${p.symbol}`}>
                <td><b>{p.symbol}</b>{p.copiedFrom && <Link href={`/copy/following/${p.copiedFrom.followId}`} className="x-tag trd-copied">Copy · {p.copiedFrom.leaderName}</Link>}</td>
                <td className="x-muted">{acct(p)}</td>
                <td><span className={`x-side x-side--${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side === 'LONG' ? 'Long' : 'Short'}</span></td>
                <td className="n m">{p.size}</td>
                <td className="n m">{price(p.avgEntry)}</td>
                <td className="n m">{price(p.markPrice)}</td>
                <td className={`n m ${toneOf(p.unrealizedPnl)}`}>{signedUsd(p.unrealizedPnl)}</td>
                <td className="n m">{price(p.liquidationPrice)}</td>
                <td className="trd-acts">
                  <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => onDetail({ title: `${p.symbol} position`, rows: [['Account', `${acct(p)} (${venueName(p.exchange)})`], ['Side', p.side], ['Size', `${p.size} contracts`], ['Entry', price(p.avgEntry)], ['Mark', price(p.markPrice)], ['Open P&L', signedUsd(p.unrealizedPnl)], ['Liquidation', price(p.liquidationPrice)], ['Copied from', p.copiedFrom?.leaderName ?? null]] })}>Details</button>
                  <button className="x-btn x-btn--sm" onClick={() => onClose(p)} data-testid={`desk-close-${p.symbol}`}>Close</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PendingTable({ rows, onDetail }: { rows: DeskPendingOrder[]; onDetail: (d: Detail) => void }) {
  if (!rows.length) return <Empty testId="desk-pending-empty" title="No pending orders" body="Limit and stop orders waiting on the exchange show up here." />;
  return (
    <section className="x-card" aria-label="Pending orders">
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl" data-testid="desk-pending">
          <thead><tr><th>Placed</th><th>Contract</th><th>Account</th><th>Side</th><th>Type</th><th className="n">Size</th><th className="n">Filled</th><th className="n">Price</th><th /></tr></thead>
          <tbody>
            {rows.map(o => (
              <tr key={`${o.connectionId}-${o.exchangeOrderId}`}>
                <td>{when(o.createdAt)}</td>
                <td><b>{o.symbol}</b>{o.reduceOnly && <span className="x-muted"> · reduce-only</span>}</td>
                <td className="x-muted">{acct(o)}</td>
                <td><span className={o.side === 'BUY' ? 'pos' : 'neg'}>{o.side === 'BUY' ? 'Buy' : 'Sell'}</span></td>
                <td>{o.type.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="n m">{o.qty}</td>
                <td className="n m">{o.filledQty}</td>
                <td className="n m">{price(o.limitPrice ?? o.stopPrice)}</td>
                <td className="trd-acts"><button className="x-btn x-btn--sm x-btn--ghost" onClick={() => onDetail({ title: `${o.symbol} order`, rows: [['Account', acct(o)], ['Type', o.type], ['Side', o.side], ['Size', String(o.qty)], ['Filled', String(o.filledQty)], ['Limit price', o.limitPrice != null ? price(o.limitPrice) : null], ['Stop price', o.stopPrice != null ? price(o.stopPrice) : null], ['Placed', when(o.createdAt)], ['Order ID', o.exchangeOrderId], ['Client order ID', o.clientOrderId]] })}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClosedTable({ rows, onDetail }: { rows: DeskClosedTrade[]; onDetail: (d: Detail) => void }) {
  if (!rows.length) return <Empty testId="desk-closed-empty" title="No closed trades in the last 30 days" body="Trades show here once a position goes back to flat. Positions opened before the last 30 days aren't counted." />;
  return (
    <section className="x-card" aria-label="Closed trades">
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl" data-testid="desk-closed">
          <thead><tr><th>Closed</th><th>Contract</th><th>Account</th><th>Side</th><th className="n">Size</th><th className="n">Entry</th><th className="n">Exit</th><th className="n">Held</th><th className="n">P&amp;L</th><th /></tr></thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={`${t.connectionId}-${t.closedAt}-${i}`}>
                <td>{when(t.closedAt)}</td>
                <td><b>{t.symbol}</b></td>
                <td className="x-muted">{acct(t)}</td>
                <td><span className={`x-side x-side--${t.side === 'LONG' ? 'long' : 'short'}`}>{t.side === 'LONG' ? 'Long' : 'Short'}</span></td>
                <td className="n m">{t.qty}</td>
                <td className="n m">{price(t.avgEntry)}</td>
                <td className="n m">{price(t.avgExit)}</td>
                <td className="n m">{hold(t.openedAt, t.closedAt)}</td>
                <td className={`n m ${toneOf(t.pnlUsd)}`}>{signedUsd(t.pnlUsd)}</td>
                <td className="trd-acts"><button className="x-btn x-btn--sm x-btn--ghost" onClick={() => onDetail({ title: `${t.symbol} trade`, rows: [['Account', acct(t)], ['Side', t.side], ['Size', `${t.qty} contracts (largest)`], ['Average entry', price(t.avgEntry)], ['Average exit', price(t.avgExit)], ['Opened', when(t.openedAt)], ['Closed', when(t.closedAt)], ['P&L', `${signedUsd(t.pnlUsd)} before fees and funding`]] })}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<string, string> = { FILLED: 'x-tag--g', PARTIAL: 'x-tag--g', REJECTED: 'x-tag--r', SKIPPED: '', CANCELLED: '', OPEN: '', SUBMITTED: '', PENDING: '' };

function OrderLog({ status, onDetail }: { status: DeskOrderStatus; onDetail: (d: Detail) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<DeskOrder[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const first = useLoad(async () => {
    const p = await tradingApi.orders({ status });
    setItems(p.items);
    setCursor(p.nextCursor);
    return p;
  }, [status]);
  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const p = await tradingApi.orders({ status, cursor });
      setItems(x => [...(x ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } catch {
      toast.error('Could not load more');
    } finally {
      setMore(false);
    }
  }
  if (first.error) return <ErrorCard message={first.error} onRetry={first.reload} />;
  if (!items) return <div className="x-skel cp-skel-table" />;
  if (!items.length) return status === 'rejected'
    ? <Empty testId="desk-rejected-empty" title="Nothing rejected" body="Orders the exchange turned down in the last 30 days show here, with its reason." />
    : <Empty testId="desk-log-empty" title="No orders yet" body="Every order TRADElogs sends for you, by hand or from a copy, is logged here with the exchange's answer." />;
  return (
    <section className="x-card" aria-label={status === 'rejected' ? 'Rejected orders' : 'Order log'}>
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl" data-testid={status === 'rejected' ? 'desk-rejected' : 'desk-log'}>
          <thead><tr><th>Sent</th><th>Contract</th><th>Account</th><th>From</th><th>Side</th><th className="n">Size</th><th className="n">Filled</th><th className="n">Avg price</th><th>Result</th><th /></tr></thead>
          <tbody>
            {items.map(o => (
              <tr key={o.id}>
                <td>{when(o.requestedAt)}</td>
                <td><b>{o.symbol}</b>{o.reduceOnly && <span className="x-muted"> · close</span>}</td>
                <td className="x-muted">{acct(o)}</td>
                <td>{o.source === 'COPY' ? `Copy${o.leaderName ? ` · ${o.leaderName}` : ''}` : o.source === 'MANUAL' ? 'You' : o.source.toLowerCase()}</td>
                <td><span className={o.side === 'BUY' ? 'pos' : 'neg'}>{o.side === 'BUY' ? 'Buy' : 'Sell'}</span></td>
                <td className="n m">{o.qty}</td>
                <td className="n m">{o.filledQty}</td>
                <td className="n m">{price(o.avgFillPrice)}</td>
                <td><span className={`x-tag ${STATUS_TONE[o.status] ?? ''}`}>{o.status.toLowerCase()}</span>{o.error && <small className="trd-why" title={o.error}>{o.error}</small>}</td>
                <td className="trd-acts"><button className="x-btn x-btn--sm x-btn--ghost" onClick={() => onDetail({ title: `${o.symbol} order`, rows: [['Account', acct(o)], ['From', o.source === 'COPY' ? `Copy of ${o.leaderName ?? 'a leader'}` : o.source], ['Type', `${o.type}${o.reduceOnly ? ', reduce-only' : ''}`], ['Side', o.side], ['Size', String(o.qty)], ['Filled', String(o.filledQty)], ['Average price', o.avgFillPrice != null ? price(o.avgFillPrice) : null], ['Result', o.status], ['Exchange said', o.error], ['Sent', when(o.requestedAt)], ['Filled at', o.filledAt ? when(o.filledAt) : null], ['Order ID', o.exchangeOrderId], ['Client order ID', o.clientOrderId]] })}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && <button className="x-btn cp-more-btn" onClick={() => void loadMore()} disabled={more}>{more ? 'Loading…' : 'Show more'}</button>}
    </section>
  );
}

function CloseDialog({ p, onClose, onDone }: { p: DeskPosition; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [qty, setQty] = useState(String(p.size));
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = Number(qty);
  const whole = Math.floor(n);
  const valid = Number.isFinite(n) && whole >= 1;
  const partial = valid && Math.min(whole, p.size) < p.size;
  async function go() {
    setBusy(true); setErr('');
    try {
      const r = await tradingApi.close({ connectionId: p.connectionId, symbol: p.symbol, qty: Math.min(whole, p.size), confirmCopied: !!p.copiedFrom && ack });
      onDone(r.message, r.order.status === 'FILLED' || r.order.status === 'PARTIAL' || r.order.status === 'SUBMITTED');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reach the exchange. Nothing was sent.');
      setBusy(false);
    }
  }
  return (
    <Modal title={`Close ${p.symbol}`} sub={`${p.side === 'LONG' ? 'Long' : 'Short'} ${p.size} on ${acct(p)}`} onClose={onClose} busy={busy} testId="desk-close-dialog"
      footer={<>
        <button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="x-btn x-btn--hi" onClick={() => void go()} disabled={busy || !valid || (!!p.copiedFrom && !ack)} data-testid="desk-close-submit">
          {busy ? 'Closing…' : partial ? `Close ${whole} of ${p.size}` : 'Close position'}
        </button>
      </>}>
      <div className="x-field">
        <label htmlFor="desk-qty">Contracts to close</label>
        <input id="desk-qty" className="x-input m" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="desk-close-qty" />
      </div>
      <div className="trd-quick">
        {[0.25, 0.5, 1].map(f => { const v = Math.max(1, Math.floor(p.size * f)); return <button key={f} type="button" className="x-btn x-btn--sm" onClick={() => setQty(String(v))}>{f === 1 ? 'All' : `${f * 100}%`}</button>; })}
      </div>
      <p className="cp-fine">A market order on the closing side only, so it can never open a new position. Delta trades whole contracts: decimals round down{valid && whole > p.size ? `, and more than ${p.size} closes just ${p.size}` : ''}. The fill price can differ from the mark.</p>
      {p.environment === 'LIVE' && <p className="cp-err">This is a real-money account.</p>}
      {p.copiedFrom && (
        <label className="cp-accept">
          <input type="checkbox" className="x-check" checked={ack} onChange={e => setAck(e.target.checked)} data-testid="desk-close-ack" />
          <span>This position is copied from <b>{p.copiedFrom.leaderName}</b>. Close it anyway; the copy will treat it as changed by hand.</span>
        </label>
      )}
      {err && <p className="cp-err" role="alert" data-testid="desk-close-error">{err}</p>}
      <p className="x-muted trd-fine">Mark {price(p.markPrice)} · open P&amp;L {signedUsd(p.unrealizedPnl)}</p>
    </Modal>
  );
}

function DetailSheet({ d, onClose }: { d: Detail; onClose: () => void }) {
  const toast = useToast();
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).then(() => toast.success('Copied'), () => toast.error('Could not copy')); };
  return (
    <Modal title={d.title} onClose={onClose} testId="desk-detail">
      <dl className="trd-dl">
        {d.rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd className="m">{v}{/ID$/.test(k) && <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => copy(v!)} aria-label={`Copy ${k}`}>Copy</button>}</dd></div>
        ))}
      </dl>
    </Modal>
  );
}
