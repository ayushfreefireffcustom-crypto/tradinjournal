'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type Trade } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';

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

  const symbols = useMemo(() => Array.from(new Set(trades.map(t => t.symbol))).sort(), [trades]);

  const filtered = useMemo(() => {
    let t = [...trades];
    if (filterDir !== 'ALL') t = t.filter(x => x.direction === filterDir);
    if (filterStatus !== 'ALL') t = t.filter(x => x.status === filterStatus);
    if (filterSymbol) t = t.filter(x => x.symbol === filterSymbol);
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

  const selStyle = { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer' };

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={acc => { setSelected(acc); }} onConnectClick={() => setShowConnect(true)}>
      <div style={{ padding: '28px 28px', maxWidth: 1200, margin: '0 auto' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Trade Log</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{loading ? '…' : `${filtered.length} of ${trades.length} trades`}</p>
          </div>
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={filterDir} onChange={e => setFilterDir(e.target.value as 'ALL' | 'LONG' | 'SHORT')} style={selStyle}>
              <option value="ALL">All directions</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')} style={selStyle}>
              <option value="ALL">All status</option>
              <option value="CLOSED">Closed</option>
              <option value="OPEN">Open</option>
            </select>
            {symbols.length > 0 && (
              <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} style={selStyle}>
                <option value="">All symbols</option>
                {symbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {COLS.map(h => {
                    const sortable = h === 'Open' || h === 'Net P&L';
                    const col = h === 'Open' ? 'openTime' : 'netPnl';
                    const active = (sortable && sortCol === col);
                    return (
                      <th
                        key={h}
                        onClick={() => sortable && toggleSort(col as 'openTime' | 'netPnl')}
                        style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em', cursor: sortable ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}
                      >
                        {h} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {COLS.map((_, j) => (
                        <td key={j} style={{ padding: '11px 14px' }}>
                          <div className="skeleton" style={{ height: 11, width: 60 + (j % 3) * 20, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ padding: '48px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      {trades.length === 0 ? 'No trades found — place some trades in MT5 first' : 'No trades match the current filters'}
                    </td>
                  </tr>
                ) : filtered.map(t => {
                  const pos = t.netPnl >= 0;
                  return (
                    <tr key={t.positionId} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'default' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: t.direction === 'LONG' ? 'rgba(34,212,114,0.12)' : 'rgba(240,82,82,0.12)', color: t.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>
                          {t.direction}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>{t.symbol}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(t.openTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.closeTime ? new Date(t.closeTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : <span style={{ color: 'var(--text-subtle)' }}>Open</span>}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.volume.toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.entryPrice.toFixed(5)}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.exitPrice ? t.exitPrice.toFixed(5) : <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
                      <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: t.grossPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.grossPnl >= 0 ? '+' : ''}{t.grossPnl.toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-subtle)' }}>{t.commission.toFixed(2)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 5, fontVariantNumeric: 'tabular-nums', color: pos ? 'var(--green)' : 'var(--red)', background: pos ? 'rgba(34,212,114,0.1)' : 'rgba(240,82,82,0.1)' }}>
                          {pos ? '+' : ''}{t.netPnl.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtDur(t.durationSecs)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em', background: t.status === 'OPEN' ? 'rgba(99,102,241,0.12)' : 'var(--surface-3)', color: t.status === 'OPEN' ? 'var(--accent)' : 'var(--text-muted)' }}>
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
