'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';
import { api, type BrokerAccount, type Deal, type JournalEntry, type Trade } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';
import { useToast } from '@/components/toast';
import { IDownload, ISearch, IClose } from '@/components/v3/icons';
import { fmtUsd, fmtUsdCompact } from '@/lib/format';

const money = (v: number) => fmtUsd(v, { signed: true });
const moneyShort = (v: number) => fmtUsdCompact(v, { signed: true });
import { notesByTrade } from '@/lib/desk';
import { TradeLog, type SortKey } from '@/components/v6/trades/trade-log';
import { EXIT_LABEL, exitReasonOf, type ExitReason } from '@/lib/exit-reason';

type Filter = 'ALL' | 'LONG' | 'SHORT' | 'WIN' | 'LOSS';
const FILTERS: [Filter, string][] = [['ALL', 'All'], ['LONG', 'Long'], ['SHORT', 'Short'], ['WIN', 'Win'], ['LOSS', 'Loss']];
const PAGE = 50;

export default function TradesPage() {
  return <Suspense fallback={null}><TradeLogPage /></Suspense>;
}

function TradeLogPage() {
  const router = useRouter();
  // ?symbol=XAUUSD (from the ⌘K palette) opens the log filtered to that symbol.
  const symbolParam = useSearchParams().get('symbol');
  const toast = useToast();
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [tab, setTab] = useState<'trades' | 'deals'>('trades');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [symbolFilter, setSymbolFilter] = useState(symbolParam || 'ALL');
  useEffect(() => { if (symbolParam) setSymbolFilter(symbolParam); }, [symbolParam]);
  // How the trade ended (QW.10), from the closing deal's MT5 comment.
  const [exitFilter, setExitFilter] = useState<'ALL' | ExitReason>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('open');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [shown, setShown] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      // Stats only supply the balance for "% of balance"; the log works without them.
      const [t, d, j, s] = await Promise.all([api.trades.list(acc.id), api.trades.deals(acc.id), api.journal.list(acc.id), api.trades.stats(acc.id).catch(() => null)]);
      const tagsByTrade = new Map(j.filter(e => e.tradeId).map(e => [e.tradeId as string, e.tags]));
      setTrades(t.map(trade => ({ ...trade, tags: tagsByTrade.get(trade.positionId) ?? trade.tags })));
      setDeals(d);
      setJournal(j);
      setBalance(s?.currentEquity ?? null);
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
  useEffect(() => setShown(PAGE), [filter, symbolFilter, exitFilter, search, sortKey, sortDir, tab]);

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
      if (exitFilter !== 'ALL' && exitReasonOf(t) !== exitFilter) return false;
      if (q && !t.symbol.toLowerCase().includes(q) && !(t.tags ?? []).some(g => g.toLowerCase().includes(q))) return false;
      return true;
    });
    const val = (t: Trade): number | string =>
      sortKey === 'symbol' ? t.symbol : sortKey === 'net' ? t.netPnl : sortKey === 'held' ? t.durationSecs ?? -1
        // Time order follows the close (open positions first), like the day groups and daily P&L.
        : t.closeTime ? new Date(t.closeTime).getTime() : 8e15 + new Date(t.openTime).getTime();
    return f.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === 'asc' ? c : -c;
    });
  }, [trades, filter, symbolFilter, exitFilter, search, sortKey, sortDir]);
  const filteredPnl = useMemo(() => sorted.reduce((s, t) => s + t.netPnl, 0), [sorted]);
  // Live summary of whatever is currently filtered — answers "how did this slice do?"
  const slice = useMemo(() => {
    const closed = sorted.filter(t => t.status === 'CLOSED');
    const wins = closed.filter(t => t.netPnl > 0).length;
    const best = closed.reduce((m, t) => Math.max(m, t.netPnl), -Infinity);
    const worst = closed.reduce((m, t) => Math.min(m, t.netPnl), Infinity);
    return { n: closed.length, win: closed.length ? wins / closed.length : 0, avg: closed.length ? filteredPnl / closed.length : 0, best, worst };
  }, [sorted, filteredPnl]);

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
  const filtersOn = filter !== 'ALL' || symbolFilter !== 'ALL' || exitFilter !== 'ALL' || search.trim() !== '';
  const clearFilters = () => { setFilter('ALL'); setSymbolFilter('ALL'); setExitFilter('ALL'); setSearch(''); if (symbolParam) router.replace('/trades', { scroll: false }); };
  const notes = useMemo(() => notesByTrade(journal), [journal]);
  const pnlTone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const noData = (loading || !!error) && !trades.length;

  const subtitle = selected ? (
    <>
      {noData ? '—' : trades.length} position{trades.length === 1 ? '' : 's'} · {error && !deals.length ? 'couldn’t load deals' : <>from {deals.length} deal{deals.length === 1 ? '' : 's'}</>}
      {syncedAt && <> · synced {timeAgo(syncedAt)}</>}
    </>
  ) : 'Every closed position from your broker';

  const actions = (
    <button className="x-btn" onClick={exportCsv} disabled={exportDisabled} data-testid="export-csv">
      <IDownload size={15} /><span>Export CSV</span>
    </button>
  );

  const empty = trades.length === 0 ? (
    <div className="x-empty">
      {error ? <><b>Positions couldn’t load</b><p>They’ll appear here once the broker connection is back.</p></>
        : !selected ? <><b>No broker connected</b><p>Connect your MT5 account and your closed trades show up here.</p><button className="x-btn x-btn--hi" onClick={() => setShowConnect(true)}>Connect MT5</button></>
          : <><b>No positions yet</b><p>Closed trades appear here after your next MT5 sync.</p></>}
    </div>
  ) : (
    <div className="x-empty"><b>No trades match these filters</b><button className="x-btn x-btn--sm" onClick={clearFilters}>Clear filters</button></div>
  );

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Trade log" pageSubtitle={subtitle} actions={actions}>
      <div className="tr-page" data-testid="trades-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="trades-error">
            <span>{error}</span>
            <button className="x-btn x-btn--sm" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        {tab === 'trades' && slice.n > 0 && (
          <dl className="x-strip x-strip--card tr-strip" data-testid="trades-summary" aria-label="Summary of the trades shown">
            <div><dt><span>Net P&amp;L{filtersOn ? ' · filtered' : ''}</span></dt><dd><b className={`m mny tr-full ${pnlTone(filteredPnl)}`}>{money(filteredPnl)}</b><b className={`m mny tr-short ${pnlTone(filteredPnl)}`}>{moneyShort(filteredPnl)}</b></dd></div>
            <div><dt><span>Win rate</span></dt><dd><b className="m">{(slice.win * 100).toFixed(1)}%</b></dd></div>
            <div><dt><span>Avg trade</span></dt><dd><b className={`m mny tr-full ${pnlTone(slice.avg)}`}>{money(slice.avg)}</b><b className={`m mny tr-short ${pnlTone(slice.avg)}`}>{moneyShort(slice.avg)}</b></dd></div>
            <div><dt><span>Best</span></dt><dd><b className={`m mny ${Number.isFinite(slice.best) ? pnlTone(slice.best) : ''}`}>{Number.isFinite(slice.best) ? money(slice.best) : '—'}</b></dd></div>
            <div><dt><span>Worst</span></dt><dd><b className={`m mny ${Number.isFinite(slice.worst) ? pnlTone(slice.worst) : ''}`}>{Number.isFinite(slice.worst) ? money(slice.worst) : '—'}</b></dd></div>
          </dl>
        )}

        <section className="x-card">
          <div className="tr-bar">
            <div className="x-seg x-seg--in" role="tablist" aria-label="View">
              <button role="tab" aria-selected={tab === 'trades'} onClick={() => setTab('trades')} data-testid="tab-trades">Positions</button>
              <button role="tab" aria-selected={tab === 'deals'} onClick={() => setTab('deals')} data-testid="tab-deals">Raw deals</button>
            </div>
            {tab === 'trades' && (
              <>
                <div className="x-seg x-seg--in" role="group" aria-label="Filter positions">
                  {FILTERS.map(([f, l]) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f.toLowerCase()}`}>
                      {l}<small>{counts[f]}</small>
                    </button>
                  ))}
                </div>
                <select className="x-select tr-sel" value={symbolFilter} onChange={e => { setSymbolFilter(e.target.value); if (symbolParam) router.replace('/trades', { scroll: false }); }} data-testid="symbol-filter" aria-label="Symbol">
                  <option value="ALL">All symbols</option>
                  {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="x-select tr-sel" value={exitFilter} onChange={e => setExitFilter(e.target.value as 'ALL' | ExitReason)} data-testid="exit-filter" aria-label="How it closed">
                  <option value="ALL">Any exit</option>
                  {(Object.keys(EXIT_LABEL) as ExitReason[]).map(r => <option key={r} value={r}>{EXIT_LABEL[r]}</option>)}
                </select>
                <label className="x-search tr-search">
                  <ISearch size={15} />
                  <input ref={searchRef} className="x-input" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or tag" aria-label="Search symbol or tag" data-testid="symbol-search"
                    onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }} />
                  {search && <button type="button" className="tr-x" aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus(); }}><IClose size={13} /></button>}
                </label>
                {filtersOn && <button className="x-btn x-btn--ghost x-btn--sm" onClick={clearFilters}>Reset</button>}
              </>
            )}
          </div>

          {tab === 'trades' ? (
            <>
              <TradeLog rows={sorted} shown={shown} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} notes={notes} balance={balance}
                onOpen={open} loading={loading && !trades.length} empty={empty} />
              {trades.length > 0 && (
                <div className="tr-foot">
                  <span className="tr-count" data-testid="showing-count">
                    Showing <b className="m">{Math.min(shown, sorted.length)}</b> of <span className="m">{sorted.length}</span>{filtersOn && <> · <button className="x-link" onClick={clearFilters} data-testid="clear-filters">Clear filters</button></>}
                  </span>
                  {sorted.length > shown && <button className="x-btn" onClick={() => setShown(n => n + PAGE)} data-testid="load-more">Show {Math.min(PAGE, sorted.length - shown)} more</button>}
                </div>
              )}
            </>
          ) : (
            <>
              <DealsTable deals={deals} loading={loading && !deals.length} />
              <div className="tr-foot"><span className="tr-count" data-testid="showing-count"><b className="m">{deals.length}</b> deals</span></div>
            </>
          )}
        </section>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
