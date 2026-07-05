'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { PieChart } from 'lucide-react';

const { useSession } = authClient;

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-xs text-neutral-500 py-4">No data</p>;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 0.01);
  return (
    <div className="flex flex-col gap-2">
      {data.map(({ label, value }) => {
        const pos = value >= 0;
        const pct = (Math.abs(value) / max) * 100;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <span className="text-[11px] text-neutral-400 w-9 text-right shrink-0">{label}</span>
            <div className="flex-1 h-5 bg-neutral-800/50 rounded overflow-hidden relative">
              <div 
                className={`h-full rounded opacity-80 transition-all duration-500 ease-out ${pos ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }} 
              />
            </div>
            <span className={`text-[11px] font-semibold w-14 shrink-0 font-mono tabular-nums ${pos ? 'text-green-500' : 'text-red-500'}`}>
              {pos ? '+' : ''}{value.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WinLossDonut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <p className="text-xs text-neutral-500">No closed trades</p>;
  const winPct = (wins / total) * 100;
  const R = 40;
  const circ = 2 * Math.PI * R;
  const winDash = (winPct / 100) * circ;
  return (
    <div className="flex items-center gap-5">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={R} fill="none" className="stroke-red-500/80" strokeWidth={12} />
        <circle cx={50} cy={50} r={R} fill="none" className="stroke-green-500/80" strokeWidth={12}
          strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25} strokeLinecap="round" />
        <text x={50} y={54} textAnchor="middle" className="fill-white font-bold text-sm">{winPct.toFixed(0)}%</text>
      </svg>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
          <span className="text-xs text-neutral-400">Wins: <strong className="text-white">{wins}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
          <span className="text-xs text-neutral-400">Losses: <strong className="text-white">{losses}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-neutral-600 inline-block" />
          <span className="text-xs text-neutral-400">Total: <strong className="text-white">{total}</strong></span>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl p-5 shadow-2xl overflow-hidden">
      <p className="text-sm font-semibold text-white mb-4">{title}</p>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);

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

  const loadStats = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    try { setStats(await api.trades.stats(acc.id)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selected) loadStats(selected); }, [selected, loadStats]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => { const e = prev.find(a => a.id === account.id); return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]; });
    setSelected(account);
    setShowConnect(false);
  }

  if (isPending || (!session && !isPending)) return null;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={setSelected} onConnectClick={() => setShowConnect(true)}>
      <div className="w-full max-w-7xl mx-auto px-6 py-8 md:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-sm text-on-surface-variant mt-1">Deep dive into your performance</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl p-5 shadow-2xl">
                <div className="h-3 bg-neutral-800/50 rounded animate-pulse w-32 mb-6" />
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }).map((_, j) => <div key={j} className="h-5 bg-neutral-800/50 rounded animate-pulse" />)}
                </div>
              </div>
            ))}
          </div>
        ) : !stats || stats.totalTrades === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/5 flex items-center justify-center mb-4">
              <PieChart className="w-8 h-8 text-primary-fixed-dim" />
            </div>
            <h3 className="font-headline-md text-white font-bold mb-2">No Analytics Data Yet</h3>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Place some trades in MT5 or connect a live account to populate your performance metrics.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Row 1: key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Net P&L', value: `${stats.netPnl >= 0 ? '+' : ''}$${stats.netPnl.toFixed(2)}`, color: stats.netPnl >= 0 ? 'text-green-500' : 'text-red-500' },
                { label: 'Profit Factor', value: stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2), color: 'text-white' },
                { label: 'Gross Profit', value: `+$${stats.grossProfit.toFixed(2)}`, color: 'text-green-500' },
                { label: 'Gross Loss', value: `-$${stats.grossLoss.toFixed(2)}`, color: 'text-red-500' },
                { label: 'Max Drawdown', value: `${(stats.maxDrawdownPct * 100).toFixed(1)}%`, color: stats.maxDrawdownPct > 0.1 ? 'text-red-500' : 'text-white' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl p-4 shadow-2xl flex flex-col justify-center">
                  <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-xl font-bold tracking-tight font-mono tabular-nums ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Row 2: win/loss + by day */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
              <Card title="Win / Loss">
                <WinLossDonut wins={stats.totalWins} losses={stats.totalLosses} />
                <div className="mt-5 flex flex-col gap-1.5">
                  {[
                    { label: 'Avg Win', value: `+$${stats.avgWin.toFixed(2)}`, color: 'text-green-500' },
                    { label: 'Avg Loss', value: `-$${Math.abs(stats.avgLoss).toFixed(2)}`, color: 'text-red-500' },
                    { label: 'Best Trade', value: `+$${stats.bestTrade.toFixed(2)}`, color: 'text-green-500' },
                    { label: 'Worst Trade', value: `-$${Math.abs(stats.worstTrade).toFixed(2)}`, color: 'text-red-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center py-2 border-b border-neutral-800/50 last:border-0">
                      <span className="text-xs text-neutral-400">{label}</span>
                      <span className={`text-xs font-bold font-mono tabular-nums ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="P&L by Day of Week">
                <BarChart data={stats.byDay.map(d => ({ label: d.day, value: d.netPnl }))} />
              </Card>
            </div>

            {/* Row 3: by symbol */}
            <Card title="Performance by Symbol">
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      {['Symbol', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Gross P&L', 'Avg P&L'].map(h => (
                        <th key={h} className="pb-3 px-2 text-[10px] uppercase tracking-wider font-semibold text-neutral-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.bySymbol.map(s => (
                      <tr 
                        key={s.symbol} 
                        className="border-b border-neutral-800/50 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 px-2 font-semibold text-white whitespace-nowrap">{s.symbol}</td>
                        <td className="py-3 px-2 text-sm text-neutral-400 font-mono tabular-nums">{s.trades}</td>
                        <td className="py-3 px-2 text-sm text-green-500 font-mono tabular-nums">{s.wins}</td>
                        <td className="py-3 px-2 text-sm text-red-500 font-mono tabular-nums">{s.losses}</td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex text-[11px] px-2 py-0.5 rounded font-bold ${
                            s.winRate >= 0.5 
                              ? 'bg-green-500/10 text-green-500' 
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {(s.winRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className={`py-3 px-2 text-sm font-bold font-mono tabular-nums ${s.netPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {s.netPnl >= 0 ? '+' : ''}{s.netPnl.toFixed(2)}
                        </td>
                        <td className={`py-3 px-2 text-sm font-mono tabular-nums ${s.avgPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {s.avgPnl >= 0 ? '+' : ''}{s.avgPnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
