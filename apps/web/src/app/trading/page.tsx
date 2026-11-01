'use client';

// Trading desk (Part D): every exchange account's positions in one place.
// Open / Pending / Closed / Rejected with counts (D1), close all or part of a
// position (D3, D4), close several or all at once (D7, D8), a details sheet
// with copyable IDs (D9), and the filterable, exportable log of every order we
// sent with its KPIs (D2, D12).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad, usePoll } from '@/components/v6/copy/parts';
import OrderTicketDialog from '@/components/v6/trading/order-ticket';
import { ApiError, exchangesApi, price, signedUsd, toneOf, tradingApi, usd, venueName, type CloseManyResult, type DeskClosedTrade, type DeskOrder, type DeskOrderFilters, type DeskOrderStatus, type DeskPendingOrder, type DeskPosition } from '@/lib/copy-api';
import '@/styles/v6/copy.css';

type Tab = 'open' | 'pending' | 'closed' | 'rejected' | 'log';
type Detail = { title: string; rows: Array<[string, string | null]> };
type Quick = { symbol: string; side: '' | 'LONG' | 'SHORT' | 'BUY' | 'SELL' };
const posKey = (p: { connectionId: string; symbol: string }) => `${p.connectionId}:${p.symbol}`;
/** Contract text and side, matched loosely so "btc" finds BTCUSD. */
function quickMatch(q: Quick, symbol: string, side: string): boolean {
  if (q.symbol.trim() && !symbol.toUpperCase().includes(q.symbol.trim().toUpperCase())) return false;
  return !q.side || q.side === side;
}

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
  const [bulk, setBulk] = useState<{ rows: DeskPosition[]; all: boolean } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [quick, setQuick] = useState<Quick>({ symbol: '', side: '' });
  const [ticket, setTicket] = useState(false);
  const [cancelling, setCancelling] = useState<DeskPendingOrder | null>(null);

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
  const positions = useMemo(() => (d?.positions ?? []).filter(p => quickMatch(quick, p.symbol, p.side)), [d, quick]);
  const pending = useMemo(() => (d?.pending ?? []).filter(o => quickMatch({ ...quick, side: quick.side === 'LONG' ? 'BUY' : quick.side === 'SHORT' ? 'SELL' : quick.side }, o.symbol, o.side)), [d, quick]);
  const closed = useMemo(() => (d?.closed ?? []).filter(t => quickMatch(quick, t.symbol, t.side)), [d, quick]);
  const filtering = !!quick.symbol.trim() || !!quick.side;

  return (
    <AppShell legacy={false} pageTitle="Positions" pageSubtitle="Your exchange accounts: what's open, waiting and done"
      actions={<>
        <button className="x-btn" onClick={() => void desk.reload()} disabled={desk.loading} data-testid="desk-refresh">{desk.loading ? 'Refreshing…' : 'Refresh'}</button>
        <button className="x-btn x-btn--hi" onClick={() => setTicket(true)} data-testid="desk-new-order">New order</button>
      </>}>
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

        {(tab === 'open' || tab === 'pending' || tab === 'closed') && d && (
          <div className="trd-filters" data-testid="desk-quick-filter">
            <input className="x-input" placeholder="Contract, e.g. BTC" value={quick.symbol} onChange={e => setQuick(q => ({ ...q, symbol: e.target.value }))} aria-label="Filter by contract" data-testid="desk-quick-symbol" />
            <div className="x-seg x-seg--sm" role="group" aria-label="Filter by side">
              {(['', 'LONG', 'SHORT'] as const).map(sd => <button key={sd || 'all'} type="button" aria-pressed={quick.side === sd} onClick={() => setQuick(q => ({ ...q, side: sd }))}>{sd === '' ? 'Both' : sd === 'LONG' ? 'Long / buy' : 'Short / sell'}</button>)}
            </div>
            {filtering && <button type="button" className="x-link" onClick={() => setQuick({ symbol: '', side: '' })}>Clear</button>}
          </div>
        )}

        {desk.error ? <ErrorCard message={desk.error} onRetry={desk.reload} /> : !d && tab !== 'log' && tab !== 'rejected' ? (
          <div className="x-skel cp-skel-table" />
        ) : tab === 'open' ? (
          filtering && !positions.length && d!.positions.length ? <Empty testId="desk-filter-empty" title="Nothing matches" body="No open position matches this filter." /> :
          <OpenTable rows={positions} onClose={setClosing} onDetail={setDetail} onBulk={(rows, all) => setBulk({ rows, all })} />
        ) : tab === 'pending' ? (
          <PendingTable rows={pending} onDetail={setDetail} onCancel={setCancelling} />
        ) : tab === 'closed' ? (
          <ClosedTable rows={closed} onDetail={setDetail} />
        ) : (
          <OrderLog key={tab} status={tab === 'rejected' ? 'rejected' : 'all'} onDetail={setDetail} />
        )}
        <p className="cp-note">Prices and sizes come straight from the exchange. Sizes are in contracts.</p>
      </div>

      {closing && (
        <CloseDialog p={closing} onClose={() => setClosing(null)}
          onDone={(msg, ok) => { setClosing(null); (ok ? toast.success : toast.error)(msg); void desk.reload(); }} />
      )}
      {!ticket && <button className="trd-fab" onClick={() => setTicket(true)} aria-label="Quick trade" data-testid="desk-quick-trade">Quick trade</button>}
      {ticket && <OrderTicketDialog onClose={() => setTicket(false)} onPlaced={() => void desk.reload()} />}
      {bulk && (
        <BulkCloseDialog rows={bulk.rows} all={bulk.all} onClose={() => setBulk(null)}
          onDone={() => { setBulk(null); void desk.reload(); }} />
      )}
      {cancelling && <CancelDialog o={cancelling} onClose={() => setCancelling(null)} onDone={(msg, ok) => { setCancelling(null); (ok ? toast.success : toast.error)(msg); void desk.reload(); }} />}
      {detail && <DetailSheet d={detail} onClose={() => setDetail(null)} />}
    </AppShell>
  );
}

