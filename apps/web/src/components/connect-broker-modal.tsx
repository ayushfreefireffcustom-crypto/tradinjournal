'use client';

import { useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';
import { BROKERS, CUSTOM_SERVER, OTHER_BROKER } from '@/lib/brokers';

interface Props {
  onClose: () => void;
  onConnected: (account: BrokerAccount) => void;
}

const FIRST = BROKERS[0]!;

export default function ConnectBrokerModal({ onClose, onConnected }: Props) {
  const [brokerName, setBrokerName] = useState<string>(FIRST.name);
  const [serverSel, setServerSel] = useState<string>(FIRST.servers[0]!);
  const [customServer, setCustomServer] = useState('');
  const [mt5Login, setMt5Login] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const broker = BROKERS.find(b => b.name === brokerName) ?? null;
  const isOther = brokerName === OTHER_BROKER;
  const usingCustom = isOther || serverSel === CUSTOM_SERVER;
  const server = (usingCustom ? customServer : serverSel).trim();

  function shake() { setShaking(true); setTimeout(() => setShaking(false), 350); }

  function onBrokerChange(name: string) {
    setBrokerName(name);
    const b = BROKERS.find(x => x.name === name);
    setServerSel(b && b.servers.length ? b.servers[0]! : CUSTOM_SERVER);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!server) { setError('Enter the MT5 server name.'); shake(); return; }
    setLoading(true);
    try {
      const account = await api.accounts.connect({
        mt5Login: parseInt(mt5Login || '0', 10),
        password,
        server,
        broker: isOther ? undefined : brokerName,
      });
      onConnected(account);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      shake();
    } finally {
      setLoading(false);
    }
  }

  const initials = brokerName.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT';

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

        {/* Live broker summary */}
        <div className="flex items-center gap-3 border border-border-soft p-3 mb-5">
          <div className="w-9 h-9 bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] truncate">{isOther ? 'Custom broker' : brokerName} MT5</div>
            <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase truncate">{server || 'MetaTrader 5'}</div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-profit">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> BRIDGE ONLINE
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {/* Broker */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.22em] text-fg-3">BROKER</span>
            <select
              value={brokerName}
              onChange={e => onBrokerChange(e.target.value)}
              data-testid="broker-select"
              className="tinput"
            >
              {BROKERS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              <option value={OTHER_BROKER}>{OTHER_BROKER} (enter server manually)</option>
            </select>
          </label>

          {/* Server */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.22em] text-fg-3">SERVER</span>
            {isOther ? (
              <input
                type="text"
                value={customServer}
                onChange={e => setCustomServer(e.target.value)}
                placeholder="e.g. YourBroker-Live"
                required
                data-testid="broker-server-custom"
                className="tinput"
              />
            ) : (
              <>
                <select
                  value={serverSel}
                  onChange={e => setServerSel(e.target.value)}
                  data-testid="broker-server-select"
                  className="tinput"
                >
                  {broker!.servers.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value={CUSTOM_SERVER}>Custom…</option>
                </select>
                {serverSel === CUSTOM_SERVER && (
                  <input
                    type="text"
                    value={customServer}
                    onChange={e => setCustomServer(e.target.value)}
                    placeholder="e.g. XMGlobal-MT5 12"
                    required
                    data-testid="broker-server-custom"
                    className="tinput mt-1.5"
                  />
                )}
              </>
            )}
          </label>

          {/* Login */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.22em] text-fg-3">MT5 LOGIN</span>
            <input
              type="number"
              value={mt5Login}
              onChange={e => setMt5Login(e.target.value)}
              placeholder="e.g. 345636702"
              required
              data-testid="broker-mt5-login"
              className="tinput"
            />
          </label>

          {/* Password */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.22em] text-fg-3">INVESTOR PASSWORD</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              data-testid="broker-investor-password"
              className="tinput"
            />
          </label>

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
