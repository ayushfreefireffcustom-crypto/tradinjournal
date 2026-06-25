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
  const [shake, setShake] = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  async function handleConnect(e: React.FormEvent) {
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
      setError(err.message ?? 'Connection failed');
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  const inputBase = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all duration-150";
  const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border-strong)', color: 'var(--text)' };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-2xl border p-6 animate-slide-up"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Connect Broker</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enter your MT5 investor (read-only) credentials</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
              style={{ color: 'var(--text-muted)', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <form onSubmit={handleConnect} className={`space-y-4 ${shake ? 'animate-shake' : ''}`}>

            {/* Broker badge */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
              >
                XM
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>XM Global MT5</p>
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>MetaTrader 5</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                <span className="text-xs" style={{ color: 'var(--green)' }}>Bridge online</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>MT5 Login</label>
              <input
                type="number"
                value={mt5Login}
                onChange={e => setMt5Login(e.target.value)}
                placeholder="e.g. 345636702"
                required
                className={inputBase}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Investor Password
                <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-subtle)' }}>(read-only)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={inputBase}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Server</label>
              <input
                type="text"
                value={server}
                onChange={e => setServer(e.target.value)}
                placeholder="XMGlobal-MT5 10"
                required
                className={inputBase}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {error && (
              <div className="animate-slide-up flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--red-subtle)', color: 'var(--red)', border: '1px solid #ef444430' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-60"
                style={{ background: 'var(--accent)', color: '#fff' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
                onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      Connecting…
                    </span>
                  : 'Connect'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