function Empty({ title, body, testId }: { title: string; body: React.ReactNode; testId: string }) {
  return <div className="x-card x-empty" data-testid={testId}><b>{title}</b><p>{body}</p></div>;
}

function OpenTable({ rows, onClose, onDetail, onBulk }: { rows: DeskPosition[]; onClose: (p: DeskPosition) => void; onDetail: (d: Detail) => void; onBulk: (rows: DeskPosition[], all: boolean) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Only rows still on screen count as selected (a refresh can close or filter some away).
  const picked = rows.filter(p => sel.has(posKey(p)));
  const allOn = rows.length > 0 && picked.length === rows.length;
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (!rows.length) return <Empty testId="desk-open-empty" title="No open positions" body={<>Nothing is open on your connected exchange accounts. <Link className="x-link" href="/exchanges">Exchanges</Link></>} />;
  return (
    <section className="x-card" aria-label="Open positions">
      <div className="trd-bulkbar">
        <span className="x-muted">{picked.length ? `${picked.length} selected` : `${rows.length} open`}</span>
        <button className="x-btn x-btn--sm" disabled={!picked.length} onClick={() => onBulk(picked, false)} data-testid="desk-close-selected">Close selected{picked.length ? ` (${picked.length})` : ''}</button>
        <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={() => onBulk(rows, true)} data-testid="desk-close-all">Close all</button>
      </div>
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl" data-testid="desk-open">
          <thead><tr><th className="trd-ck"><input type="checkbox" className="x-check" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map(posKey)))} aria-label="Select all positions" data-testid="desk-select-all" /></th><th>Contract</th><th>Account</th><th>Side</th><th className="n">Size</th><th className="n">Entry</th><th className="n">Mark</th><th className="n">Open P&amp;L</th><th className="n">Liq.</th><th /></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={`${p.connectionId}-${p.symbol}`} data-testid={`desk-pos-${p.symbol}`} className={sel.has(posKey(p)) ? 'trd-on' : ''}>
                <td className="trd-ck"><input type="checkbox" className="x-check" checked={sel.has(posKey(p))} onChange={() => toggle(posKey(p))} aria-label={`Select ${p.symbol} on ${p.connectionLabel}`} data-testid={`desk-select-${p.symbol}`} /></td>
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

