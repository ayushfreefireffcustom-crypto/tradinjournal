'use client';

// The partner's Elefin Partner API connection: the prompt to connect (partner home and
// Brokers), the paste-and-test dialog, and the connected card (also read by admins).
// Drawn after the Access page: a real-looking render of the key Elefin hands over in a
// well, a checklist with one dark "Next" bar, hairlines, no icon circles. The connected
// card shows only what Elefin's API gives: the partner's book (clients, funded, deposits,
// lots, quiet, new) and referred traders verified by their sign-up email.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowsClockwise, Check, Key, Minus, X } from '@phosphor-icons/react';
import Modal from '@/components/v6/ui/modal';
import { useConfirm } from '@/components/confirm-dialog';
import { timeAgo } from '@/components/app-shell';
import { Cursor, PathList, Win, type PathRow } from '@/components/v6/account/access-art';
import {
  daysUntil, elefinApi, looksLikeKey, lotsShort, STATE_LABEL, usdShort, verificationShares,
  type ElefinConnection, type ElefinProbe, type ElefinSyncResult,
} from '@/lib/elefin-api';
import '@/styles/v6/access.css';
import '@/styles/v6/elefin.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US'));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const DISMISS_KEY = 'tl.elefin.prompt.later';
const DISMISS_MS = 3 * 86_400_000;

function inMinutes(iso: string | null): string {
  if (!iso) return '';
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  return m <= 0 ? 'any moment' : `in ${m} min`;
}

function syncToast(s: ElefinSyncResult | null, first = false): string {
  if (!s) return first ? 'Elefin connected. Your first sync is running.' : 'Sync started. It can take a minute.';
  if (!s.ok) return s.error ?? 'Sync failed.';
  const bits = [`${n(s.clients)} clients`];
  if (s.lookups) bits.push(`${s.lookups} traders checked`);
  if (s.verified) bits.push(`${s.verified} verified`);
  return `${first ? 'Elefin connected' : 'Synced'}: ${bits.join(', ')}.`;
}

