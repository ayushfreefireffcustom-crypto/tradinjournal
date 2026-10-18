'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';
import { api, type BrokerAccount, type Deal, type Trade } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';
import { useToast } from '@/components/toast';
import { IDownload, ISearch, IChevronDown, IClose } from '@/components/v3/icons';
import { money, price, stamp, dur, tone } from '@/components/v3/format';

type Filter = 'ALL' | 'LONG' | 'SHORT' | 'WIN' | 'LOSS';
type SortKey = 'open' | 'net' | 'held' | 'symbol';
const FILTERS: [Filter, string][] = [['ALL', 'All'], ['LONG', 'Long'], ['SHORT', 'Short'], ['WIN', 'Win'], ['LOSS', 'Loss']];
const PAGE = 50;
const BAD_TAG = /revenge|fomo|tilt|hold.?loser|mistake|overtrad|chase/i;

const tagLabel = (t: string) => `#${t.trim().toLowerCase().replace(/\s+/g, '-')}`;

function SortTh({ k, label, cur, dir, onSort, className }: { k: SortKey; label: string; cur: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`v3-sort ${active ? 'on' : ''}`} onClick={() => onSort(k)} data-testid={`sort-${k}`}>
        {label}
        <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden><path d="M4.5 1v10M1.5 4l3-3 3 3" className="up" /><path d="M1.5 8l3 3 3-3" className="dn" /></svg>
      </button>
    </th>
  );
}

