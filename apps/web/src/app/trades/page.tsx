'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type Trade } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { Search, ChevronDown, Activity } from 'lucide-react';

const { useSession } = authClient;

function fmtDur(s: number | null) {
  if (!s) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

const COLS = ['Direction', 'Symbol', 'Open', 'Close', 'Volume', 'Entry', 'Exit', 'Gross P&L', 'Commission', 'Net P&L', 'Duration', 'Status'];

export default function TradesPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);

  // Filters
  const [filterDir, setFilterDir] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [sortCol, setSortCol] = useState<'openTime' | 'netPnl'>('openTime');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => { if (!isPending && !session) router.push('/login'); }, [session, isPending, router]);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.accounts.list();
      setAccounts(data);
      if (data.length > 0) setSelected(data[0] ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) loadAccounts(); }, [session, loadAccounts]);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    try {
      setTrades(await api.trades.list(acc.id));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selected) loadTrades(selected); }, [selected, loadTrades]);

  const filtered = useMemo(() => {
    let t = [...trades];
    if (filterDir !== 'ALL') t = t.filter(x => x.direction === filterDir);
    if (filterStatus !== 'ALL') t = t.filter(x => x.status === filterStatus);
    if (filterSymbol) t = t.filter(x => x.symbol.toLowerCase().includes(filterSymbol.toLowerCase()));
    t.sort((a, b) => {
      const diff = sortCol === 'openTime'
        ? new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
        : a.netPnl - b.netPnl;
      return sortDir === 'desc' ? -diff : diff;
    });
    return t;
  }, [trades, filterDir, filterStatus, filterSymbol, sortCol, sortDir]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => { const e = prev.find(a => a.id === account.id); return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]; });
    setSelected(account);
    setShowConnect(false);
  }

  if (isPending || (!session && !isPending)) return null;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={acc => { setSelected(acc); }} onConnectClick={() => setShowConnect(true)}>
      <div className="w-full max-w-7xl mx-auto px-6 py-8 md:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Trade Log</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {loading ? 'Syncing...' : `${filtered.length} of ${trades.length} trades`}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative w-full md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input 
                type="text" 
                placeholder="Search symbol..." 
                value={filterSymbol}
                onChange={e => setFilterSymbol(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant hover:border-outline/50 transition-colors rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            {/* Directions Filter */}
            <div className="relative">
              <select 
                value={filterDir} 
                onChange={e => setFilterDir(e.target.value as any)}
                className="appearance-none bg-surface-container-low border border-outline-variant hover:border-outline/50 transition-colors rounded-lg pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="ALL">All directions</option>
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value as any)}
                className="appearance-none bg-surface-container-low border border-outline-variant hover:border-outline/50 transition-colors rounded-lg pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="ALL">All status</option>
                <option value="CLOSED">Closed</option>
                <option value="OPEN">Open</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Premium Table Container */}
        <div className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800">
                  {COLS.map(h => {
                    const sortable = h === 'Open' || h === 'Net P&L';
                    const col = h === 'Open' ? 'openTime' : 'netPnl';
                    const active = (sortable && sortCol === col);
                    return (
                      <th
                        key={h}
                        onClick={() => sortable && toggleSort(col as any)}
                        className={`py-4 px-5 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap select-none ${
                          sortable ? 'cursor-pointer hover:text-white transition-colors' : ''
                        } ${active ? 'text-primary-fixed-dim' : 'text-neutral-400'}`}
                      >
                        <div className="flex items-center gap-1">
                          {h}
                          {active && (
                            <span className="text-[10px]">
                              {sortDir === 'desc' ? '↓' : '↑'}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-neutral-800/50">
                      {COLS.map((_, j) => (
                        <td key={j} className="py-4 px-5">
                          <div className="h-3 bg-neutral-800/50 rounded animate-pulse" style={{ width: 40 + (j % 3) * 20 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="py-24">
                      {trades.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/5 flex items-center justify-center mb-4">
                            <Activity className="w-8 h-8 text-primary-fixed-dim" />
                          </div>
                          <h3 className="font-headline-md text-white font-bold mb-2">No Active Trades Synced</h3>
                          <p className="text-on-surface-variant max-w-sm text-sm">
                            Connect your MT5 account or place your initial trades to generate your execution history log.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center">
                          <Search className="w-8 h-8 text-neutral-600 mb-3" />
                          <h3 className="font-label-lg text-white font-semibold mb-1">No matches found</h3>
                          <p className="text-on-surface-variant text-sm">Try adjusting your filters or search term.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : filtered.map(t => {
                  const pos = t.netPnl >= 0;
                  return (
                    <tr 
                      key={t.positionId} 
                      className="border-b border-neutral-800/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 px-5">
                        <span className={`inline-flex text-[11px] px-2 py-0.5 rounded font-bold ${
                          t.direction === 'LONG' 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-red-500/10 text-red-500'
                        }`}>
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-semibold text-white whitespace-nowrap">{t.symbol}</td>
                      <td className="py-3 px-5 text-sm text-neutral-400 whitespace-nowrap">
                        {new Date(t.openTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-5 text-sm text-neutral-400 whitespace-nowrap">
                        {t.closeTime ? new Date(t.closeTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : <span className="text-neutral-600">Open</span>}
                      </td>
                      <td className="py-3 px-5 text-sm text-neutral-400 font-mono tabular-nums">{t.volume.toFixed(2)}</td>
                      <td className="py-3 px-5 text-sm text-neutral-400 font-mono tabular-nums">{t.entryPrice.toFixed(5)}</td>
                      <td className="py-3 px-5 text-sm text-neutral-400 font-mono tabular-nums">
                        {t.exitPrice ? t.exitPrice.toFixed(5) : <span className="text-neutral-600">—</span>}
                      </td>
                      <td className={`py-3 px-5 text-sm font-mono tabular-nums ${t.grossPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {t.grossPnl >= 0 ? '+' : ''}{t.grossPnl.toFixed(2)}
                      </td>
                      <td className="py-3 px-5 text-sm text-neutral-500 font-mono tabular-nums">{t.commission.toFixed(2)}</td>
                      <td className="py-3 px-5">
                        <span className={`inline-flex text-[12px] font-bold px-2 py-0.5 rounded font-mono tabular-nums ${
                          pos 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-red-500/10 text-red-500'
                        }`}>
                          {pos ? '+' : ''}{t.netPnl.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-sm text-neutral-400 whitespace-nowrap">{fmtDur(t.durationSecs)}</td>
                      <td className="py-3 px-5">
                        <span className={`inline-flex text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          t.status === 'OPEN' 
                            ? 'bg-indigo-500/10 text-indigo-400' 
                            : 'bg-neutral-800 text-neutral-400'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