function PendingTable({ rows, onDetail, onCancel }: { rows: DeskPendingOrder[]; onDetail: (d: Detail) => void; onCancel: (o: DeskPendingOrder) => void }) {
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
                <td className="trd-acts"><button className="x-btn x-btn--sm" onClick={() => onCancel(o)} data-testid={`desk-cancel-${o.exchangeOrderId}`}>Cancel</button><button className="x-btn x-btn--sm x-btn--ghost" onClick={() => onDetail({ title: `${o.symbol} order`, rows: [['Account', acct(o)], ['Type', o.type], ['Side', o.side], ['Size', String(o.qty)], ['Filled', String(o.filledQty)], ['Limit price', o.limitPrice != null ? price(o.limitPrice) : null], ['Stop price', o.stopPrice != null ? price(o.stopPrice) : null], ['Placed', when(o.createdAt)], ['Order ID', o.exchangeOrderId], ['Client order ID', o.clientOrderId]] })}>Details</button></td>
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

const SOURCES: Array<{ id: '' | DeskOrder['source']; label: string }> = [{ id: '', label: 'Any source' }, { id: 'MANUAL', label: 'You' }, { id: 'COPY', label: 'Copies' }];
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function OrderLog({ status, onDetail }: { status: DeskOrderStatus; onDetail: (d: Detail) => void }) {
  const toast = useToast();
  // The Rejected tab's badge counts the last 30 days, so its list starts there too.
  const initial: DeskOrderFilters = { status, ...(status === 'rejected' ? { from: localDay(new Date(Date.now() - 30 * 86400_000)) } : {}) };
  const [draft, setDraft] = useState<DeskOrderFilters>(initial);
  const [applied, setApplied] = useState<DeskOrderFilters>(initial);
  const [items, setItems] = useState<DeskOrder[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const key = JSON.stringify(applied);
  const accounts = useLoad(() => exchangesApi.list(), []);
  const summary = useLoad(() => tradingApi.summary(applied), [key]);
  const first = useLoad(async () => {
    setItems(null);
    const p = await tradingApi.orders(applied);
    setItems(p.items);
    setCursor(p.nextCursor);
    return p;
  }, [key]);
  const badRange = !!draft.from && !!draft.to && draft.from > draft.to;
  const dirty = JSON.stringify(draft) !== key;
  const isDefault = JSON.stringify(applied) === JSON.stringify(initial);
  const set = <K extends keyof DeskOrderFilters>(k: K, v: DeskOrderFilters[K]) => setDraft(f => ({ ...f, [k]: v || undefined }));
  const apply = () => { if (!badRange) setApplied(draft); };

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const p = await tradingApi.orders({ ...applied, cursor });
      setItems(x => [...(x ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } catch {
      toast.error('Could not load more');
    } finally {
      setMore(false);
    }
  }
  async function exportCsv() {
    setExporting(true);
    try {
      const r = await tradingApi.exportCsv(applied);
      toast.success(r.truncated ? `Exported the newest ${r.rows} orders (the most one file holds). Narrow the filters for the rest.` : `Exported ${r.rows} ${r.rows === 1 ? 'order' : 'orders'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const sm = summary.data;
  return (
    <>
      <form className="trd-filters trd-filters--log" onSubmit={e => { e.preventDefault(); apply(); }} data-testid="desk-log-filters">
        <input className="x-input" placeholder="Contract" value={draft.symbol ?? ''} onChange={e => set('symbol', e.target.value)} aria-label="Contract" data-testid="log-f-symbol" />
        <select className="x-input" value={draft.side ?? ''} onChange={e => set('side', e.target.value as DeskOrderFilters['side'])} aria-label="Side" data-testid="log-f-side">
          <option value="">Buy and sell</option><option value="BUY">Buy</option><option value="SELL">Sell</option>
        </select>
        <select className="x-input" value={draft.source ?? ''} onChange={e => set('source', e.target.value as DeskOrderFilters['source'])} aria-label="Source" data-testid="log-f-source">
          {SOURCES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select className="x-input" value={draft.connectionId ?? ''} onChange={e => set('connectionId', e.target.value)} aria-label="Account" data-testid="log-f-account">
          <option value="">All accounts</option>
          {(accounts.data ?? []).map(c => <option key={c.id} value={c.id}>{c.label}{c.environment === 'TESTNET' ? ' (testnet)' : ''}</option>)}
        </select>
        <label className="trd-date"><span>From</span><input type="date" className="x-input" value={draft.from ?? ''} max={draft.to} onChange={e => set('from', e.target.value)} data-testid="log-f-from" /></label>
        <label className="trd-date"><span>To</span><input type="date" className="x-input" value={draft.to ?? ''} min={draft.from} onChange={e => set('to', e.target.value)} data-testid="log-f-to" /></label>
        <input className="x-input m" placeholder="Order ID" value={draft.q ?? ''} onChange={e => set('q', e.target.value)} aria-label="Exact order ID" data-testid="log-f-q" />
        <button type="submit" className="x-btn x-btn--sm x-btn--hi" disabled={!dirty || badRange} data-testid="log-f-apply">Apply</button>
        {!isDefault && <button type="button" className="x-link" onClick={() => { setDraft(initial); setApplied(initial); }} data-testid="log-f-clear">Reset</button>}
        <button type="button" className="x-btn x-btn--sm trd-export" onClick={() => void exportCsv()} disabled={exporting || !items?.length} data-testid="log-export">{exporting ? 'Exporting…' : 'Export CSV'}</button>
      </form>
      {badRange && <p className="cp-err" role="alert">The start date is after the end date.</p>}

      <div className="x-strip x-strip--card trd-strip" style={{ ['--n' as string]: 5 }} data-testid="log-kpis">
        <div><span>Placed</span><b className="m">{sm ? sm.placed : '—'}</b>{sm && sm.skipped > 0 && <small>{sm.skipped} not sent</small>}</div>
        <div><span>Filled</span><b className="m">{sm ? sm.filled : '—'}</b>{sm && sm.partial > 0 && <small>+{sm.partial} partly</small>}</div>
        <div><span>Rejected</span><b className={`m ${sm && sm.rejected ? 'neg' : ''}`}>{sm ? sm.rejected : '—'}</b></div>
        <div><span>In flight</span><b className="m">{sm ? sm.inFlight : '—'}</b></div>
        <div><span>Filled value</span><b className="m">{sm ? (sm.filledNotionalUsd == null ? '—' : usd(sm.filledNotionalUsd, 0)) : '—'}</b>{sm && sm.filledNotionalUsd == null && <small>a contract size couldn&rsquo;t be read</small>}</div>
      </div>

      {first.error ? <ErrorCard message={first.error} onRetry={first.reload} /> : !items ? <div className="x-skel cp-skel-table" /> : !items.length ? (
        !isDefault ? <Empty testId="desk-log-nomatch" title="No orders match" body="Try a wider date range or fewer filters." />
          : status === 'rejected'
            ? <Empty testId="desk-rejected-empty" title="Nothing rejected" body="Orders the exchange turned down in the last 30 days show here, with its reason." />
            : <Empty testId="desk-log-empty" title="No orders yet" body="Every order TRADElogs sends for you, by hand or from a copy, is logged here with the exchange's answer." />
      ) : (
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
          {cursor && <button className="x-btn cp-more-btn" onClick={() => void loadMore()} disabled={more} data-testid="log-more">{more ? 'Loading…' : 'Show more'}</button>}
        </section>
      )}
    </>
  );
}

/**
 * Close several positions (D7) or all of them (D8). "All" needs the words typed
 * out; copied positions need their own tick. Results stay on screen per row.
 */
function BulkCloseDialog({ rows, all, onClose, onDone }: { rows: DeskPosition[]; all: boolean; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CloseManyResult | null>(null);
  const [err, setErr] = useState('');
  const copied = rows.filter(p => p.copiedFrom);
  const live = rows.some(p => p.environment === 'LIVE');
  const ready = (!all || typed.trim().toUpperCase() === 'CLOSE ALL') && (!copied.length || ack);
  async function go() {
    setBusy(true); setErr('');
    try {
      setRes(await tradingApi.closeMany({ items: rows.map(p => ({ connectionId: p.connectionId, symbol: p.symbol })), confirmCopied: copied.length ? ack : undefined }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reach the server. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  }
  const okN = res?.results.filter(r => r.ok).length ?? 0;
  return (
    <Modal title={all ? 'Close all positions' : `Close ${rows.length} ${rows.length === 1 ? 'position' : 'positions'}`} wide
      sub={res ? `${okN} of ${res.results.length} closed` : 'Each one is a market order on the closing side, sent one after another.'}
      onClose={res ? onDone : onClose} busy={busy} testId="desk-bulk-dialog"
      footer={res ? <button className="x-btn x-btn--hi" onClick={onDone} data-testid="desk-bulk-done">Done</button> : <>
        <button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="x-btn x-btn--hi cp-del" onClick={() => void go()} disabled={busy || !ready} data-testid="desk-bulk-submit">{busy ? 'Closing…' : all ? 'Close everything' : `Close ${rows.length}`}</button>
      </>}>
      <ul className="trd-bulklist" data-testid="desk-bulk-list">
        {rows.map(p => {
          const r = res?.results.find(x => x.connectionId === p.connectionId && x.symbol === p.symbol);
          return (
            <li key={posKey(p)}>
              <span><b>{p.symbol}</b> <span className={`x-side x-side--${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side === 'LONG' ? 'Long' : 'Short'} {p.size}</span> <span className="x-muted">{acct(p)}</span>{p.copiedFrom && <span className="x-tag">Copy · {p.copiedFrom.leaderName}</span>}</span>
              {r && <span className={r.ok ? 'pos' : 'neg'} data-testid={`desk-bulk-result-${p.symbol}`}>{r.message}</span>}
            </li>
          );
        })}
      </ul>
      {!res && <>
        {live && <p className="cp-err">Some of these are real-money accounts.</p>}
        {copied.length > 0 && (
          <label className="cp-accept">
            <input type="checkbox" className="x-check" checked={ack} onChange={e => setAck(e.target.checked)} data-testid="desk-bulk-ack" />
            <span>{copied.length === 1 ? 'One of these is' : `${copied.length} of these are`} copied from a leader. Close {copied.length === 1 ? 'it' : 'them'} anyway; the copy will treat {copied.length === 1 ? 'it' : 'them'} as changed by hand.</span>
          </label>
        )}
        {all && (
          <div className="x-field">
            <label htmlFor="desk-typed">Type <b className="m">CLOSE ALL</b> to confirm</label>
            <input id="desk-typed" className="x-input m" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" data-testid="desk-bulk-typed" />
          </div>
        )}
        {err && <p className="cp-err" role="alert">{err}</p>}
      </>}
    </Modal>
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

function CancelDialog({ o, onClose, onDone }: { o: DeskPendingOrder; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await tradingApi.cancel({ connectionId: o.connectionId, symbol: o.symbol, exchangeOrderId: o.exchangeOrderId });
      onDone(r.message, true);
    } catch (e) {
      onDone(e instanceof Error ? e.message : 'Could not cancel', false);
    }
  }
  const what = `${o.side === 'BUY' ? 'Buy' : 'Sell'} ${o.qty} ${o.symbol} ${o.type.replace(/_/g, ' ').toLowerCase()}${o.limitPrice != null ? ` at ${price(o.limitPrice)}` : o.stopPrice != null ? ` triggering at ${price(o.stopPrice)}` : ''}`;
  return (
    <Modal title="Cancel order?" sub={what} onClose={onClose} busy={busy} testId="desk-cancel-dialog"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Keep it</button><button className="x-btn x-btn--hi cp-del" onClick={() => void go()} disabled={busy} data-testid="desk-cancel-confirm">{busy ? 'Cancelling…' : 'Cancel order'}</button></>}>
      <p className="cp-fine">{o.reduceOnly && (o.type.startsWith('STOP') || o.type.startsWith('TAKE')) ? 'This is a take-profit or stop-loss: cancelling it leaves the position without that protection.' : 'Anything already filled stays filled.'}</p>
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
