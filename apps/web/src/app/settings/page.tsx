'use client';

// User dashboard: profile at a glance + broker-account management (view, add,
// delete). The account cap (2) is enforced by the backend; here we reflect it in
// the UI and surface friendly toasts.

import { useState } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import EmptyState from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { Bank, Trash, SignOut } from '@phosphor-icons/react';

const MAX_ACCOUNTS = 2;

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  const { accounts, selected, select, setAccounts, loading } = useAccounts();
  const toast = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrokerAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const atLimit = accounts.length >= MAX_ACCOUNTS;

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.find(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
    toast.success(`Connected · ${account.broker} #${account.mt5Login}`);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.accounts.delete(pendingDelete.id);
      setAccounts(prev => prev.filter(a => a.id !== pendingDelete.id));
      toast.success(`Removed · ${pendingDelete.broker} #${pendingDelete.mt5Login}`);
      setPendingDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove account');
    } finally {
      setDeleting(false);
    }
  }

  const name = session?.user?.name ?? '—';
  const email = session?.user?.email ?? '';
  const initial = name.charAt(0).toUpperCase() || 'A';

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => { if (!atLimit) setShowConnect(true); }}
      pageTitle="Settings"
      pageSubtitle="// YOUR ACCOUNT"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto fade-up" data-testid="settings-page">
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.25em] text-fg-3">[ SETTINGS // YOUR ACCOUNT ]</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">SETTINGS</h1>
        </div>

        {/* Profile */}
        <div className="tcard p-5 mb-5" data-testid="settings-profile">
          <div className="text-[10px] tracking-[0.25em] text-fg-3 mb-3">PROFILE</div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-md bg-surface-hover border border-border flex items-center justify-center font-display font-black text-lg">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-[15px] tracking-tight truncate">{name}</div>
              {email && <div className="text-[12px] text-fg-3 truncate">{email}</div>}
            </div>
            <button
              onClick={() => authClient.signOut()}
              data-testid="settings-signout"
              className="btn btn-ghost ml-auto flex items-center gap-2 shrink-0"
            >
              <SignOut size={14} weight="bold" /> SIGN OUT
            </button>
          </div>
        </div>

        {/* Connected brokers */}
        <div className="tcard p-5" data-testid="settings-accounts">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">CONNECTED BROKERS</div>
            <div className="text-[10px] tracking-[0.2em] text-fg-3 numeric" data-testid="settings-account-count">
              {accounts.length} / {MAX_ACCOUNTS} CONNECTED
            </div>
          </div>

          {loading ? (
            <div className="h-20 rounded-md bg-surface animate-pulse" />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Bank}
              title="No brokers connected"
              hint="Connect your MT5 account to start importing trades. You can link up to two accounts."
              testId="settings-accounts-empty"
              action={
                <button onClick={() => setShowConnect(true)} className="btn btn-primary" data-testid="settings-empty-add">
                  + ADD BROKER
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  data-testid={`settings-account-${acc.mt5Login}`}
                  className="flex items-center gap-3 border border-border-soft p-3"
                >
                  <div className="w-9 h-9 bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold shrink-0">
                    {acc.broker.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{acc.broker} · #{acc.mt5Login}</div>
                    <div className="text-[10px] tracking-[0.16em] text-fg-3 uppercase truncate">
                      {acc.server} · {acc.baseCurrency} · {acc.status}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingDelete(acc)}
                    data-testid={`settings-delete-${acc.mt5Login}`}
                    className="btn btn-ghost flex items-center gap-2 shrink-0 hover:border-loss hover:text-loss"
                  >
                    <Trash size={14} weight="bold" /> DELETE
                  </button>
                </div>
              ))}

              <div className="pt-3 mt-1 border-t border-border-soft flex items-center justify-between gap-3">
                <span className="text-[11px] text-fg-3">
                  {atLimit ? 'Account limit reached — remove one to add another.' : 'You can connect one more account.'}
                </span>
                <button
                  onClick={() => setShowConnect(true)}
                  disabled={atLimit}
                  data-testid="settings-add-broker"
                  className={`btn btn-primary shrink-0 ${atLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  + ADD BROKER
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConnect && (
        <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Remove this broker?"
          message={`${pendingDelete.broker} #${pendingDelete.mt5Login} will be disconnected and its synced data removed. You can re-connect it later.`}
          confirmLabel="DELETE"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </AppShell>
  );
}