export default function TradesPage() {
  const router = useRouter();
  const toast = useToast();
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [tab, setTab] = useState<'trades' | 'deals'>('trades');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('open');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [shown, setShown] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [t, d, j] = await Promise.all([api.trades.list(acc.id), api.trades.deals(acc.id), api.journal.list(acc.id)]);
      const tagsByTrade = new Map(j.filter(e => e.tradeId).map(e => [e.tradeId as string, e.tags]));
      setTrades(t.map(trade => ({ ...trade, tags: tagsByTrade.get(trade.positionId) ?? trade.tags })));
      setDeals(d);
      setSyncedAt(new Date().toISOString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (selected) loadTrades(selected);
    else if (!accountsLoading) setLoading(false); // zero brokers: don’t load forever
  }, [selected, accountsLoading, loadTrades]);
  useEffect(() => setShown(PAGE), [filter, symbolFilter, search, sortKey, sortDir, tab]);

  const symbols = useMemo(() => Array.from(new Set(trades.map(t => t.symbol))).sort(), [trades]);
  const counts = useMemo(() => ({
    ALL: trades.length,
    LONG: trades.filter(t => t.direction === 'LONG').length,
    SHORT: trades.filter(t => t.direction === 'SHORT').length,
    WIN: trades.filter(t => t.netPnl > 0).length,
    LOSS: trades.filter(t => t.netPnl <= 0).length,
  }), [trades]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = trades.filter(t => {
      if (filter === 'LONG' && t.direction !== 'LONG') return false;
      if (filter === 'SHORT' && t.direction !== 'SHORT') return false;
      if (filter === 'WIN' && t.netPnl <= 0) return false;
      if (filter === 'LOSS' && t.netPnl > 0) return false;
      if (symbolFilter !== 'ALL' && t.symbol !== symbolFilter) return false;
      if (q && !t.symbol.toLowerCase().includes(q) && !(t.tags ?? []).some(g => g.toLowerCase().includes(q))) return false;
      return true;
    });
    const val = (t: Trade): number | string =>
      sortKey === 'symbol' ? t.symbol : sortKey === 'net' ? t.netPnl : sortKey === 'held' ? t.durationSecs ?? -1 : new Date(t.openTime).getTime();
    return f.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === 'asc' ? c : -c;
    });
  }, [trades, filter, symbolFilter, search, sortKey, sortDir]);
  const filteredPnl = useMemo(() => sorted.reduce((s, t) => s + t.netPnl, 0), [sorted]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc'); }
  }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a); setShowConnect(false);
  }

  function exportCsv() {
    const acc = selected?.broker.replace(/\s+/g, '-').toLowerCase() ?? 'account';
    if (tab === 'deals') {
      const headers = ['Deal Ticket', 'Position ID', 'Symbol', 'Type', 'Entry', 'Volume', 'Price', 'Profit', 'Commission', 'Swap', 'Deal Time'];
      const rows = deals.map(d => [d.dealTicket, d.positionId, d.symbol, d.type, d.entry, d.volume, d.price, d.profit, d.commission, d.swap, d.dealTime]);
      downloadCsv(`tradelogs-deals-${acc}-${dateStamp()}.csv`, toCsv(headers, rows));
      toast.success(`Exported ${deals.length} deals to CSV`);
      return;
    }
    const headers = ['Position ID', 'Symbol', 'Direction', 'Status', 'Open Time', 'Close Time', 'Volume', 'Entry Price', 'Exit Price', 'Gross P&L', 'Commission', 'Swap', 'Net P&L', 'Duration (s)', 'Tags'];
    const rows = sorted.map(t => [
      t.positionId, t.symbol, t.direction, t.status, t.openTime, t.closeTime ?? '', t.volume,
      t.entryPrice, t.exitPrice ?? '', t.grossPnl, t.commission, t.swap, t.netPnl, t.durationSecs ?? '',
      (t.tags ?? []).join('; '),
    ]);
    downloadCsv(`tradelogs-trades-${acc}-${dateStamp()}.csv`, toCsv(headers, rows));
    toast.success(`Exported ${sorted.length} trades to CSV`);
  }

  const open = (t: Trade) => selected && router.push(`/trades/${t.positionId}?account=${encodeURIComponent(selected.id)}`);
  const exportDisabled = (tab === 'deals' ? deals.length : sorted.length) === 0;
  const filtersOn = filter !== 'ALL' || symbolFilter !== 'ALL' || search.trim() !== '';

  const actions = (
    <>
      {syncedAt && <span className="d-synced">Synced {timeAgo(syncedAt).toLowerCase()}</span>}
      <button className="v3-btn v3-btn--o t-export" onClick={exportCsv} disabled={exportDisabled} data-testid="export-csv">
        <IDownload size={16} /><span>Export CSV</span>
      </button>
    </>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Trade log" actions={actions}>
      <div className="v3-page" data-testid="trades-page">
        <header className="t-head">
          <div>
            <h1 className="v3-h1 t-h1"><span className="num">{loading && !trades.length ? '—' : trades.length}</span> <em>position{trades.length === 1 ? '' : 's'}.</em></h1>
            <p className="v3-sub">Reconstructed from {deals.length} deal{deals.length === 1 ? '' : 's'}{selected ? ` · ${selected.broker}` : ''}</p>
          </div>
          <div className="v3-seg t-filter" role="group" aria-label="Filter positions">
            {FILTERS.map(([f, l]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); if (tab !== 'trades') setTab('trades'); }} data-testid={`filter-${f.toLowerCase()}`}>
                {l}<small className="num">{counts[f]}</small>
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="d-err" role="alert" data-testid="trades-error" style={{ marginBottom: 18 }}>
            <span>{error}</span>
            <button className="v3-btn v3-btn--o" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        <section className="v3-card t-card">
          <div className="t-bar">
            <div className="v3-seg" role="tablist" aria-label="View">
              <button role="tab" aria-selected={tab === 'trades'} aria-pressed={tab === 'trades'} onClick={() => setTab('trades')} data-testid="tab-trades">Positions</button>
              <button role="tab" aria-selected={tab === 'deals'} aria-pressed={tab === 'deals'} onClick={() => setTab('deals')} data-testid="tab-deals">Raw deals</button>
            </div>
            {tab === 'trades' && (
              <>
                <label className="v3-select">
                  <span className="sr-only">Symbol</span>
                  <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)} data-testid="symbol-filter">
                    <option value="ALL">All symbols</option>
                    {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <IChevronDown size={16} />
                </label>
                <label className="v3-field t-search">
                  <ISearch size={16} />
                  <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or tag…" data-testid="symbol-search"
                    onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }} />
                  {search && <button aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus(); }}><IClose size={14} /></button>}
                </label>
              </>
            )}
            <span className="t-count" data-testid="showing-count">
              {tab === 'trades'
                ? <>Showing <b className="num">{Math.min(shown, sorted.length)}</b> of <span className="num">{sorted.length}</span>{filtersOn && sorted.length > 0 && <> · <b className={`num ${tone(filteredPnl)}`}>{money(filteredPnl)}</b></>}</>
                : <><b className="num">{deals.length}</b> deals</>}
            </span>
          </div>

          {tab === 'trades' ? (
            <div className="v3-tbl-wrap" data-testid="trades-table">
              <table className="v3-table t-table">
                <thead>
                  <tr>
                    <SortTh k="symbol" label="Symbol" cur={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th>Dir</th>
                    <th className="r c-vol">Volume</th>
                    <SortTh k="open" label="Open" cur={sortKey} dir={sortDir} onSort={toggleSort} className="c-open" />
                    <th className="c-close">Close</th>
                    <th className="r c-px">Entry</th>
                    <th className="r c-px">Exit</th>
                    <SortTh k="held" label="Held" cur={sortKey} dir={sortDir} onSort={toggleSort} className="r c-held" />
                    <SortTh k="net" label="Net P&L" cur={sortKey} dir={sortDir} onSort={toggleSort} className="r" />
                    <th className="c-tag">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !trades.length ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="sk">{Array.from({ length: 10 }).map((_, j) => <td key={j}><div className="skel d-sk" style={{ height: 12, width: 34 + ((i + j) % 4) * 14 }} /></td>)}</tr>
                    ))
                  ) : sorted.length === 0 ? (
                    <tr className="sk"><td colSpan={10}>
                      <div className="d-empty">
                        {trades.length === 0 ? <><b>No positions yet</b>Closed trades appear here after your next MT5 sync.</>
                          : <><b>No trades match these filters</b><button className="v3-link" onClick={() => { setFilter('ALL'); setSymbolFilter('ALL'); setSearch(''); }}>Clear filters</button></>}
                      </div>
                    </td></tr>
                  ) : (
                    sorted.slice(0, shown).map(t => {
                      const tag = t.tags?.[0];
                      return (
                        <tr key={t.positionId} tabIndex={0} onClick={() => open(t)} onKeyDown={e => { if (e.key === 'Enter') open(t); }} data-testid={`trade-row-${t.positionId}`}>
                          <td><div className="d-sym"><i>{t.symbol.slice(0, 2)}</i><span>{t.symbol}<small className="t-mdate num">{new Date(t.openTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {dur(t.durationSecs)}</small></span></div></td>
                          <td><span className={`d-side ${t.direction === 'LONG' ? 'L' : 'S'}`}>
                            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>{t.direction === 'LONG' ? <path d="M2 8L8 2M3.5 2H8v4.5" /> : <path d="M2 2l6 6M8 3.5V8H3.5" />}</svg>
                            {t.direction === 'LONG' ? 'Long' : 'Short'}</span></td>
                          <td className="r num mute c-vol">{t.volume.toFixed(2)}</td>
                          <td className="num mute c-open">{stamp(t.openTime)}</td>
                          <td className="num mute c-close">{t.status === 'OPEN' ? <span className="v3-pill v">Open</span> : stamp(t.closeTime)}</td>
                          <td className="r num c-px">{price(t.entryPrice)}</td>
                          <td className="r num c-px">{price(t.exitPrice)}</td>
                          <td className="r num mute c-held">{dur(t.durationSecs)}</td>
                          <td className={`r num ${tone(t.netPnl)}`} style={{ fontWeight: 700 }}>{money(t.netPnl)}</td>
                          <td className="c-tag">{tag ? <span className={`t-tag ${BAD_TAG.test(tag) ? 'bad' : ''}`}>{tagLabel(tag)}</span> : <span className="mute">—</span>}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {sorted.length > shown && (
                <div className="v3-tbl-foot">
                  <button className="v3-btn v3-btn--o" onClick={() => setShown(n => n + PAGE)} data-testid="load-more">Show {Math.min(PAGE, sorted.length - shown)} more</button>
                </div>
              )}
            </div>
          ) : (
            <DealsTable deals={deals} loading={loading && !deals.length} />
          )}
        </section>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
