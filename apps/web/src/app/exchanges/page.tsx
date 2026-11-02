'use client';

// Exchange connections for trading and copy trading (B5): the venue catalogue,
// one card per connected account (health, equity, Test / Rename / Remove), and
// the connect wizard (pick exchange → paste key and secret → verify).
import { useEffect, useState } from 'react';
import Link from '@/components/v6/ui/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ago, useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import { ICheck, ICopy, IExchange, ILock, IPlus, ISync } from '@/components/v6/icons';
import { TRADING_ENABLED } from '@/lib/features';
import { exchangesApi, usd, venueName, type ExchangeCatalogItem, type ExchangeConnection, type ExchangeEnvironment } from '@/lib/copy-api';
import { invalidateExchangeConnections } from '@/lib/use-exchange-connections';
import '@/styles/v6/dialogs.css';
import '@/styles/v6/kit.css';
import '@/styles/v6/copy.css';

export default function ExchangesPage() {
  const toast = useToast();
  const catalog = useLoad(() => exchangesApi.catalog(), []);
  const conns = useLoad(() => exchangesApi.list(), []);
  const [connecting, setConnecting] = useState<ExchangeCatalogItem | null>(null);
  const [removing, setRemoving] = useState<ExchangeConnection | null>(null);
  const [renaming, setRenaming] = useState<ExchangeConnection | null>(null);

  if (!TRADING_ENABLED) return <AppShell legacy={false} pageTitle="Exchanges"><div className="x-page"><div className="x-card x-empty"><b>Coming soon</b><p>Exchange connections aren&rsquo;t available yet.</p></div></div></AppShell>;

  const list = conns.data ?? [];
  const live = (catalog.data ?? []).filter(c => c.availability !== 'COMING_SOON');
  const replace = (c: ExchangeConnection) => conns.setData(prev => (prev ?? []).map(x => (x.id === c.id ? c : x)));

  return (
    <AppShell legacy={false} pageTitle="Exchanges" pageSubtitle="Your crypto exchange accounts"
      actions={live.length > 0 && <button className="x-btn" onClick={() => setConnecting(live[0]!)} data-testid="ex-connect"><IPlus size={15} />Connect exchange</button>}>
      <div className="x-page" data-testid="exchanges-page">
        {conns.error ? <ErrorCard message={conns.error} onRetry={conns.reload} /> : conns.loading && !conns.data ? (
          <div className="cp-grid">{[0, 1].map(i => <div key={i} className="x-skel cp-skel-card" />)}</div>
        ) : list.length === 0 ? (
          <section className="x-card cp-hero" data-testid="ex-empty">
            <span className="x-ic cp-hero-ic"><IExchange size={22} /></span>
            <div>
              <h2>Connect an exchange account</h2>
              <p className="x-lead">Copy trading places orders on your own exchange account through an API key you create. Your money stays on the exchange.</p>
              <ul className="cp-can">
                <li><ICheck size={15} /><span>Can place and close orders for the leaders you copy</span></li>
                <li><ICheck size={15} /><span>Can read your balance and positions</span></li>
                <li className="no"><ILock size={15} /><span>Can never withdraw or transfer funds: exchange API keys can&rsquo;t</span></li>
              </ul>
              {live[0] && <button className="x-btn x-btn--hi x-btn--lg" onClick={() => setConnecting(live[0]!)}>Connect {live[0].displayName}</button>}
            </div>
          </section>
        ) : (
          <section aria-label="Your exchange accounts" className="cp-grid" data-testid="ex-list">
            {list.map(c => <ConnectionCard key={c.id} c={c} onChange={replace} onRename={() => setRenaming(c)} onRemove={() => setRemoving(c)} />)}
          </section>
        )}

        <section className="x-card" aria-label="Exchanges">
          <div className="x-ch"><h2>Exchanges</h2><span className="x-sub">More are on the way</span></div>
          {catalog.error ? <p className="x-muted">{catalog.error}</p> : (
            <div className="cp-cat">
              {(catalog.data ?? []).map(x => {
                const n = list.filter(c => c.exchange === x.id).length;
                return (
                  <div key={x.id} className="x-inset cp-cat-i" data-testid={`ex-cat-${x.id}`}>
                    <span className="x-mk">{x.displayName.slice(0, 2).toUpperCase()}</span>
                    <div className="cp-cat-t">
                      <b>{x.displayName}</b>
                      <small>{x.availability === 'COMING_SOON' ? 'Coming soon' : x.environments.includes('LIVE') ? 'Live and testnet' : 'Testnet (practice money) for now'}{n ? ` · ${n} connected` : ''}</small>
                    </div>
                    {x.availability !== 'COMING_SOON' && <button className="x-btn x-btn--sm" onClick={() => setConnecting(x)}>Connect</button>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <p className="cp-note"><ILock size={14} />Keys are encrypted the moment they arrive and are never shown again, not even to you.</p>
      </div>

      {connecting && (
        <ConnectDialog item={connecting} onClose={() => setConnecting(null)}
          onDone={c => { conns.setData(prev => [...(prev ?? []), c]); setConnecting(null); toast.success(`Connected · ${c.label}`); }} />
      )}
      {renaming && <RenameDialog c={renaming} onClose={() => setRenaming(null)} onDone={c => { replace(c); setRenaming(null); }} />}
      {removing && (
        <RemoveDialog c={removing} onClose={() => setRemoving(null)}
          onDone={() => { conns.setData(prev => (prev ?? []).filter(x => x.id !== removing.id)); toast.success(`Removed · ${removing.label}`); setRemoving(null); }} />
      )}
    </AppShell>
  );
}

function ConnectionCard({ c, onChange, onRename, onRemove }: { c: ExchangeConnection; onChange: (c: ExchangeConnection) => void; onRename: () => void; onRemove: () => void }) {
  const toast = useToast();
  const [equity, setEquity] = useState<number | null | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  const ok = c.status === 'ACTIVE';

  useEffect(() => {
    if (!ok) { setEquity(null); return; }
    let live = true;
    exchangesApi.equity(c.id).then(e => live && setEquity(e.equityUsd)).catch(() => live && setEquity(null));
    return () => { live = false; };
  }, [c.id, ok]);

  async function test() {
    setTesting(true);
    try {
      const r = await exchangesApi.test(c.id);
      onChange(r);
      if (r.status === 'ACTIVE') toast.success('Connection works');
      else toast.error(r.lastError ?? 'The exchange rejected this key');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  const role = c.isLeader ? 'Your leader account' : c.activeFollows > 0 ? `Copying onto this account (${c.activeFollows})` : 'Not used for copying yet';
  return (
    <article className={`x-card cp-conn ${ok ? '' : 'off'}`} data-testid={`ex-conn-${c.id}`}>
      <header className="cp-conn-h">
        <span className="x-mk">DE</span>
        <div className="cp-conn-id">
          <b>{c.label}</b>
          <small>{venueName(c.exchange)} · key ···{c.keyLast4}</small>
        </div>
        <span className={`x-tag ${c.environment === 'LIVE' ? 'x-tag--solid' : ''}`}>{c.environment === 'LIVE' ? 'Live' : 'Testnet'}</span>
      </header>
      <div className="x-strip cp-conn-figs" style={{ ['--n' as string]: 2 }}>
        <div><span>Equity</span><b className="m">{equity === undefined ? <i className="x-skel x-skel--in cp-skel-num" /> : usd(equity)}</b></div>
        <div><span>Status</span><b className="cp-conn-st">{ok ? <><i className="x-dot" />Working</> : <><i className="x-dot x-dot--r" />Needs reconnecting</>}</b></div>
      </div>
      {c.lastError && !ok && <p className="cp-err" role="status">{c.lastError}</p>}
      {!c.canTrade && ok && <p className="cp-err" role="status">This key can&rsquo;t trade. Turn on the Trading permission for it on the exchange.</p>}
      <footer className="cp-conn-f">
        <span className="x-muted">{role} · checked {ago(c.lastCheckedAt)}</span>
        <span className="cp-conn-acts">
          <button className="x-btn x-btn--sm" onClick={test} disabled={testing} data-testid={`ex-test-${c.id}`}><ISync size={14} />{testing ? 'Testing…' : 'Test'}</button>
          <button className="x-btn x-btn--sm" onClick={onRename}>Rename</button>
          <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={onRemove} data-testid={`ex-remove-${c.id}`}>Remove</button>
        </span>
      </footer>
    </article>
  );
}

function CopyBox({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="cp-copybox m" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }} aria-label={`Copy ${text}`}>
      <span>{text}</span>{done ? <ICheck size={14} /> : <ICopy size={14} />}
    </button>
  );
}

function ConnectDialog({ item, onClose, onDone }: { item: ExchangeCatalogItem; onClose: () => void; onDone: (c: ExchangeConnection) => void }) {
  const [env, setEnv] = useState<ExchangeEnvironment>(item.environments[0] ?? 'TESTNET');
  const [label, setLabel] = useState('');
  const [apiKey, setKey] = useState('');
  const [apiSecret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyUrl = env === 'LIVE' ? item.keyPageUrl.live : item.keyPageUrl.testnet;
  const ready = apiKey.trim().length >= 8 && apiSecret.trim().length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const conn = await exchangesApi.connect({ exchange: item.id as 'DELTA_INDIA', environment: env, label: label.trim() || undefined, apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      invalidateExchangeConnections();
      onDone(conn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  const paste = async (set: (v: string) => void) => { try { set((await navigator.clipboard.readText()).trim()); } catch { /* clipboard blocked: type it */ } };

  return (
    <Modal title={`Connect ${item.displayName}`} sub="Create an API key on the exchange, then paste it here. We check it with the exchange before saving." onClose={onClose} busy={busy} testId="ex-connect-dialog">
      <form onSubmit={submit} className="cp-form">
        {item.environments.length > 1 && (
          <div className="x-seg x-seg--in" role="tablist" aria-label="Account type">
            {item.environments.map(x => <button key={x} type="button" role="tab" aria-selected={env === x} className={env === x ? 'on' : ''} onClick={() => setEnv(x)}>{x === 'LIVE' ? 'Live account' : 'Testnet'}</button>)}
          </div>
        )}
        <ol className="cp-steps">
          <li>
            <b>Create a key</b>
            <span>{item.keyInstructions}</span>
            {keyUrl && <a className="x-link" href={keyUrl} target="_blank" rel="noreferrer">Open the {env === 'LIVE' ? '' : 'testnet '}API keys page</a>}
          </li>
          <li>
            <b>Permissions</b>
            <span>Turn on <em>Read</em> and <em>Trading</em>. Leave everything else off.</span>
          </li>
          {item.ipWhitelistRequired && (
            <li>
              <b>Whitelist these IPs on the key</b>
              {item.whitelistIps.length ? <span className="cp-ips">{item.whitelistIps.map(ip => <CopyBox key={ip} text={ip} />)}</span> : <span className="x-muted">Our server addresses will be listed here. Until they are, ask support for the IP to add before you create a trading key.</span>}
            </li>
          )}
        </ol>
        <div className="x-field">
          <label htmlFor="ex-key">API key</label>
          <div className="cp-inrow">
            <input id="ex-key" className="x-input m" value={apiKey} onChange={e => setKey(e.target.value)} autoComplete="off" spellCheck={false} data-testid="ex-key" />
            <button type="button" className="x-btn x-btn--sm" onClick={() => paste(setKey)}>Paste</button>
          </div>
        </div>
        <div className="x-field">
          <label htmlFor="ex-secret">API secret</label>
          <div className="cp-inrow">
            <input id="ex-secret" className="x-input m" type="password" value={apiSecret} onChange={e => setSecret(e.target.value)} autoComplete="off" spellCheck={false} data-testid="ex-secret" />
            <button type="button" className="x-btn x-btn--sm" onClick={() => paste(setSecret)}>Paste</button>
          </div>
        </div>
        <div className="x-field">
          <label htmlFor="ex-label">Name <span className="x-muted">(optional)</span></label>
          <input id="ex-label" className="x-input" value={label} onChange={e => setLabel(e.target.value.slice(0, 40))} placeholder={env === 'LIVE' ? 'Live account' : 'Testnet account'} />
        </div>
        {error && <div className="x-banner x-banner--err" role="alert" data-testid="ex-connect-error">{error}</div>}
        <p className="cp-fine"><ILock size={13} />Your key is encrypted before it&rsquo;s stored. TRADElogs never holds your funds.</p>
        <footer className="ac-dlg-ft">
          <button type="button" className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="x-btn x-btn--hi" disabled={!ready || busy} data-testid="ex-connect-submit">{busy ? 'Checking with the exchange…' : 'Verify and connect'}</button>
        </footer>
      </form>
    </Modal>
  );
}

function RenameDialog({ c, onClose, onDone }: { c: ExchangeConnection; onClose: () => void; onDone: (c: ExchangeConnection) => void }) {
  const [label, setLabel] = useState(c.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Rename account" onClose={onClose} busy={busy}>
      <form className="cp-form" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        try { onDone(await exchangesApi.rename(c.id, label.trim())); } catch (err) { setError(err instanceof Error ? err.message : 'Could not rename'); } finally { setBusy(false); }
      }}>
        <div className="x-field"><label htmlFor="ex-rn">Name</label><input id="ex-rn" className="x-input" value={label} onChange={e => setLabel(e.target.value.slice(0, 40))} autoFocus /></div>
        {error && <div className="x-banner x-banner--err" role="alert">{error}</div>}
        <footer className="ac-dlg-ft">
          <button type="button" className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="x-btn x-btn--hi" disabled={busy || !label.trim() || label.trim() === c.label}>Save</button>
        </footer>
      </form>
    </Modal>
  );
}

function RemoveDialog({ c, onClose, onDone }: { c: ExchangeConnection; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = c.isLeader ? 'This is your leader account. Stop being a leader before removing it.' : c.activeFollows > 0 ? 'Copy trading is running on this account. Stop those copies first.' : null;
  return (
    <Modal title={`Remove ${c.label}?`} sub="We delete the stored key. Your exchange account and its positions are not touched; delete the key on the exchange too." onClose={onClose} busy={busy} testId="ex-remove-dialog">
      {blocked ? (
        <>
          <div className="x-banner" role="status">{blocked}</div>
          <footer className="ac-dlg-ft"><Link href={c.isLeader ? '/copy/lead' : '/copy/following'} className="x-btn">{c.isLeader ? 'Leader settings' : 'My copies'}</Link><button className="x-btn x-btn--hi" onClick={onClose}>OK</button></footer>
        </>
      ) : (
        <form className="cp-form" onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          try { await exchangesApi.remove(c.id); invalidateExchangeConnections(); onDone(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove'); } finally { setBusy(false); }
        }}>
          <div className="x-field">
            <label htmlFor="ex-rm">Type <b>remove</b> to confirm</label>
            <input id="ex-rm" className="x-input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus data-testid="ex-remove-type" />
          </div>
          {error && <div className="x-banner x-banner--err" role="alert">{error}</div>}
          <footer className="ac-dlg-ft">
            <button type="button" className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="x-btn x-btn--danger" disabled={busy || typed.trim().toLowerCase() !== 'remove'} data-testid="ex-remove-confirm">{busy ? 'Removing…' : 'Remove account'}</button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