/** Loads the connection and keeps polling while a sync runs. */
export function useElefin(load: () => Promise<ElefinConnection> = elefinApi.status) {
  const [c, setC] = useState<ElefinConnection | null>(null);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    try { setC(await loadRef.current()); setError(''); } catch (e) { setError(msg(e, 'Couldn’t load your Elefin connection.')); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (c?.state !== 'SYNCING') return;
    const t = setInterval(() => void refresh(), 4000);
    const stop = setTimeout(() => clearInterval(t), 180_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [c?.state, refresh]);
  return { c, setC, error, refresh };
}

// ── Drawn: the key Elefin hands over ─────────────────────────────────────────

function KeyVignette() {
  return (
    <div className="ef-well" aria-hidden>
      <Win url={<>Elefin CRM · <b>API keys</b></>} className="ef-win">
        <div className="ef-keys">
          <div className="ef-keys-h"><span>Name</span><span>Abilities</span><span>Key</span></div>
          <div className="ef-keys-r">
            <b>TRADElogs</b>
            <span className="ef-chips"><span className="axchip ok">clients.read</span></span>
            <span className="ef-key"><span className="axnum">fxcrm_pk_7Hq2…·••••</span><span className="axbtn is-hover">Copy</span><Cursor className="ef-cur" /></span>
          </div>
          <div className="ef-keys-r ghost"><i className="axline w40" /><i className="axline w60" /><i className="axline w50" /></div>
        </div>
      </Win>
    </div>
  );
}

// ── The prompt ───────────────────────────────────────────────────────────────

export function ElefinPrompt({ c, setup, onConnect, onLater, paused }: {
  c: ElefinConnection | null;
  /** Other setup steps, when known (partner home). */
  setup?: { clicks: number; livePackages: number };
  onConnect: () => void;
  onLater?: () => void;
  paused?: boolean;
}) {
  const rows: PathRow[] = [
    { key: 'elefin', title: 'Connect Elefin', note: 'Traders verify on their own', value: paused ? 'Paused' : 'Not yet', done: false },
    ...(setup ? [
      { key: 'link', title: 'Share your link', note: 'Signups land on your list', value: setup.clicks ? `${n(setup.clicks)} clicks` : 'No clicks yet', done: setup.clicks > 0 },
      { key: 'package', title: 'Publish a package', note: 'What verified clients unlock', value: setup.livePackages ? `${setup.livePackages} live` : 'None live', done: setup.livePackages > 0 },
    ] : []),
  ];
  return (
    <section className={`x-card ef-prompt ${paused ? 'is-paused' : ''} ${setup ? 'has-setup' : ''}`} data-testid="elefin-prompt" aria-labelledby="ef-prompt-h">
      <div className="ef-prompt-l">
        <span className="ef-kicker">Elefin partner API</span>
        <h2 id="ef-prompt-h">{paused ? <>Add your key <em>again</em>.</> : <>Connect Elefin <em>once</em>.</>}</h2>
        <p className="ef-lede">
          {paused
            ? 'Elefin stopped accepting your key, so your numbers aren’t updating. Verified traders stay verified.'
            : `Paste your Elefin partner key. Your book syncs every ${c?.syncEveryMinutes ?? 20} minutes and referred traders verify by their sign-up email.`}
        </p>
        {setup ? (
          <PathList title="Partner setup" rows={rows} next="Connect Elefin"
            action={<button type="button" className="x-btn x-btn--sm" onClick={onConnect} data-testid="elefin-prompt-connect">{paused ? 'Add key' : 'Connect'}</button>} />
        ) : (
          <div className="ef-prompt-btns">
            <button type="button" className="x-btn x-btn--hi" onClick={onConnect} data-testid="elefin-prompt-connect"><Key size={15} weight="bold" aria-hidden />{paused ? 'Add key again' : 'Connect Elefin'}</button>
          </div>
        )}
        {onLater && !paused && <button type="button" className="x-link ef-later" onClick={onLater} data-testid="elefin-prompt-later">Remind me later</button>}
      </div>
      <div className="ef-prompt-r"><KeyVignette /><p className="axcap"><i />The key, as Elefin shows it once</p></div>
    </section>
  );
}

// ── Paste, test, save ────────────────────────────────────────────────────────

type Phase = 'idle' | 'testing' | 'saving' | 'done';

function ProbeRows({ p }: { p: ElefinProbe }) {
  const k = p.key;
  const exp = daysUntil(k?.expiresAt ?? null);
  const rows: { l: string; v: ReactNode; s: 'ok' | 'bad' | 'off' }[] = [
    { l: 'Partner', v: k ? `${k.partnerName ?? 'Partner'}${k.partnerId != null ? ` · #${k.partnerId}` : ''}` : '—', s: k ? 'ok' : 'off' },
    { l: 'Reads clients', v: k?.canReadClients ? 'Yes' : 'Missing', s: k?.canReadClients ? 'ok' : 'bad' },
    { l: 'Clients', v: p.clientsRead === 'ok' ? n(p.clients) : '—', s: p.clientsRead === 'ok' ? 'ok' : 'off' },
    { l: 'Key expires', v: k?.expiresAt ? day(k.expiresAt) : 'Never', s: exp != null && exp < 14 ? 'bad' : 'ok' },
  ];
  const I = { ok: Check, bad: X, off: Minus };
  return (
    <ul className="ef-res-rows">
      {rows.map(r => { const Ic = I[r.s]; return <li key={r.l} className={`is-${r.s}`}><Ic size={14} weight="bold" aria-hidden /><span>{r.l}</span><b className="axnum">{r.v}</b></li>; })}
    </ul>
  );
}

function ProbeResult({ p, wait }: { p: ElefinProbe; wait: number }) {
  const tone = p.ok ? 'ok' : p.outcome === 'rate_limited' || p.outcome === 'unreachable' ? 'warn' : 'bad';
  const showRows = p.ok || p.outcome === 'missing_permission';
  return (
    <div className={`ef-res is-${tone}`} role="status" data-testid={`elefin-result-${p.outcome}`}>
      <p className="ef-res-h">{p.outcome === 'rate_limited' && wait > 0 ? `Elefin asked us to slow down. Try again in ${wait} s.` : p.message}</p>
      {showRows && <ProbeRows p={p} />}
      {p.missing.length > 0 && (
        <div className="ef-ask">
          <b>Ask Elefin to add</b>
          <ul>{p.missing.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {p.notes.length > 0 && <ul className="ef-notes">{p.notes.map(x => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

export function ElefinConnectModal({ c, onClose, onConnected, replacing }: {
  c: ElefinConnection | null;
  onClose: () => void;
  onConnected: (conn: ElefinConnection, sync: ElefinSyncResult | null) => void;
  replacing?: boolean;
}) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [custom, setCustom] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [probe, setProbe] = useState<ElefinProbe | null>(null);
  const [err, setErr] = useState('');
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (until <= Date.now()) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  const wait = Math.max(0, Math.ceil((until - now) / 1000));
  const valid = looksLikeKey(key);
  const busy = phase === 'testing' || phase === 'saving';
  const ips = c?.outboundIps ?? [];

  function edit(v: string) { setKey(v.replace(/\s+/g, '')); setProbe(null); setErr(''); }
  function after(p: ElefinProbe) { setProbe(p); if (p.outcome === 'rate_limited') { setUntil(Date.now() + (p.retryAfter ?? 60) * 1000); setNow(Date.now()); } }

  async function test() {
    setPhase('testing'); setErr(''); setProbe(null);
    try { after(await elefinApi.test({ key, baseUrl: custom ? baseUrl : undefined })); }
    catch (e) { setErr(msg(e, 'Couldn’t test the key.')); } finally { setPhase('idle'); }
  }
  async function save() {
    setPhase('saving'); setErr('');
    try {
      const r = await elefinApi.connect(key, custom ? baseUrl : undefined);
      after(r.probe);
      if (r.probe.ok) { setKey(''); setPhase('done'); onConnected(r.connection, r.sync); return; }
    } catch (e) { setErr(msg(e, 'Couldn’t save the key.')); }
    setPhase('idle');
  }

  return (
    <Modal title={replacing ? 'Replace your Elefin key' : 'Connect Elefin'} sub="Read-only. We never see client passwords or move money." onClose={onClose} busy={busy} wide testId="elefin-modal"
      footer={<>
        <button type="button" className="x-btn" disabled={!valid || busy || wait > 0} onClick={() => void test()} data-testid="elefin-test">{phase === 'testing' ? 'Testing…' : 'Test connection'}</button>
        <button type="button" className="x-btn x-btn--hi" disabled={!valid || busy || wait > 0 || (probe != null && !probe.ok && probe.outcome !== 'rate_limited' && probe.outcome !== 'unreachable')} onClick={() => void save()} data-testid="elefin-save">{phase === 'saving' ? 'Connecting…' : 'Save and sync'}</button>
      </>}>
      <div className="ef-modal">
        <div className="ef-how">
          <b className="ef-how-h">Where to get your key</b>
          <ol className="ib-steps ef-steps">
            <li>Ask your Elefin contact for a <b>Partner API key</b> for TRADElogs. Keys aren&rsquo;t self-service.</li>
            <li>It needs one permission: <b>clients.read</b>.</li>
            <li>IP access: {ips.length ? <>allow <span className="axnum ef-ips">{ips.join(', ')}</span></> : <b>Any</b>}.</li>
            <li>Copy it whole, as <span className="axnum">key.secret</span>. Elefin shows it once.</li>
          </ol>
        </div>
        <div className="x-field">
          <label htmlFor="ef-key">Elefin key</label>
          <div className="ef-keyrow">
            <input id="ef-key" className="x-input ef-keyin" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="off"
              value={key} onChange={e => edit(e.target.value)} placeholder="key.secret" data-testid="elefin-key" aria-describedby="ef-key-help" />
            <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <span className="x-help" id="ef-key-help">{key && !valid ? 'That doesn’t look like key.secret yet: two parts with a dot between.' : 'Stored encrypted. Only its last 4 characters are ever shown.'}</span>
        </div>
        {custom ? (
          <div className="x-field">
            <label htmlFor="ef-url">API address <span className="x-dim">(only if Elefin gave you one)</span></label>
            <input id="ef-url" className="x-input" type="url" value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setProbe(null); }} placeholder={c?.defaultBaseUrl ?? 'https://partnersapi.elefin.com/api/v1'} />
          </div>
        ) : <button type="button" className="x-link ef-later" onClick={() => setCustom(true)}>Elefin gave you a different API address?</button>}

        {phase === 'testing' || phase === 'saving' ? (
          <div className="ef-res is-busy" role="status" data-testid="elefin-testing">
            <p className="ef-res-h">{phase === 'saving' ? 'Connecting and reading your book…' : 'Asking Elefin who this key belongs to…'}</p>
            <ul className="ef-res-rows">{['Partner', 'Reads clients', 'Clients'].map(l => <li key={l}><Minus size={14} weight="bold" aria-hidden /><span>{l}</span><i className="axline w30" /></li>)}</ul>
          </div>
        ) : probe ? <ProbeResult p={probe} wait={wait} /> : null}
        {err && <div className="x-banner x-banner--err" role="alert" data-testid="elefin-error"><span>{err}</span></div>}
      </div>
    </Modal>
  );
}

// ── Connected ────────────────────────────────────────────────────────────────

export function StatePill({ s }: { s: ElefinConnection['state'] }) {
  const c = s === 'OK' ? 'x-tag--g' : s === 'ERROR' || s === 'PAUSED' ? 'x-tag--r' : '';
  return <span className={`x-tag ${c} ib-pill`} data-testid="elefin-state">{s === 'SYNCING' && <ArrowsClockwise size={13} weight="bold" className="ef-spin" aria-hidden />}{STATE_LABEL[s]}</span>;
}

/** Referrals per week, last 8 weeks: drawn bars, this week last. */
function WeekBars({ weekly }: { weekly: number[] }) {
  const max = Math.max(1, ...weekly);
  const label = `New clients per week, last 8 weeks: ${weekly.join(', ')}`;
  return (
    <div className="ef-bars" role="img" aria-label={label} data-testid="elefin-weekly">
      {weekly.map((v, i) => (
        <span key={i} className={i === weekly.length - 1 ? 'is-now' : ''}>
          <i style={{ height: `${v ? Math.max(6, Math.round((v / max) * 100)) : 0}%` }} />
        </span>
      ))}
    </div>
  );
}

function VerifyBar({ c }: { c: ElefinConnection }) {
  const v = c.verification;
  const sh = verificationShares(v);
  const parts = [
    { k: 'v', w: sh.verified, l: 'Verified', n: v.verified },
    { k: 'h', w: sh.held, l: 'Held', n: v.held },
    { k: 'x', w: sh.notFound, l: 'Not found', n: v.notFound },
    { k: 'w', w: sh.waiting, l: 'Waiting', n: v.waiting },
  ];
  return (
    <>
      <div className="ef-stack" role="img" aria-label={parts.map(p => `${p.l} ${p.n}`).join(', ')}>
        {parts.filter(p => p.w > 0).map(p => <i key={p.k} className={`ef-k${p.k}`} style={{ width: `${p.w}%` }} />)}
      </div>
      <ul className="ef-legend">
        {parts.map(p => <li key={p.k}><i className={`ef-k${p.k}`} aria-hidden />{p.l}<b className="m">{n(p.n)}</b></li>)}
      </ul>
    </>
  );
}

export function ElefinCard({ c, onReplace, onSync, onDisconnect, busy, admin }: {
  c: ElefinConnection;
  onReplace?: () => void;
  onSync?: () => void;
  onDisconnect?: () => void;
  busy?: boolean;
  admin?: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => { if (!c.canSyncAt) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [c.canSyncAt]);
  const waitS = c.canSyncAt ? Math.max(0, Math.ceil((new Date(c.canSyncAt).getTime() - Date.now()) / 1000)) : 0;
  const bad = c.state === 'ERROR' || c.state === 'PAUSED';
  const r = c.roster;
  const k = c.key;
  const exp = daysUntil(k?.expiresAt ?? null);
  const first = c.state === 'SYNCING' && !c.lastSuccessAt;
  return (
    <section className="x-card ef-card" data-testid="elefin-card">
      <div className="x-ch">
        <h2>Elefin</h2><StatePill s={c.state} />
        <span className="x-sub">{k?.partnerName ? <>{k.partnerName}{k.partnerId != null && <span className="axnum"> · #{k.partnerId}</span>} · </> : null}key <span className="axnum">{c.keyHint}</span></span>
      </div>
      {bad && c.lastError && (
        <div className="x-banner x-banner--err ef-err" role="alert" data-testid="elefin-error-line">
          <span>{c.lastError}</span>
          {c.state === 'PAUSED' && onReplace && <button type="button" className="x-btn x-btn--sm" onClick={onReplace}>Add key again</button>}
        </div>
      )}

      <div className="x-strip ef-strip" data-testid="elefin-book">
        <div><span>Clients</span><b className="m">{first ? <i className="axline w60" /> : n(r?.total)}</b></div>
        <div><span>Funded</span><b className="m">{first ? <i className="axline w40" /> : n(r?.funded)}</b></div>
        <div><span>Deposits</span><b className="m">{first ? <i className="axline w60" /> : r ? usdShort(r.depositsUsd) : '—'}</b></div>
        <div><span>Lots</span><b className="m">{first ? <i className="axline w40" /> : r ? lotsShort(r.lots) : '—'}</b></div>
      </div>

      <div className="ef-panels">
        <div className="ef-pan" data-testid="elefin-new">
          <div className="ef-pan-h"><span>New clients</span><b className="m">{n(r?.new30d)}<small>30 d</small></b></div>
          <WeekBars weekly={r?.weekly ?? [0, 0, 0, 0, 0, 0, 0, 0]} />
          <div className="ef-axis" aria-hidden><span>8 wk ago</span><span>This week</span></div>
        </div>
        <div className="ef-pan" data-testid="elefin-verified">
          <div className="ef-pan-h"><span>Traders verified</span><b className="m">{n(c.verification.verified)}<small>/{n(c.verification.referred)}</small></b></div>
          <VerifyBar c={c} />
        </div>
        <div className="ef-pan ef-pan--q" data-testid="elefin-quiet">
          <div className="ef-pan-h"><span>Gone quiet</span><b className={`m ${r?.quiet ? 'neg' : ''}`}>{n(r?.quiet)}</b></div>
          <p className="ef-q-note">Funded, no trade in {r?.quietDays ?? 30} d</p>
          <div className="ef-pan-h ef-pan-h--sub"><span>Never traded</span><b className="m">{n(r?.neverTraded)}</b></div>
        </div>
      </div>

      <dl className="ef-meta">
        <div><dt>Key expires</dt><dd className={exp != null && exp < 14 ? 'neg' : ''}>{k?.expiresAt ? `${day(k.expiresAt)}${exp != null && exp >= 0 && exp < 60 ? ` · ${exp} d` : ''}` : 'Never'}</dd></div>
        <div><dt>Trades from</dt><dd>{day(k?.tradesFrom ?? null)}</dd></div>
        <div><dt>Last sync</dt><dd>{first ? 'Running' : timeAgo(c.lastSyncAt)}</dd></div>
      </dl>

      <div className="ef-foot">
        <span className="ef-next">
          {c.state === 'PAUSED' ? 'Automatic syncs are paused.' : c.state === 'SYNCING' ? 'Reading your book from Elefin…' : c.nextSyncAt ? `Next sync ${inMinutes(c.nextSyncAt)} · every ${c.syncEveryMinutes} min` : `Syncs every ${c.syncEveryMinutes} min`}
        </span>
        <span className="ib-br-btns">
          {onSync && <button type="button" className="x-btn x-btn--sm" disabled={busy || c.state === 'SYNCING' || (!admin && (c.state === 'PAUSED' || waitS > 0))} onClick={onSync} data-testid="elefin-sync">
            <ArrowsClockwise size={14} weight="bold" aria-hidden />{busy ? 'Syncing…' : waitS > 0 && !admin ? `Sync now (${waitS} s)` : 'Sync now'}</button>}
          {onReplace && <button type="button" className="x-btn x-btn--sm" disabled={busy} onClick={onReplace} data-testid="elefin-replace">Replace key</button>}
          {onDisconnect && <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={busy} onClick={onDisconnect} data-testid="elefin-disconnect">Disconnect</button>}
        </span>
      </div>
      {c.events.length > 0 && (
        <ul className="ef-evts" aria-label="Recent syncs">
          {c.events.slice(0, 5).map(e => (
            <li key={e.at} className={e.status === 'ok' ? '' : 'is-bad'}><span>{timeAgo(e.at)}</span><span className="axnum">{e.message}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Page slots ───────────────────────────────────────────────────────────────

function later(): boolean {
  try { const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0); return t > Date.now() - DISMISS_MS; } catch { return false; }
}

/** Brokers page: prompt until connected, then the connected card. */
export function ElefinSection({ onChanged }: { onChanged?: () => void }) {
  const { c, setC, error, refresh } = useElefin();
  const [open, setOpen] = useState<null | 'connect' | 'replace'>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3600); return () => clearTimeout(t); }, [toast]);

  async function sync() {
    setBusy(true);
    try {
      const r = await elefinApi.syncNow();
      setC(r.connection);
      setToast(syncToast(r.result));
      onChanged?.();
    } catch (e) { setToast(msg(e, 'Sync failed.')); await refresh(); } finally { setBusy(false); }
  }
  async function disconnect() {
    const ok = await ask({ title: 'Disconnect Elefin?', body: 'We delete your key and the synced numbers. Traders already verified stay verified until you connect again.', confirmLabel: 'Disconnect', tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    try { setC(await elefinApi.disconnect()); setToast('Elefin disconnected. Your key is deleted.'); onChanged?.(); }
    catch (e) { setToast(msg(e, 'Couldn’t disconnect.')); } finally { setBusy(false); }
  }

  if (error && !c) return <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void refresh()}>Retry</button></div>;
  if (!c) return <div className="x-skel ef-sk" data-testid="elefin-loading" />;
  const connected = c.state !== 'NOT_CONNECTED';
  return (
    <>
      {connected
        ? <ElefinCard c={c} busy={busy} onSync={() => void sync()} onReplace={() => setOpen('replace')} onDisconnect={() => void disconnect()} />
        : <ElefinPrompt c={c} onConnect={() => setOpen('connect')} />}
      {open && <ElefinConnectModal c={c} replacing={open === 'replace'} onClose={() => setOpen(null)}
        onConnected={(conn, s) => { setC(conn); setOpen(null); setToast(syncToast(s, true)); onChanged?.(); }} />}
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </>
  );
}

/** Partner home: leads with the prompt until Elefin is connected (or when it's paused). */
export function ElefinHomeSlot({ setup }: { setup: { clicks: number; livePackages: number } }) {
  const { c, setC } = useElefin();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [toast, setToast] = useState('');
  useEffect(() => { setHidden(later()); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3600); return () => clearTimeout(t); }, [toast]);
  if (!c) return null;
  const paused = c.state === 'PAUSED';
  if (c.state !== 'NOT_CONNECTED' && !paused) {
    return toast ? <div className="ac-toast" role="status">{toast}</div> : null;
  }
  if (hidden && !paused) {
    return (
      <>
        <p className="ef-remind" data-testid="elefin-reminder">
          <Key size={14} weight="bold" aria-hidden /><span>Elefin isn&rsquo;t connected, so traders aren&rsquo;t verified automatically.</span>
          <button type="button" className="x-link" onClick={() => setOpen(true)}>Connect</button>
        </p>
        {open && <ElefinConnectModal c={c} onClose={() => setOpen(false)} onConnected={(conn, s) => { setC(conn); setOpen(false); setToast(syncToast(s, true)); }} />}
      </>
    );
  }
  return (
    <>
      <ElefinPrompt c={c} setup={setup} paused={paused} onConnect={() => setOpen(true)}
        onLater={() => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ } setHidden(true); }} />
      {open && <ElefinConnectModal c={c} replacing={paused} onClose={() => setOpen(false)}
        onConnected={(conn, s) => { setC(conn); setOpen(false); setToast(syncToast(s, true)); }} />}
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </>
  );
}

/** Admin partner page: the partner's connection, read-only, with an admin "Sync now". */
export function ElefinAdminCard({ partnerId, onToast }: { partnerId: string; onToast: (s: string) => void }) {
  const load = useCallback(() => elefinApi.adminStatus(partnerId), [partnerId]);
  const { c, setC, error, refresh } = useElefin(load);
  const [busy, setBusy] = useState(false);
  if (error && !c) return <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void refresh()}>Retry</button></div>;
  if (!c) return <div className="x-skel ef-sk" />;
  if (c.state === 'NOT_CONNECTED') {
    return (
      <section className="x-card" data-testid="admin-elefin">
        <div className="x-ch"><h2>Elefin</h2><StatePill s={c.state} /><span className="x-sub">Partner API</span></div>
        <p className="x-muted ib-pad">No key yet. They see a prompt to connect on their partner home and Brokers page.</p>
      </section>
    );
  }
  return (
    <div data-testid="admin-elefin">
      <ElefinCard c={c} admin busy={busy} onSync={async () => {
        setBusy(true);
        try { const r = await elefinApi.adminSync(partnerId); setC(r.connection); onToast(syncToast(r.result)); }
        catch (e) { onToast(msg(e, 'Sync failed.')); } finally { setBusy(false); }
      }} />
    </div>
  );
}
