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
    <div className="v3 v3-modal" role="dialog" aria-modal="true" aria-labelledby="up-t" data-testid="update-password-modal">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className={`v3-modal-card bm ${shaking ? 'shake' : ''}`}>
        <header className="v3-modal-hd">
          <div><small>Update</small><h2 id="up-t">MT5 password</h2><p>Changed it at the broker? Enter the new investor password to keep syncing.</p></div>
          <button onClick={onClose} aria-label="Close" className="v3-modal-x" style={{ marginLeft: 'auto' }}>×</button>
        </header>
        <form onSubmit={submit} className="bm-bd">
          <div className="bm-sum"><span className="bm-mono">{initials}</span><span className="bm-id"><b>{account.broker} · #{account.mt5Login}</b><small>{account.server}</small></span></div>
          <label className="n-fld"><span>New investor password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              data-testid="update-password-input"
              className="n-in"
            />
          </label>
          {error && <div className="d-err" data-testid="update-password-error" role="alert"><span>{error}</span></div>}
          <footer className="bm-ft">
            <button type="button" onClick={onClose} className="v3-btn v3-btn--o">Cancel</button>
            <button type="submit" disabled={loading} data-testid="update-password-submit" className="v3-btn v3-btn--ink" style={{ paddingRight: 18 }}>{loading ? 'Verifying…' : 'Update password'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
