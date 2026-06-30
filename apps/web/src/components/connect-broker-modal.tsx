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
  const [shaking, setShaking] = useState(false);

  function shake() { setShaking(true); setTimeout(() => setShaking(false), 350); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await api.accounts.connect({
        mt5Login: parseInt(mt5Login || '0', 10),
        password,
        server,
      });
      onConnected(account);
    } catch (err: any) {
      setError(err?.message ?? 'Connection failed');
      shake();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="connect-broker-modal">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md tcard p-6 fade-up ${shaking ? 'shake' : ''}`}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] tracking-[0.25em] text-fg-3">// CONNECT</div>
            <h2 className="font-display font-black text-2xl tracking-tight mt-1">BROKER LINK</h2>
            <p className="text-fg-2 text-[12px] mt-1">Investor (read-only) MT5 credentials.</p>
          </div>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="w-7 h-7 border border-border text-fg-3 hover:text-fg hover:border-border-strong transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-3 border border-border-soft p-3 mb-5">
          <div className="w-9 h-9 bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold">XM</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px]">XM Global MT5</div>
            <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">MetaTrader 5</div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-profit">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> BRIDGE ONLINE
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {[
            { label: 'MT5 LOGIN',          val: mt5Login, set: setMt5Login, type: 'number', placeholder: 'e.g. 345636702' },
            { label: 'INVESTOR PASSWORD',  val: password, set: setPassword, type: 'password', placeholder: '••••••••' },
            { label: 'SERVER',             val: server,   set: setServer,   type: 'text', placeholder: 'XMGlobal-MT5 10' },
          ].map(f => (
            <label key={f.label} className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">{f.label}</span>
              <input
                type={f.type as string}
                value={f.val}
                onChange={e => f.set(e.target.value)}
                placeholder={f.placeholder}
                required
                data-testid={`broker-${f.label.toLowerCase().replace(/\s+/g, '-')}`}
                className="tinput"
              />
            </label>
          ))}

          {error && (
            <div className="border border-loss/30 bg-loss/10 px-3 py-2 text-loss text-[12px]" data-testid="broker-error">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border-soft mt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">CANCEL</button>
            <button
              type="submit"
              disabled={loading}
              data-testid="broker-submit"
              className={`btn btn-primary ${loading ? 'opacity-60 cursor-wait' : ''}`}
            >
              {loading ? 'CONNECTING...' : 'CONNECT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
