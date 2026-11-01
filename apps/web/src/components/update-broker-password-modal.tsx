'use client';

// Update the stored MT5 password for an already-connected account — used when a
// trader changes their password at the broker. The API re-verifies the new
// password against the broker before saving, so a wrong entry fails here with a
// clear message and nothing is persisted.

import { useEffect, useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';
import { V6Portal } from '@/components/confirm-dialog';
import { IClose } from '@/components/v3/icons';
import '@/styles/v6/account.css';
import '@/styles/v6/dialogs.css';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

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
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={onClose}>
        <div className={`x-dialog ac-dlg ac-dlg--form ${shaking ? 'ac-shake' : ''}`} role="dialog" aria-modal="true" aria-labelledby="up-t" data-testid="update-password-modal" onMouseDown={e => e.stopPropagation()}>
          <div className="ac-dlg-h">
            <div>
              <h2 id="up-t">Update MT5 password</h2>
              <p className="ac-dlg-msg">Changed it at the broker? Enter the new investor password to keep syncing.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="x-btn x-btn--ghost x-btn--icon x-btn--sm"><IClose size={16} /></button>
          </div>
          <form onSubmit={submit} className="ac-form">
            <div className="x-inset ac-sum">
              <span className="x-mk">{initials}</span>
              <span className="ac-sum-id"><b>{account.broker} <span className="m x-muted">#{account.mt5Login}</span></b><small>{account.server}</small></span>
            </div>
            <div className="x-field">
              <label htmlFor="up-pass">New investor password</label>
              <input
                id="up-pass"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                data-testid="update-password-input"
                className="x-input"
              />
            </div>
            {error && <div className="x-banner x-banner--err" data-testid="update-password-error" role="alert"><span>{error}</span></div>}
            <footer className="ac-dlg-ft">
              <button type="button" onClick={onClose} className="x-btn">Cancel</button>
              <button type="submit" disabled={loading} data-testid="update-password-submit" className="x-btn x-btn--hi">{loading ? 'Verifying…' : 'Update password'}</button>
            </footer>
          </form>
        </div>
      </div>
    </V6Portal>
  );
}
