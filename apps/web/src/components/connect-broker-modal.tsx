'use client';

import { useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';

interface Props {
  onClose: () => void;
  onConnected: (account: BrokerAccount) => void;
}

function Spinner() {
  return <span className="spin" style={{ display: 'inline-block', width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', flexShrink: 0 }} />;
}

export default function ConnectBrokerModal({ onClose, onConnected }: Props) {
  const [mt5Login, setMt5Login] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('XMGlobal-MT5 10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  function shake() { setShaking(true); setTimeout(() => setShaking(false), 400); }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await api.accounts.connect({ mt5Login: parseInt(mt5Login, 10), password, server });
      onConnected(account);
    } catch (err: any) {
      setError(err.message ?? 'Connection failed');
      shake();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="slide-up w-full max-w-md bg-surface border border-[#27272a] rounded-2xl p-8 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="font-sora text-xl font-semibold tracking-tight text-on-surface">Connect Broker</h2>
              <p className="text-[#a1a1aa] text-sm mt-1">Enter your MT5 investor (read-only) credentials</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-surface-container-low text-[#a1a1aa] flex items-center justify-center transition-colors hover:bg-white/10 hover:text-white shrink-0 cursor-pointer border-none"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Broker pill */}
          <div className="flex items-center gap-3 p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
              XM
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface">XM Global MT5</p>
              <p className="text-xs text-on-surface-variant">MetaTrader 5</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
              <span className="text-xs font-medium text-green-400">Bridge online</span>
            </div>
          </div>

          <form onSubmit={handleConnect} className={`${shaking ? 'shake' : ''} flex flex-col gap-4`}>
            {[
              { label: 'MT5 Login', type: 'number', val: mt5Login, set: setMt5Login, placeholder: 'e.g. 345636702' },
              { label: 'Investor Password', type: 'password', val: password, set: setPassword, placeholder: '••••••••', note: 'read-only' },
              { label: 'Server', type: 'text', val: server, set: setServer, placeholder: 'XMGlobal-MT5 10' },
            ].map(({ label, type, val, set, placeholder, note }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">{label}</label>
                  {note && <span className="text-[10px] text-on-surface-variant/70">({note})</span>}
                </div>
                <input
                  type={type} value={val} onChange={e => set(e.target.value)}
                  placeholder={placeholder} required className="neo-input w-full px-4 py-3 text-sm"
                />
              </div>
            ))}

            {error && (
              <div className="fade-in flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M7 4.5v2.5M7 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div className="mt-4 pt-6 border-t border-[#27272a] flex justify-end gap-3">
              <button
                type="button" onClick={onClose}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-[#a1a1aa] hover:text-white hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={loading}
                className={`px-6 py-2.5 rounded-xl bg-primary-container text-white text-sm font-semibold hover:bg-primary-container/90 transition-all flex items-center gap-2 cursor-pointer border-none ${loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'}`}
              >
                {loading && <Spinner />}
                {loading ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
