'use client';

import { useState } from 'react';
import { api, type BrokerAccount } from '@/lib/api';
import { BROKERS, CUSTOM_SERVER, OTHER_BROKER } from '@/lib/brokers';
import { V6Portal } from '@/components/confirm-dialog';
import { IClose, ILock } from '@/components/v6/icons';
import { useDialog } from '@/components/v6/ui/use-dialog';
import '@/styles/v6/account.css';
import '@/styles/v6/dialogs.css';

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

  const ref = useDialog({ onClose, locked: loading });

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
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={onClose}>
        <div ref={ref} className={`x-dialog ac-dlg ac-dlg--form ${shaking ? 'ac-shake' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cb-t" data-testid="connect-broker-modal" onMouseDown={e => e.stopPropagation()}>
          <div className="ac-dlg-h">
            <div>
              <h2 id="cb-t">Connect a broker</h2>
              <p className="ac-dlg-msg">Use your investor (read-only) password. TRADElogs can read your trades but never place one.</p>
            </div>
            <button type="button" onClick={onClose} data-testid="modal-close" aria-label="Close" className="x-btn x-btn--ghost x-btn--icon x-btn--sm"><IClose size={16} /></button>
          </div>
          <form onSubmit={submit} className="ac-form">
            <div className="x-inset ac-sum">
              <span className="x-mk">{initials}</span>
              <span className="ac-sum-id"><b>{isOther ? 'Custom broker' : brokerName}</b><small>{server || 'MetaTrader 5'}</small></span>
              <span className="x-tag ac-sum-tag"><ILock size={12} />Read-only</span>
            </div>
            <div className="x-field">
              <label htmlFor="cb-broker">Broker</label>
              <select id="cb-broker" className="x-select" value={brokerName} onChange={e => onBrokerChange(e.target.value)} data-testid="broker-select">
                {BROKERS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                <option value={OTHER_BROKER}>{OTHER_BROKER} (enter server manually)</option>
              </select>
            </div>
            <div className="x-field">
              <label htmlFor={isOther ? 'cb-server-custom' : 'cb-server'}>Server</label>
              {isOther ? (
                <input id="cb-server-custom" type="text" value={customServer} onChange={e => setCustomServer(e.target.value)} placeholder="e.g. YourBroker-Live" required data-testid="broker-server-custom" className="x-input" />
              ) : (
                <>
                  <select id="cb-server" className="x-select" value={serverSel} onChange={e => setServerSel(e.target.value)} data-testid="broker-server-select">
                    {broker!.servers.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value={CUSTOM_SERVER}>Custom…</option>
                  </select>
                  {serverSel === CUSTOM_SERVER && <input type="text" value={customServer} onChange={e => setCustomServer(e.target.value)} placeholder="e.g. XMGlobal-MT5 12" required aria-label="Custom server" data-testid="broker-server-custom" className="x-input" />}
                </>
              )}
            </div>
            <div className="ac-row2">
              <div className="x-field">
                <label htmlFor="cb-login">MT5 login</label>
                <input id="cb-login" type="number" inputMode="numeric" value={mt5Login} onChange={e => setMt5Login(e.target.value)} placeholder="345636702" required data-testid="broker-mt5-login" className="x-input m" />
              </div>
              <div className="x-field">
                <label htmlFor="cb-pass">Investor password</label>
                <input id="cb-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required data-testid="broker-investor-password" className="x-input" autoComplete="off" />
              </div>
            </div>
            {error && <div className="x-banner x-banner--err" data-testid="broker-error" role="alert"><span>{error}</span></div>}
            <footer className="ac-dlg-ft">
              <button type="button" onClick={onClose} className="x-btn">Cancel</button>
              <button type="submit" disabled={loading} data-testid="broker-submit" className="x-btn x-btn--hi">{loading ? 'Connecting…' : 'Connect'}</button>
            </footer>
          </form>
        </div>
      </div>
    </V6Portal>
  );
}
