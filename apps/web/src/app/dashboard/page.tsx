'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type Deal } from '@/lib/api';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';

const { useSession, signOut } = authClient;

const S: Record<string, React.CSSProperties> = {
  shell:    { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar:  { width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '20px 12px', background: 'var(--surface)' },
  main:     { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar:   { height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 28px', gap: 12, flexShrink: 0 },
  content:  { flex: 1, padding: '32px 32px', overflowY: 'auto' },
};

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
      background: active ? 'var(--surface-2)' : 'transparent',
      color: active ? 'var(--text)' : 'var(--text-muted)',
      fontSize: 13, fontWeight: active ? 500 : 400, cursor: 'pointer', transition: 'all 0.15s',
      userSelect: 'none',
    }}>
      {icon}
      {label}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px',
      transition: 'border-color 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      <p style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
      <div className="skeleton" style={{ height: 10, width: 60, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 22, width: 100 }} />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [dealsError, setDealsError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
  }, [session, isPending, router]);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.accounts.list();
      setAccounts(data);
      if (data.length > 0 && !selected) setSelected(data[0] ?? null);
    } catch { /* ignore */ }
    finally { setLoadingAccounts(false); }
  }, [selected]);

  useEffect(() => { if (session) loadAccounts(); }, [session, loadAccounts]);

  const loadDeals = useCallback(async (account: BrokerAccount) => {
    setLoadingDeals(true);
    setDealsError('');
    try {
      setDeals(await api.trades.deals(account.id));
    } catch (err: any) {
      setDealsError(err.message ?? 'Failed to load deals');
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  useEffect(() => { if (selected) loadDeals(selected); }, [selected, loadDeals]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id);
      return exists ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev];
    });
    setSelected(account);
    setShowConnect(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push('/login');
  }

  if (isPending || (!session && !isPending)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <span className="spin" style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', display: 'inline-block' }} />
      </div>
    );
  }

  const pnl = deals.reduce((s, d) => s + parseFloat(d.profit || '0'), 0);
  const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;

  return (
    <div style={S.shell}>
      {/* Sidebar */}
      <aside style={S.sidebar}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px', marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.2px' }}>TradingJournal</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem active icon={
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="9" width="4" height="6" rx="1" fill="currentColor" opacity="0.5"/>
              <rect x="6" y="5" width="4" height="10" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="11" y="2" width="4" height="13" rx="1" fill="currentColor"/>
            </svg>
          } label="Dashboard" />
          <NavItem icon={
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          } label="Trade Log" />
          <NavItem icon={
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          } label="Journal" />
          <NavItem icon={
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M1 13L5 8l3 3 3-4 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          } label="Analytics" />
        </nav>

        {/* Bottom */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
          <div style={{ padding: '8px 10px' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.user.name || 'User'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
              background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 13,
              cursor: 'pointer', transition: 'background 0.15s, color 0.15s', width: '100%',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={S.main}>
        {/* Topbar */}
        <div style={S.topbar}>
          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto', paddingLeft: 4 }}>
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => setSelected(acc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                    border: `1px solid ${selected.id === acc.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected.id === acc.id ? 'var(--accent-glow)' : 'transparent',
                    color: selected.id === acc.id ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (selected.id !== acc.id) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (selected.id !== acc.id) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.id === acc.id ? 'var(--accent)' : 'var(--text-subtle)', flexShrink: 0 }} />
                  {acc.broker} <span style={{ opacity: 0.6 }}>#{acc.mt5Login}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowConnect(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9,
              background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.15s, transform 0.1s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px var(--accent-glow)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Connect Broker
          </button>
        </div>

        {/* Content */}
        <div style={S.content} className="fade-up">
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.4px' }}>Dashboard</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>Your trading activity</p>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }} className="d1">
            {loadingAccounts ? (
              <><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
            ) : selected ? (
              <>
                <StatCard label="Account" value={`#${selected.mt5Login}`} sub={selected.marginMode} />
                <StatCard label="Server" value={selected.server} sub={selected.baseCurrency} />
                <StatCard label="Total P&L" value={pnlStr} color={pnl >= 0 ? 'var(--green)' : 'var(--red)'} sub={`${deals.length} deals`} />
              </>
            ) : (
              <>
                <StatCard label="Account" value="—" />
                <StatCard label="Server" value="—" />
                <StatCard label="Total P&L" value="—" />
              </>
            )}
          </div>

          {/* Deals / Empty */}
          <div className="d2">
            {!loadingAccounts && accounts.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 60, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                    <path d="M2 12L6 7L9 10L13 4" stroke="var(--text-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, fontSize: 15 }}>No broker connected</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22 }}>Connect your XM MT5 account to pull your trade history</p>
                <button
                  onClick={() => setShowConnect(true)}
                  style={{ padding: '9px 20px', borderRadius: 10, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
                >
                  Connect XM Broker
                </button>
              </div>
            ) : (
              <DealsTable deals={deals} loading={loadingDeals} error={dealsError} />
            )}
          </div>
        </div>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </div>
  );
}
