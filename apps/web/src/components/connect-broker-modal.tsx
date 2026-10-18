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
    <div className="v3 v3-modal" role="dialog" aria-modal="true" aria-labelledby="cb-t" data-testid="connect-broker-modal">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className={`v3-modal-card bm ${shaking ? 'shake' : ''}`}>
        <header className="v3-modal-hd">
          <div><small>Connect MT5</small><h2 id="cb-t">Add a broker</h2><p>Read-only investor credentials — we can never place trades.</p></div>
          <button onClick={onClose} data-testid="modal-close" aria-label="Close" className="v3-modal-x" style={{ marginLeft: 'auto' }}>×</button>
        </header>
        <form onSubmit={submit} className="bm-bd">
          <div className="bm-sum">
            <span className="bm-mono">{initials}</span>
            <span className="bm-id"><b>{isOther ? 'Custom broker' : brokerName}</b><small>{server || 'MetaTrader 5'}</small></span>
            <span className="bm-live"><i />Bridge online</span>
          </div>
          <label className="n-fld"><span>Broker</span>
            <span className="v3-select bm-sel"><select value={brokerName} onChange={e => onBrokerChange(e.target.value)} data-testid="broker-select">
              {BROKERS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              <option value={OTHER_BROKER}>{OTHER_BROKER} (enter server manually)</option>
            </select><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg></span>
          </label>
          <label className="n-fld"><span>Server</span>
            {isOther ? (
              <input type="text" value={customServer} onChange={e => setCustomServer(e.target.value)} placeholder="e.g. YourBroker-Live" required data-testid="broker-server-custom" className="n-in" />
            ) : (
              <>
                <span className="v3-select bm-sel"><select value={serverSel} onChange={e => setServerSel(e.target.value)} data-testid="broker-server-select">
                  {broker!.servers.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value={CUSTOM_SERVER}>Custom…</option>
                </select><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg></span>
                {serverSel === CUSTOM_SERVER && <input type="text" value={customServer} onChange={e => setCustomServer(e.target.value)} placeholder="e.g. XMGlobal-MT5 12" required data-testid="broker-server-custom" className="n-in" />}
              </>
            )}
          </label>
          <div className="n-row2">
            <label className="n-fld"><span>MT5 login</span>
              <input type="number" inputMode="numeric" value={mt5Login} onChange={e => setMt5Login(e.target.value)} placeholder="345636702" required data-testid="broker-mt5-login" className="n-in num" />
            </label>
            <label className="n-fld"><span>Investor password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required data-testid="broker-investor-password" className="n-in" autoComplete="off" />
            </label>
          </div>
          {error && <div className="d-err" data-testid="broker-error" role="alert"><span>{error}</span></div>}
          <footer className="bm-ft">
            <button type="button" onClick={onClose} className="v3-btn v3-btn--o">Cancel</button>
            <button type="submit" disabled={loading} data-testid="broker-submit" className="v3-btn v3-btn--ink" style={{ paddingRight: 18 }}>{loading ? 'Connecting…' : 'Connect'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
