'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';
import { api, type BrokerAccount, type Deal, type Trade } from '@/lib/api';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';

export default function TradesPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [tab, setTab] = useState<'trades' | 'deals'>('trades');
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'WIN' | 'LOSS'>('ALL');

  const init = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { init(); }, [init]);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [t, d, j] = await Promise.all([
        api.trades.list(acc.id),
        api.trades.deals(acc.id),
        api.journal.list(acc.id),
      ]);
      const tagsByTrade = new Map(j.filter(e => e.tradeId).map(e => [e.tradeId as string, e.tags]));
      setTrades(t.map(trade => ({ ...trade, tags: tagsByTrade.get(trade.positionId) ?? trade.tags })));
      setDeals(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (selected) loadTrades(selected); }, [selected, loadTrades]);

  const filtered = trades.filter(t => {
    if (filter === 'LONG') return t.direction === 'LONG';
    if (filter === 'SHORT') return t.direction === 'SHORT';
    if (filter === 'WIN') return t.netPnl > 0;
    if (filter === 'LOSS') return t.netPnl <= 0;
    return true;
  });

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => prev.find(x => x.id === a.id) ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev]);
    setSelected(a); setShowConnect(false);
  }

  function exportCsv() {
    const acc = selected?.broker.replace(/\s+/g, '-').toLowerCase() ?? 'account';
    if (tab === 'deals') {
      const headers = ['Deal Ticket', 'Position ID', 'Symbol', 'Type', 'Entry', 'Volume', 'Price', 'Profit', 'Commission', 'Swap', 'Deal Time'];
      const rows = deals.map(d => [d.dealTicket, d.positionId, d.symbol, d.type, d.entry, d.volume, d.price, d.profit, d.commission, d.swap, d.dealTime]);
      downloadCsv(`tradinx-deals-${acc}-${dateStamp()}.csv`, toCsv(headers, rows));
      return;
    }
    const headers = ['Position ID', 'Symbol', 'Direction', 'Status', 'Open Time', 'Close Time', 'Volume', 'Entry Price', 'Exit Price', 'Gross P&L', 'Commission', 'Swap', 'Net P&L', 'Duration (s)', 'Tags'];
    const rows = filtered.map(t => [
      t.positionId, t.symbol, t.direction, t.status, t.openTime, t.closeTime ?? '', t.volume,
      t.entryPrice, t.exitPrice ?? '', t.grossPnl, t.commission, t.swap, t.netPnl, t.durationSecs ?? '',
      (t.tags ?? []).join('; '),
    ]);
    downloadCsv(`tradinx-trades-${acc}-${dateStamp()}.csv`, toCsv(headers, rows));
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Trade Log"
      pageSubtitle="// AUDIT TRAIL"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="trades-page">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.25em] text-fg-3 truncate">[ TRADE LOG // {selected?.broker.toUpperCase()} ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">{trades.length} POSITIONS</h1>
            <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest mt-1 numeric">RECONSTRUCTED FROM {deals.length} DEALS</div>
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto -mx-1 px-1">
            {(['ALL', 'LONG', 'SHORT', 'WIN', 'LOSS'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`filter-${f.toLowerCase()}`}
                className={`shrink-0 px-3 py-1.5 text-[10px] tracking-[0.22em] border ${filter === f ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1">
            {(['trades', 'deals'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
                className={`px-3 sm:px-4 py-2 text-[10px] tracking-[0.22em] border uppercase ${tab === t ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'}`}
              >
                {t === 'trades' ? 'POSITIONS' : 'RAW DEALS'}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={(tab === 'deals' ? deals.length : filtered.length) === 0}
            data-testid="export-csv"
            className="btn btn-ghost py-2 text-[10px] tracking-[0.22em] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↓ EXPORT CSV
          </button>
        </div>

        {error && (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 text-[12px]" data-testid="trades-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadTrades(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        {tab === 'trades' ? (
          <div className="tcard p-0" data-testid="trades-table">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Symbol', 'Dir', 'Volume', 'Open', 'Close', 'Entry', 'Exit', 'Held', 'Net P&L', 'Tag'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] tracking-[0.22em] text-fg-3 uppercase font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border-soft">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-2.5 w-12 bg-surface-hover" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-fg-3 text-[12px]">No trades match the current filter.</td></tr>
                  ) : (
                    filtered.map(t => {
                      const pos = t.netPnl >= 0;
                      return (
                        <tr
                          key={t.positionId}
                          onClick={() => selected && router.push(`/trades/${t.positionId}?account=${encodeURIComponent(selected.id)}`)}
                          data-testid={`trade-row-${t.positionId}`}
                          className="border-b border-border-soft hover:bg-surface-hover transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-display font-bold tracking-tight">{t.symbol}</td>
                          <td className={`px-4 py-3 text-[10px] tracking-[0.22em] ${t.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>{t.direction === 'LONG' ? '↗ LONG' : '↘ SHORT'}</td>
                          <td className="px-4 py-3 numeric text-fg-2">{t.volume.toFixed(2)}</td>
                          <td className="px-4 py-3 numeric text-fg-3">{new Date(t.openTime).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-4 py-3 numeric text-fg-3">{t.closeTime ? new Date(t.closeTime).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                          <td className="px-4 py-3 numeric">{t.entryPrice.toFixed(t.symbol === 'USDJPY' ? 3 : 5)}</td>
                          <td className="px-4 py-3 numeric">{t.exitPrice?.toFixed(t.symbol === 'USDJPY' ? 3 : 5)}</td>
                          <td className="px-4 py-3 numeric text-fg-2">
                            {t.durationSecs && t.durationSecs >= 3600 ? `${Math.floor(t.durationSecs / 3600)}h` : `${Math.floor((t.durationSecs ?? 0) / 60)}m`}
                          </td>
                          <td className={`px-4 py-3 numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>{pos ? '+' : ''}${t.netPnl.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            {t.tags?.[0] && <span className="px-2 py-0.5 text-[10px] tracking-widest border border-border-soft text-fg-2">{t.tags[0]}</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <DealsTable deals={deals} loading={loading} />
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
