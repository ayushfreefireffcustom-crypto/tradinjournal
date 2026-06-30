'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';

const { useSession } = authClient;

function BarChart({ data, color = 'var(--accent)' }: { data: { label: string; value: number }[]; color?: string }) {
  if (data.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '16px 0' }}>No data</p>;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map(({ label, value }) => {
        const pos = value >= 0;
        const pct = (Math.abs(value) / max) * 100;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 36, textAlign: 'right', flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pos ? 'var(--green)' : 'var(--red)', borderRadius: 4, opacity: 0.8, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: pos ? 'var(--green)' : 'var(--red)', width: 60, flexShrink: 0 }}>
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
  if (total === 0) return <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>No closed trades</p>;
  const winPct = (wins / total) * 100;
  const R = 40;
  const circ = 2 * Math.PI * R;
  const winDash = (winPct / 100) * circ;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={R} fill="none" stroke="var(--red)" strokeWidth={12} />
        <circle cx={50} cy={50} r={R} fill="none" stroke="var(--green)" strokeWidth={12}
          strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25} strokeLinecap="round" />
        <text x={50} y={54} textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700">{winPct.toFixed(0)}%</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Wins: <strong style={{ color: 'var(--text)' }}>{wins}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Losses: <strong style={{ color: 'var(--text)' }}>{losses}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--text-subtle)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{total}</strong></span>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{title}</p>
      {children}
    </div>
  );
}

function Skel({ h, w }: { h: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w ?? '100%', borderRadius: 6 }} />;
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
      <div style={{ padding: '28px 28px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Deep dive into your performance</p>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}><Skel h={12} w={120} /><div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 5 }).map((_, j) => <Skel key={j} h={20} />)}</div></div>)}
          </div>
        ) : !stats || stats.totalTrades === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '52px 24px', textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No trade data yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Place some trades in MT5 — analytics will appear here</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Row 1: key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                { label: 'Net P&L', value: `${stats.netPnl >= 0 ? '+' : ''}$${stats.netPnl.toFixed(2)}`, color: stats.netPnl >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Profit Factor', value: stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2) },
                { label: 'Gross Profit', value: `+$${stats.grossProfit.toFixed(2)}`, color: 'var(--green)' },
                { label: 'Gross Loss', value: `-$${stats.grossLoss.toFixed(2)}`, color: 'var(--red)' },
                { label: 'Max Drawdown', value: `${(stats.maxDrawdownPct * 100).toFixed(1)}%`, color: stats.maxDrawdownPct > 0.1 ? 'var(--red)' : 'var(--text)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</p>
                  <p style={{ fontSize: 17, fontWeight: 700, color: color ?? 'var(--text)', letterSpacing: '-0.3px' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Row 2: win/loss + by day */}
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
              <Card title="Win / Loss">
                <WinLossDonut wins={stats.totalWins} losses={stats.totalLosses} />
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Avg Win', value: `+$${stats.avgWin.toFixed(2)}`, color: 'var(--green)' },
                    { label: 'Avg Loss', value: `$${stats.avgLoss.toFixed(2)}`, color: 'var(--red)' },
                    { label: 'Best Trade', value: `+$${stats.bestTrade.toFixed(2)}`, color: 'var(--green)' },
                    { label: 'Worst Trade', value: `$${stats.worstTrade.toFixed(2)}`, color: 'var(--red)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Gross P&L', 'Avg P&L'].map(h => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.bySymbol.map(s => (
                    <tr key={s.symbol} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{s.symbol}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{s.trades}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--green)' }}>{s.wins}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--red)' }}>{s.losses}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, fontWeight: 700, background: s.winRate >= 0.5 ? 'rgba(34,212,114,0.1)' : 'rgba(240,82,82,0.1)', color: s.winRate >= 0.5 ? 'var(--green)' : 'var(--red)' }}>
                          {(s.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: s.netPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{s.netPnl >= 0 ? '+' : ''}{s.netPnl.toFixed(2)}</td>
                      <td style={{ padding: '9px 12px', color: s.avgPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{s.avgPnl >= 0 ? '+' : ''}{s.avgPnl.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
