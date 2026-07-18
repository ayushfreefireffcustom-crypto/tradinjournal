'use client';

// Update the stored MT5 password for an already-connected account — used when a
// trader changes their password at the broker. The API re-verifies the new
// password against the broker before saving, so a wrong entry fails here with a
// clear message and nothing is persisted.

import { useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';

interface Props {
  account: BrokerAccount;
  onClose: () => void;
  onUpdated: (account: BrokerAccount) => void;
}

export default function UpdateBrokerPasswordModal({ account, onClose, onUpdated }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  function shake() { setShaking(true); setTimeout(() => setShaking(false), 350); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!password) { setError('Enter your new MT5 password.'); shake(); return; }
    setLoading(true);
    try {
      const updated = await api.accounts.updateCredentials(account.id, password);
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password');
      shake();
    } finally {
      setLoading(false);
    }
  }

  const initials = account.broker.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="update-password-modal">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md tcard p-6 fade-up ${shaking ? 'shake' : ''}`}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] tracking-[0.25em] text-fg-3">// UPDATE</div>
            <h2 className="font-display font-black text-2xl tracking-tight mt-1">MT5 PASSWORD</h2>
            <p className="text-fg-2 text-[12px] mt-1">Changed your password at the broker? Enter the new one to keep syncing.</p>
          </div>
          <button
            onClick={onClose}
            data-testid="update-password-close"
            className="w-7 h-7 border border-border text-fg-3 hover:text-fg hover:border-border-strong transition-colors"
          >
            ×
          </button>
        </div>

        {/* Account summary */}
        <div className="flex items-center gap-3 border border-border-soft p-3 mb-5">
          <div className="w-9 h-9 bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] truncate">{account.broker} · #{account.mt5Login}</div>
            <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase truncate">{account.server}</div>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.22em] text-fg-3">NEW INVESTOR PASSWORD</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              data-testid="update-password-input"
              className="tinput"
            />
          </label>

          {error && (
            <div className="border border-loss/30 bg-loss/10 px-3 py-2 text-loss text-[12px]" data-testid="update-password-error">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border-soft mt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">CANCEL</button>
            <button
              type="submit"
              disabled={loading}
              data-testid="update-password-submit"
              className={`btn btn-primary ${loading ? 'opacity-60 cursor-wait' : ''}`}
            >
              {loading ? 'VERIFYING...' : 'UPDATE PASSWORD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
