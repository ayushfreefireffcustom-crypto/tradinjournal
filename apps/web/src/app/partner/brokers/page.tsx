'use client';

// The partner's IB connections: which brokers they're an IB with and the list of
// accounts each broker shows under them. A client is verified only when their
// connected MT5 account number appears in that list.
import { useCallback, useEffect, useState } from 'react';
import { FileArrowUp, GoogleDriveLogo, Plugs, ArrowsClockwise, Trash, UploadSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { ibApi, type ApiConfig, type BrokerCatalogEntry, type IbMethod, type Integration, type PartnerBroker, type UploadResult } from '@/lib/ib-api';
import { CopyButton } from '@/components/v6/account/partner-parts';
import { timeAgo } from '@/components/app-shell';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { BrokerHealthRow } from '@/components/v6/account/ib-parts';
import { useConfirm } from '@/components/confirm-dialog';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const METHODS: { k: IbMethod; l: string; s: string; I: typeof Plugs }[] = [
  { k: 'LIST', l: 'Upload a list', s: 'Export clients from your IB portal as CSV, or paste them', I: FileArrowUp },
  { k: 'SHEET', l: 'Google Sheet', s: 'We re-read it every hour', I: GoogleDriveLogo },
  { k: 'API', l: 'Broker API', s: 'Set up the API connection after connecting', I: Plugs },
];

export default function PartnerBrokersPage() {
  const { accounts, selected, select } = useAccounts();
  const [brokers, setBrokers] = useState<PartnerBroker[] | null>(null);
  const [catalog, setCatalog] = useState<BrokerCatalogEntry[]>([]);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [integFor, setIntegFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await ibApi.brokers();
      setBrokers(r.brokers); setCatalog(r.catalog); setError('');
      if (!r.brokers.length) setAdding(true);
    } catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(msg(e, 'Could not load your brokers.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); }, [toast]);

  async function sync(b: PartnerBroker) {
    setBusy(b.id);
    try { const r = await ibApi.syncBroker(b.id); setToast(r.status === 'ERROR' ? `Sync failed: ${r.lastError}` : `${b.label} list synced: ${r.accountCount} accounts.`); await load(); }
    catch (e) { setToast(msg(e, 'Sync failed.')); } finally { setBusy(null); }
  }
  async function remove(b: PartnerBroker) {
    const ok = await ask({ title: `Disconnect ${b.label}?`, body: 'Its account list is deleted. Clients verified through it lose that check, and their packages move to the grace period.', confirmLabel: 'Disconnect', tone: 'danger' });
    if (!ok) return;
    setBusy(b.id);
    try { await ibApi.removeBroker(b.id); setToast(`${b.label} disconnected.`); await load(); }
    catch (e) { setToast(msg(e, 'Could not disconnect.')); } finally { setBusy(null); }
  }

  const taken = new Set(brokers?.map(b => b.broker) ?? []);
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Brokers"
      pageSubtitle="Your IB connections and referred-accounts lists"
      actions={brokers && !gate && !adding ? <button type="button" className="x-btn x-btn--hi" onClick={() => setAdding(true)} data-testid="ib-add-broker">Connect a broker</button> : null}>
      <div className="x-page" data-testid="partner-brokers">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!brokers && !error && <div className="x-skel ac-sk-320" />}

          {brokers && adding && (
            <ConnectCard catalog={catalog.filter(c => !taken.has(c.key))} onCancel={brokers.length ? () => setAdding(false) : undefined}
              onDone={async b => { setAdding(false); setToast(`${b.label} connected.`); await load(); if (b.method === 'LIST') setUploadFor(b.id); }} />
          )}

          {brokers && brokers.length > 0 && (
            <section className="x-card" data-testid="ib-broker-list">
              <div className="x-ch"><h2>Connected brokers</h2><span className="x-sub"><span className="m">{brokers.length}</span></span></div>
              <ul className="ib-brs">
                {brokers.map(b => (
                  <BrokerHealthRow key={b.id} b={b} right={
                    <span className="ib-br-btns">
                      {b.method !== 'LIST'
                        ? <button type="button" className="x-btn x-btn--sm" disabled={busy === b.id} onClick={() => void sync(b)}><ArrowsClockwise size={14} weight="bold" />{busy === b.id ? 'Syncing…' : 'Sync now'}</button>
                        : <button type="button" className="x-btn x-btn--sm" onClick={() => { setIntegFor(null); setUploadFor(uploadFor === b.id ? null : b.id); }} data-testid={`ib-upload-${b.broker}`}><UploadSimple size={14} weight="bold" />Upload list</button>}
                      <button type="button" className="x-btn x-btn--sm" onClick={() => { setUploadFor(null); setIntegFor(integFor === b.id ? null : b.id); }} data-testid={`ib-integ-${b.broker}`}><Plugs size={14} weight="bold" />Postback, API & reports</button>
                      <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={busy === b.id} onClick={() => void remove(b)} aria-label={`Disconnect ${b.label}`}><Trash size={14} weight="bold" /></button>
                    </span>
                  } />
                ))}
              </ul>
              {uploadFor && brokers.find(b => b.id === uploadFor) && (
                <UploadPanel b={brokers.find(b => b.id === uploadFor)!} hint={catalog.find(c => c.key === brokers.find(b => b.id === uploadFor)!.broker)?.listHint}
                  onDone={async r => { setToast(`${r.broker.accountCount} accounts listed; ${r.rechecked} client accounts re-checked.`); await load(); }} />
              )}
              {integFor && brokers.find(b => b.id === integFor) && (
                <IntegrationPanel b={brokers.find(b => b.id === integFor)!} onToast={setToast} onChanged={load} />
              )}
            </section>
          )}

          <section className="x-card" data-testid="ib-how">
            <div className="x-ch"><h2>How verification works</h2></div>
            <ol className="ib-steps">
              <li>Your client signs up with your link or code, then connects their MT5 account.</li>
              <li>We look for that account number in the list for its broker. A match verifies them.</li>
              <li>An email match alone isn&rsquo;t proof, so those go to our team for a manual check.</li>
              <li>Clients who aren&rsquo;t found see why, and can retry or ask for a review. Lists re-check every client when they change.</li>
            </ol>
          </section>
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}

function ConnectCard({ catalog, onDone, onCancel }: { catalog: BrokerCatalogEntry[]; onDone: (b: PartnerBroker) => void; onCancel?: () => void }) {
  const [broker, setBroker] = useState(catalog[0]?.key ?? '');
  const [method, setMethod] = useState<IbMethod>('LIST');
  const [ibId, setIbId] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [serverMatch, setServerMatch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const entry = catalog.find(c => c.key === broker);
  if (!catalog.length) return null;
  const valid = !!broker && (method !== 'SHEET' || /^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheetUrl.trim())) && (broker !== 'other' || serverMatch.trim().length >= 3);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      onDone(await ibApi.saveBroker({
        broker, method, ...(ibId.trim() ? { ibId: ibId.trim() } : {}),
        ...(method === 'SHEET' ? { sheetUrl: sheetUrl.trim() } : {}), ...(broker === 'other' ? { serverMatch: serverMatch.trim() } : {}),
      }));
    } catch (x) { setErr(msg(x, 'Could not connect that broker.')); } finally { setBusy(false); }
  }
  return (
    <section className="x-card" data-testid="ib-connect">
      <div className="x-ch"><h2>Connect a broker</h2>{onCancel && <div className="x-r"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={onCancel}>Cancel</button></div>}</div>
      <form className="ac-form ac-form--wide" onSubmit={submit}>
        <div className="ib-form-row">
          <div className="x-field">
            <label htmlFor="ib-broker">Broker</label>
            <select id="ib-broker" className="x-select" value={broker} onChange={e => setBroker(e.target.value)} data-testid="ib-broker-select">
              {catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="x-field">
            <label htmlFor="ib-id">Your IB / partner id <span className="x-dim">(optional)</span></label>
            <input id="ib-id" className="x-input m" maxLength={60} value={ibId} onChange={e => setIbId(e.target.value)} placeholder="e.g. XL-4471" />
          </div>
          {broker === 'other' && (
            <div className="x-field">
              <label htmlFor="ib-server">MT5 server name contains</label>
              <input id="ib-server" className="x-input m" maxLength={60} value={serverMatch} onChange={e => setServerMatch(e.target.value)} placeholder="AcmeFX-Live" />
            </div>
          )}
        </div>
        <span className="ib-legend">Where the list comes from</span>
        <div className="ib-methods" role="group" aria-label="List source">
          {METHODS.map(m => {
            const off = m.k === 'API' && !entry?.methods.includes('API');
            return (
              <button key={m.k} type="button" className="ib-method" aria-pressed={method === m.k} disabled={off} onClick={() => setMethod(m.k)}>
                <m.I size={20} weight="duotone" aria-hidden /><b>{m.l}</b><small>{off ? m.s : m.k === 'API' ? 'Live from the broker' : m.s}</small>
              </button>
            );
          })}
        </div>
        {method === 'SHEET' && (
          <div className="x-field">
            <label htmlFor="ib-sheet">Google Sheets link</label>
            <input id="ib-sheet" className="x-input" type="url" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <span className="x-help">Share it as &ldquo;Anyone with the link can view&rdquo;. One row per client, with an account column (and email if you have it).</span>
          </div>
        )}
        {entry && <p className="ib-note">What to put in the list: {entry.listHint}.</p>}
        {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
        <div><button type="submit" className="x-btn x-btn--hi" disabled={!valid || busy} data-testid="ib-connect-submit">{busy ? 'Connecting…' : 'Connect'}</button></div>
      </form>
    </section>
  );
}

function UploadPanel({ b, hint, onDone }: { b: PartnerBroker; hint?: string; onDone: (r: UploadResult) => Promise<void> }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<UploadResult | null>(null);
  async function file(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) { setErr('That file is over 2 MB.'); return; }
    setText(await f.text());
  }
  async function send() {
    setBusy(true); setErr(''); setRes(null);
    try { const r = await ibApi.uploadList(b.id, text, mode); setRes(r); setText(''); await onDone(r); }
    catch (x) { setErr(msg(x, 'Upload failed.')); } finally { setBusy(false); }
  }
  return (
    <div className="x-inset ib-upload" data-testid="ib-upload-panel">
      <b>Upload the {b.label} list</b>
      <p className="ib-note">{hint ?? 'Account numbers (and emails) of the clients under your IB'}. CSV with a header row, or one account per line.</p>
      <textarea className="x-textarea" value={text} onChange={e => setText(e.target.value)} placeholder={'Account ID,Email\n7001001,client@mail.com\n7001002,'} aria-label="Accounts list" data-testid="ib-upload-text" />
      <div className="ib-upload-row">
        <label className="x-btn x-btn--sm"><FileArrowUp size={14} weight="bold" />Choose CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={e => void file(e.target.files?.[0])} /></label>
        <div className="x-seg x-seg--sm" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>Full list (replace)</button>
          <button type="button" aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>Add to list</button>
        </div>
        <button type="button" className="x-btn x-btn--hi x-btn--sm" disabled={!text.trim() || busy} onClick={() => void send()} data-testid="ib-upload-send">{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
      {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
      {res && (
        <div className="ib-result" role="status">
          <span><b className="m">{res.added}</b> added</span><span><b className="m">{res.updated}</b> changed</span>
          <span><b className="m">{res.removed}</b> removed</span>{res.skipped > 0 && <span><b className="m">{res.skipped}</b> rows skipped (no account number)</span>}
          <span><b className="m">{res.rechecked}</b> client accounts re-checked</span>
        </div>
      )}
      {!text && !res && <EmptyState compact icon="note" title="Paste or choose a file">Replace keeps the list exactly as uploaded; accounts missing from it stop counting.</EmptyState>}
    </div>
  );
}

type Tab = 'postback' | 'api' | 'earnings';
const BLANK_API: ApiConfig = { baseUrl: 'https://', auth: 'jwt-login', authPath: '/api/auth/', username: '', clientsPath: '', listKey: 'data', fields: { accountId: 'client_account', email: 'email', lots: '', deposit: '' } };

function IntegrationPanel({ b, onToast, onChanged }: { b: PartnerBroker; onToast: (s: string) => void; onChanged: () => Promise<void> }) {
  const [d, setD] = useState<Integration | null>(null);
  const [tab, setTab] = useState<Tab>('postback');
  const [cfg, setCfg] = useState<ApiConfig>(BLANK_API);
  const [secret, setSecret] = useState('');
  const [report, setReport] = useState('');
  const [cur, setCur] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { const x = await ibApi.integration(b.id); setD(x); if (x.api.config) setCfg(x.api.config); } catch (e) { setErr(msg(e, 'Could not load the integration.')); }
  }, [b.id]);
  useEffect(() => { void load(); }, [load]);
  const field = (k: keyof ApiConfig['fields'], v: string) => setCfg(c => ({ ...c, fields: { ...c.fields, [k]: v } }));

  async function run(fn: () => Promise<string>) {
    setBusy(true); setErr('');
    try { onToast(await fn()); await load(); await onChanged(); } catch (e) { setErr(msg(e, 'That didn’t work.')); } finally { setBusy(false); }
  }

  return (
    <div className="x-inset ib-upload" data-testid="ib-integration">
      <div className="ib-tabs-line" role="tablist">
        {([['postback', 'Postback (real time)'], ['api', 'Broker API'], ['earnings', 'Commission report']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
      {!d && !err && <div className="x-skel x-skel--in" />}

      {d && tab === 'postback' && <>
        <p className="ib-note">Paste this URL into the postback / S2S settings of your {b.label} partner area (or ask your account manager). Each registration, deposit, trade and commission then reaches us within seconds, and new accounts verify straight away.</p>
        <div className="ib-url"><code data-testid="ib-postback-url">{d.postbackUrl}</code><CopyButton text={d.postbackUrl} label="Copy" className="x-btn x-btn--sm" /></div>
        <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>Parameter</th><th>Meaning</th></tr></thead>
          <tbody>{d.postbackParams.map(p => <tr key={p.name}><td className="m">{p.name}</td><td className="x-muted">{p.meaning}</td></tr>)}</tbody></table></div>
        <div className="ib-upload-row">
          <span className="x-help">Keep the URL private: anyone with it can send events for your account.</span>
          <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={busy} onClick={() => void run(async () => { await ibApi.rotatePostback(b.id); return 'New postback URL created. Update it at the broker.'; })}>Make a new URL</button>
        </div>
        <b>Latest events</b>
        {d.events.length === 0 ? <p className="x-muted">Nothing received yet.</p> : (
          <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>When</th><th>Event</th><th>Account</th><th>Result</th></tr></thead>
            <tbody>{d.events.map(e => <tr key={e.id}><td className="x-muted">{timeAgo(e.at)}</td><td>{e.kind}</td><td className="m">{e.accountId ?? '—'}</td><td className={e.status === 'error' ? 'neg' : e.status === 'ignored' ? 'x-muted' : ''}>{e.status}{e.error ? ` · ${e.error}` : ''}</td></tr>)}</tbody></table></div>
        )}
      </>}

      {d && tab === 'api' && <>
        <p className="ib-note">For brokers whose partner area has an API (Exness Partnership API, Cellxpert-based programmes and others). Copy the client-list endpoint and field names from the broker&rsquo;s API schema. We re-read it every hour.</p>
        {d.api.allowedHosts.length === 0
          ? <div className="x-banner" role="note"><span>No broker API addresses are approved yet. Send TRADElogs your broker&rsquo;s API address to enable this.</span></div>
          : <p className="x-help">Approved API addresses: {d.api.allowedHosts.join(', ')}</p>}
        <div className="ib-form-row">
          <div className="x-field"><label>API base URL</label><input className="x-input m" value={cfg.baseUrl} onChange={e => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://my.exnessaffiliates.com" /></div>
          <div className="x-field"><label>Sign-in method</label>
            <select className="x-select" value={cfg.auth} onChange={e => setCfg({ ...cfg, auth: e.target.value as ApiConfig['auth'] })}>
              <option value="jwt-login">Login → token (Exness style)</option><option value="bearer">Bearer token</option><option value="header">API key header</option><option value="basic">Username + password</option>
            </select></div>
          {cfg.auth === 'jwt-login' && <div className="x-field"><label>Login path</label><input className="x-input m" value={cfg.authPath ?? ''} onChange={e => setCfg({ ...cfg, authPath: e.target.value })} placeholder="/api/auth/" /></div>}
          {cfg.auth === 'header' && <div className="x-field"><label>Header name</label><input className="x-input m" value={cfg.headerName ?? ''} onChange={e => setCfg({ ...cfg, headerName: e.target.value })} placeholder="X-API-Key" /></div>}
          {(cfg.auth === 'jwt-login' || cfg.auth === 'basic') && <div className="x-field"><label>Login / username</label><input className="x-input" value={cfg.username ?? ''} onChange={e => setCfg({ ...cfg, username: e.target.value })} /></div>}
          <div className="x-field"><label>{cfg.auth === 'jwt-login' || cfg.auth === 'basic' ? 'Password' : 'API key'} {d.api.hasSecret && <span className="x-dim">(saved; leave blank to keep)</span>}</label><input className="x-input" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} /></div>
        </div>
        <div className="ib-form-row">
          <div className="x-field"><label>Client list endpoint</label><input className="x-input m" value={cfg.clientsPath} onChange={e => setCfg({ ...cfg, clientsPath: e.target.value })} placeholder="/api/reports/clients/" /></div>
          <div className="x-field"><label>List in the response at</label><input className="x-input m" value={cfg.listKey ?? ''} onChange={e => setCfg({ ...cfg, listKey: e.target.value })} placeholder="data" /></div>
          <div className="x-field"><label>Account id field</label><input className="x-input m" value={cfg.fields.accountId} onChange={e => field('accountId', e.target.value)} /></div>
          <div className="x-field"><label>Email field <span className="x-dim">(optional)</span></label><input className="x-input m" value={cfg.fields.email ?? ''} onChange={e => field('email', e.target.value)} /></div>
          <div className="x-field"><label>Volume (lots) field <span className="x-dim">(optional)</span></label><input className="x-input m" value={cfg.fields.lots ?? ''} onChange={e => field('lots', e.target.value)} /></div>
          <div className="x-field"><label>Deposit field <span className="x-dim">(optional)</span></label><input className="x-input m" value={cfg.fields.deposit ?? ''} onChange={e => field('deposit', e.target.value)} /></div>
        </div>
        <div><button type="button" className="x-btn x-btn--hi x-btn--sm" disabled={busy || !cfg.clientsPath || !cfg.fields.accountId || !/^https:\/\//.test(cfg.baseUrl)}
          onClick={() => void run(async () => {
            const clean: ApiConfig = { ...cfg, fields: Object.fromEntries(Object.entries(cfg.fields).filter(([, v]) => v)) as ApiConfig['fields'] };
            const r = await ibApi.saveApi(b.id, clean, secret || undefined);
            setSecret('');
            return r.ok ? `Connected: ${r.accounts} accounts read from the API.` : `Saved, but the first sync failed: ${r.error}`;
          })}>{busy ? 'Connecting…' : 'Save and sync'}</button></div>
      </>}

      {d && tab === 'earnings' && <>
        <p className="ib-note">Upload the commission or rebate report from your {b.label} partner area (CSV). It needs a date column and an amount column; account and transaction id columns help. Re-uploading the same lines doesn&rsquo;t double count them.</p>
        <textarea className="x-textarea" value={report} onChange={e => setReport(e.target.value)} placeholder={'Date,Account,Commission,Currency,Transaction ID\n2026-10-01,7001001,12.50,USD,T-1001'} aria-label="Commission report" />
        <div className="ib-upload-row">
          <label className="x-btn x-btn--sm"><FileArrowUp size={14} weight="bold" />Choose CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setReport(await f.text()); }} /></label>
          <select className="x-select" value={cur} onChange={e => setCur(e.target.value)} aria-label="Currency">{['USD', 'EUR', 'INR', 'USDT'].map(c => <option key={c} value={c.slice(0, 3)}>{c}</option>)}</select>
          <button type="button" className="x-btn x-btn--hi x-btn--sm" disabled={!report.trim() || busy} onClick={() => void run(async () => {
            const r = await ibApi.uploadEarnings(b.id, report, cur);
            setReport('');
            return `${r.added} new commission lines${r.duplicates ? `, ${r.duplicates} already had` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}.`;
          })}>Upload</button>
        </div>
      </>}
    </div>
  );
}
