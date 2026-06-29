'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type AccountStats, type Trade } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';

const { useSession } = authClient;

function fmt(n: number, decimals = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(decimals);
}
function fmtDuration(secs: number) {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d`;
}

function StatCard({ label, value, sub, color, prefix = '' }: { label: string; value: string | number; sub?: string; color?: string; prefix?: string }) {
  const display = typeof value === 'number' ? `${prefix}${value.toFixed(2)}` : value;
  return (
    <div
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', transition: 'border-color 0.15s, transform 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      <p style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)', letterSpacing: '-0.4px', lineHeight: 1 }}>{display}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5 }}>{sub}</p>}
    </div>
  );
}

function Skel({ w, h }: { w?: string | number; h: number }) {
  return <div className="skeleton" style={{ width: w ?? '100%', height: h, borderRadius: 6 }} />;
}

function RecentTradeRow({ trade }: { trade: Trade }) {
  const pos = trade.netPnl >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, background: trade.direction === 'LONG' ? 'rgba(34,212,114,0.12)' : 'rgba(240,82,82,0.12)', color: trade.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>
        {trade.direction === 'LONG' ? 'L' : 'S'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{trade.symbol}</p>
        <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{new Date(trade.openTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{trade.durationSecs ? ` · ${fmtDuration(trade.durationSecs)}` : ''}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)' }}>{fmt(trade.netPnl)}</p>
        <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{trade.volume.toFixed(2)} lots</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
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

  const loadData = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.trades.stats(acc.id), api.trades.list(acc.id)]);
      setStats(s);
      setRecentTrades(t.slice(0, 8));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selected) loadData(selected); }, [selected, loadData]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => { const e = prev.find(a => a.id === account.id); return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]; });
    setSelected(account);
    setShowConnect(false);
  }

  if (isPending || (!session && !isPending)) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><span className="spin" style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', display: 'inline-block' }} /></div>;
  }

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={acc => { setSelected(acc); }} onConnectClick={() => setShowConnect(true)}>
      <div style={{ padding: '28px 28px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Performance overview</p>
        </div>

        {accounts.length === 0 && !loading ? (
          <div className="bg-surface border border-outline-variant/30 rounded-2xl py-16 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none"><path d="M2 12L6 7L9 10L13 4" stroke="currentColor" className="text-on-surface-variant" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p className="font-sora text-lg font-semibold text-on-surface mb-2">No broker connected</p>
            <p className="text-sm text-on-surface-variant mb-8">Connect your XM MT5 account to see your stats</p>
            <button
              onClick={() => setShowConnect(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-container text-white text-sm font-semibold hover:bg-primary-container/90 transition-all cursor-pointer active:scale-95 border-none shadow-lg shadow-primary/20"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Connect Broker
            </button>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {loading ? <>
                {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}><Skel h={10} w={60} /><div style={{ marginTop: 10 }}><Skel h={20} w={90} /></div></div>)}
              </> : stats ? <>
                <StatCard label="Net P&L" value={stats.netPnl} prefix="$" color={stats.netPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Win Rate" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.totalWins}W / ${stats.totalLosses}L`} color={stats.winRate >= 0.5 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Profit Factor" value={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)} color={stats.profitFactor >= 1.5 ? 'var(--green)' : stats.profitFactor >= 1 ? 'var(--text)' : 'var(--red)'} />
                <StatCard label="Total Trades" value={stats.totalTrades.toString()} sub={stats.openTrades > 0 ? `${stats.openTrades} open` : undefined} />
                <StatCard label="Avg Win" value={stats.avgWin} prefix="$" color="var(--green)" />
                <StatCard label="Avg Loss" value={stats.avgLoss} prefix="$" color="var(--red)" />
                <StatCard label="Max Drawdown" value={`${(stats.maxDrawdownPct * 100).toFixed(1)}%`} color={stats.maxDrawdownPct > 0.1 ? 'var(--red)' : 'var(--text-muted)'} />
                <StatCard label="Avg Duration" value={fmtDuration(stats.avgDurationSecs)} />
              </> : null}
            </div>

            {/* Equity curve + Recent trades */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
              {/* Equity chart */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Equity Curve</p>
                  {stats && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Starting ${stats.startingBalance.toLocaleString()} → ${stats.currentEquity.toLocaleString()}</p>}
                </div>
                {loading ? <Skel h={140} /> : stats ? <EquityChart data={stats.equityCurve} height={140} /> : null}
              </div>

              {/* Recent trades */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Recent Trades</p>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Skel key={i} h={36} />)}
                  </div>
                ) : recentTrades.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 12 }}>No closed trades yet</p>
                ) : (
                  <div>{recentTrades.map(t => <RecentTradeRow key={t.positionId} trade={t} />)}</div>
                )}
              </div>
            </div>

            {/* By Symbol */}
            {!loading && stats && stats.bySymbol.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Performance by Symbol</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.bySymbol.map(s => (
                      <tr key={s.symbol} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{s.symbol}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{s.trades}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, fontWeight: 600, background: s.winRate >= 0.5 ? 'rgba(34,212,114,0.1)' : 'rgba(240,82,82,0.1)', color: s.winRate >= 0.5 ? 'var(--green)' : 'var(--red)' }}>
                            {(s.winRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: s.netPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(s.netPnl)}</td>
                        <td style={{ padding: '9px 12px', color: s.avgPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(s.avgPnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
