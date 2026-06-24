'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import { api, type BrokerAccount, type Deal } from '@/lib/api';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DealsTable from '@/components/deals-table';

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

  // redirect if not authed
  useEffect(() => {
    if (!isPending && !session) router.push('/login');
  }, [session, isPending, router]);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.accounts.list();
      setAccounts(data);
      if (data.length > 0 && !selectedAccount) setSelectedAccount(data[0]);
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top nav */}
      <nav className="border-b px-6 py-3 flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>TradingJournal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{session?.user.email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm px-3 py-1.5 rounded-md border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Your trading activity</p>
          </div>
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <span>+</span> Connect Broker
          </button>
        </div>

        {/* Account selector */}
        {accounts.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccount(acc)}
                className="px-4 py-2 rounded-lg text-sm border transition-colors"
                style={{
                  background: selectedAccount?.id === acc.id ? 'var(--accent)' : 'var(--surface)',
                  borderColor: selectedAccount?.id === acc.id ? 'var(--accent)' : 'var(--border)',
                  color: selectedAccount?.id === acc.id ? '#fff' : 'var(--text)',
                }}
              >
                <span className="font-medium">{acc.broker}</span>
                <span className="ml-2 opacity-70">#{acc.mt5Login}</span>
              </button>
            ))}
          </div>
        )}

        {/* Stats row */}
        {selectedAccount && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Account', value: `#${selectedAccount.mt5Login}` },
              { label: 'Server', value: selectedAccount.server },
              { label: 'Total P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-lg font-semibold" style={{ color: color ?? 'var(--text)' }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Deals table */}
        {loadingAccounts ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border text-center py-20" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M2 12L6 7L9 10L13 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>No broker connected</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Connect your XM MT5 account to see your trades</p>
            <button
              onClick={() => setShowConnect(true)}
              className="px-5 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Connect XM Broker
            </button>
          </div>
        ) : (
          <DealsTable deals={deals} loading={loadingDeals} error={dealsError} />
        )}
      </div>

      {showConnect && (
        <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onAccountConnected} />
      )}
    </div>
  );
}
