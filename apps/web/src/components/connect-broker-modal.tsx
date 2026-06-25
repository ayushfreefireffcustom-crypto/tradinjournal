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

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 14, outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  function focus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--accent)';
    e.target.style.boxShadow = '0 0 0 3px var(--accent-glow)';
  }
  function blur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--border-strong)';
    e.target.style.boxShadow = 'none';
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      />

      {/* Modal */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div
          className="slide-up"
          style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Connect Broker</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Enter your MT5 investor (read-only) credentials</p>
            </div>
            <button
              onClick={onClose}
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s, color 0.15s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Broker pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
              XM
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>XM Global MT5</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>MetaTrader 5</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
              <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>Bridge online</span>
            </div>
          </div>

          <form onSubmit={handleConnect} className={shaking ? 'shake' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'MT5 Login', type: 'number', val: mt5Login, set: setMt5Login, placeholder: 'e.g. 345636702' },
              { label: 'Investor Password', type: 'password', val: password, set: setPassword, placeholder: '••••••••', note: 'read-only' },
              { label: 'Server', type: 'text', val: server, set: setServer, placeholder: 'XMGlobal-MT5 10' },
            ].map(({ label, type, val, set, placeholder, note }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</label>
                  {note && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>({note})</span>}
                </div>
                <input
                  type={type} value={val} onChange={e => set(e.target.value)}
                  placeholder={placeholder} required style={inp}
                  onFocus={focus} onBlur={blur}
                />
              </div>
            ))}

            {error && (
              <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--red-bg)', border: '1px solid rgba(240,82,82,0.25)', color: 'var(--red)', fontSize: 13 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M7 4.5v2.5M7 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button" onClick={onClose}
                style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Cancel
              </button>
              <button
                type="submit" disabled={loading}
                style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s, transform 0.1s' }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--accent-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; }}
                onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
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
