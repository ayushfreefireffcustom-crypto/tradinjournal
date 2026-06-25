'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type Deal } from '@/lib/api';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';

const { useSession, signOut } = authClient;

function StatSkeleton() {
  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="skeleton h-3 w-16 mb-3" />
      <div className="skeleton h-5 w-24" />
    </div>
  );
}

function AccountTabSkeleton() {
  return <div className="skeleton h-9 w-36 rounded-lg" />;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BrokerAccount | null>(null);
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
      if (data.length > 0 && !selectedAccount) setSelectedAccount(data[0] ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (session) loadAccounts();
  }, [session, loadAccounts]);

  const loadDeals = useCallback(async (account: BrokerAccount) => {
    setLoadingDeals(true);
    setDealsError('');
    try {
      const data = await api.trades.deals(account.id);
      setDeals(data);
    } catch (err: any) {
      setDealsError(err.message ?? 'Failed to load deals');
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccount) loadDeals(selectedAccount);
  }, [selectedAccount, loadDeals]);

  function onAccountConnected(account: BrokerAccount) {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id);
      return exists ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev];
    });
    setSelectedAccount(account);
    setShowConnect(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push('/login');
  }

  if (isPending || (!session && !isPending)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  const pnl = deals.reduce((sum, d) => sum + parseFloat(d.profit || '0'), 0);
  const pnlPositive = pnl >= 0;

  return (
    <div className="min-h-screen animate-fade-in" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <nav
        className="sticky top-0 z-10 border-b px-6 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--border)', background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>TradingJournal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs hidden sm:block" style={{ color: 'var(--text-subtle)' }}>{session?.user.email}</span>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-fade-in">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Your trading activity</p>
          </div>
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150"
            style={{ background: 'var(--accent)', color: '#fff' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px var(--accent-subtle)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) scale(0.97)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Connect Broker
          </button>
        </div>

        {/* Account tabs */}
        {loadingAccounts ? (
          <div className="flex gap-2 mb-6">
            <AccountTabSkeleton />
            <AccountTabSkeleton />
          </div>
        ) : accounts.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap animate-fade-in delay-75">
            {accounts.map(acc => {
              const active = selectedAccount?.id === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className="px-4 py-2 rounded-xl text-sm border transition-all duration-150"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--surface)',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    boxShadow: active ? '0 0 12px var(--accent-subtle)' : 'none',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; } }}
                >
                  <span className="font-medium">{acc.broker}</span>
                  <span className="ml-2 opacity-60 text-xs">#{acc.mt5Login}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Stats */}
        {loadingAccounts ? (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </div>
        ) : selectedAccount && (
          <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in delay-150">
            {[
              { label: 'Account', value: `#${selectedAccount.mt5Login}` },
              { label: 'Server', value: selectedAccount.server },
              {
                label: 'Total P&L',
                value: `${pnlPositive ? '+' : ''}$${pnl.toFixed(2)}`,
                color: pnlPositive ? 'var(--green)' : 'var(--red)',
                bg: pnlPositive ? 'var(--green-subtle)' : 'var(--red-subtle)',
              },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                className="rounded-xl p-4 border transition-all duration-200"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
              >
                <p className="text-xs mb-2" style={{ color: 'var(--text-subtle)' }}>{label}</p>
                <p
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: color ?? 'var(--text)', background: bg, borderRadius: bg ? '6px' : undefined, padding: bg ? '2px 6px' : undefined, display: 'inline-block' }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Table / Empty state */}
        <div className="animate-fade-in delay-225">
          {!loadingAccounts && accounts.length === 0 ? (
            <div
              className="rounded-2xl border text-center py-24 transition-all duration-200"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--surface-2)' }}
              >
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                  <path d="M2 12L6 7L9 10L13 4" stroke="var(--text-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="font-semibold mb-1 tracking-tight" style={{ color: 'var(--text)' }}>No broker connected</p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Connect your XM MT5 account to see your trades</p>
              <button
                onClick={() => setShowConnect(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
                style={{ background: 'var(--accent)', color: '#fff' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
              >
                Connect XM Broker
              </button>
            </div>
          ) : (
            <DealsTable deals={deals} loading={loadingDeals} error={dealsError} />
          )}
        </div>
      </div>

      {showConnect && (
        <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onAccountConnected} />
      )}
    </div>
  );
}
