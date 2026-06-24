'use client';

import { useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';

interface Props {
  onClose: () => void;
  onConnected: (account: BrokerAccount) => void;
}

export default function ConnectBrokerModal({ onClose, onConnected }: Props) {
  const [mt5Login, setMt5Login] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('XMGlobal-MT5 10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await api.accounts.connect({
        mt5Login: parseInt(mt5Login, 10),
        password,
        server,
      });
      onConnected(account);
    } catch (err: any) {
      setError(err.message ?? 'Failed to connect broker');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-xl border shadow-2xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Connect XM Broker</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enter your MT5 investor (read-only) credentials</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-lg transition-colors"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              MT5 Account Number
            </label>
            <input
              type="number"
              value={mt5Login}
              onChange={e => setMt5Login(e.target.value)}
              placeholder="345636702"
              required
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              MT5 Investor (Read-Only) Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Server
            </label>
            <input
              type="text"
              value={server}
              onChange={e => setServer(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--red)', background: '#7f1d1d22' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'transparent' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {loading ? 'Verifying…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
