'use client';

// Account cards (H6–H8): editing the profile, the activity log, downloading
// your data and deleting the account.
import Link from 'next/link';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useToast } from '@/components/toast';
import { Modal } from '@/components/v6/copy/parts';
import { accountApi, shownIp, type ActivityGroup, type ActivityItem, type PlanSummary, type Profile } from '@/lib/account-api';
import { ApiError } from '@/lib/copy-api';
import { IAlert, IArrowRight, ICheck, IClose, IDownload, IExchange, ILock, IPlay, IPlus, IStop } from '@/components/v3/icons';

// ── Profile ──
const zones = (): string[] => {
  try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { return []; }
};

export function ProfileEditCard({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tz, setTz] = useState('UTC');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (profile) { setName(profile.name); setPhone(profile.phone ?? ''); setTz(profile.timezone); } }, [profile]);
  const all = useMemo(() => { const z = zones(); return z.includes(tz) ? z : [tz, ...z]; }, [tz]);
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const dirty = !!profile && (name.trim() !== profile.name || (phone.trim() || null) !== profile.phone || tz !== profile.timezone);
  const phoneOk = !phone.trim() || /^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s-]/g, ''));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !dirty || !phoneOk || !name.trim()) return;
    setBusy(true); setErr('');
    try {
      const p = await accountApi.updateProfile({ ...(name.trim() !== profile.name ? { name: name.trim() } : {}), ...((phone.trim() || null) !== profile.phone ? { phone: phone.trim() ? phone.replace(/[\s-]/g, '') : null } : {}), ...(tz !== profile.timezone ? { timezone: tz } : {}) });
      onSaved(p);
      toast.success('Profile saved');
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'Couldn’t save'); }
    finally { setBusy(false); }
  }
  return (
    <section className="x-card ac-st-card" aria-labelledby="ac-pe" data-testid="profile-edit">
      <div className="x-ch"><h2 id="ac-pe">Your details</h2></div>
      {!profile ? <div className="x-skel" style={{ height: 160 }} /> : (
        <form className="ac-form" onSubmit={save}>
          <label className="x-field"><span>Name</span><input className="x-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required data-testid="pe-name" /></label>
          <label className="x-field"><span>Email</span><input className="x-input" value={profile.email} disabled aria-describedby="pe-email-note" /><small id="pe-email-note" className="x-muted">Your sign-in email. Email support to change it.</small></label>
          <label className="x-field"><span>Phone <em className="x-muted">optional</em></span><input className="x-input m" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!phoneOk} data-testid="pe-phone" />{!phoneOk ? <small className="neg">Start with + and the country code, like +919876543210.</small> : <small className="x-muted">Only used if we need to reach you about your account.</small>}</label>
          <label className="x-field"><span>Timezone</span>
            <select className="x-input" value={tz} onChange={(e) => setTz(e.target.value)} data-testid="pe-tz">{all.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select>
            <small className="x-muted">Used for daily loss limits, reminders and reports.{browserTz && browserTz !== tz ? <> This browser is on {browserTz.replace(/_/g, ' ')}. <button type="button" className="ac-linkbtn" onClick={() => setTz(browserTz)} data-testid="pe-tz-browser">Use it</button></> : null}</small>
          </label>
          {err && <p className="cp-err" data-testid="pe-error">{err}</p>}
          <div><button className="x-btn x-btn--hi" disabled={!dirty || busy || !phoneOk || !name.trim()} data-testid="pe-save">{busy ? 'Saving…' : 'Save'}</button></div>
        </form>
      )}
    </section>
  );
}

// ── Activity ──
const GROUPS: Array<[ActivityGroup, string]> = [['all', 'All'], ['security', 'Sign-ins and security'], ['trading', 'Trading changes'], ['orders', 'Orders']];
// Line icons per activity kind; anything else gets a dot.
type Ic = ComponentType<{ size?: number }>;
const IMinus: Ic = ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>;
const IDot: Ic = () => <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden><circle cx="3" cy="3" r="3" fill="currentColor" /></svg>;
const ICON: Record<string, Ic> = {
  sign_in: IArrowRight, sessions_revoked: ILock, two_factor_on: ICheck, two_factor_off: IAlert, data_exported: IDownload, delete_requested: IAlert,
  exchange_connected: IPlus, exchange_removed: IMinus, follow_started: IPlus, follow_stopped: IMinus, api_key_created: IPlus, api_key_revoked: IMinus,
  deployment_started: IPlay, deployment_stopped: IStop, order_cancelled: IClose, order: IExchange,
};

export function ActivityList() {
  const [group, setGroup] = useState<ActivityGroup>('all');
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    setItems(null); setErr('');
    accountApi.activity(group).then((r) => { if (live) { setItems(r.items); setNext(r.nextBefore); } }, (e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [group]);
  async function loadMore() {
    if (!next) return;
    setMore(true);
    try { const r = await accountApi.activity(group, next); setItems((x) => [...(x ?? []), ...r.items]); setNext(r.nextBefore); } catch (e) { setErr((e as Error).message); }
    finally { setMore(false); }
  }
  // Day headings keep a long log readable.
  const days = useMemo(() => {
    const out: Array<{ day: string; rows: ActivityItem[] }> = [];
    for (const it of items ?? []) {
      const day = new Date(it.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      if (out.at(-1)?.day !== day) out.push({ day, rows: [] });
      out.at(-1)!.rows.push(it);
    }
    return out;
  }, [items]);
  return (
    <section className="x-card ac-st-card" aria-label="Activity" data-testid="activity">
      <div className="x-ch"><h2>Activity</h2></div>
      <div className="x-seg x-seg--in x-seg--sm ac-act-tabs" role="tablist" aria-label="Show">{GROUPS.map(([g, l]) => <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} data-testid={`act-tab-${g}`}>{l}</button>)}</div>
      {err ? <p className="cp-err">{err}</p> : !items ? <div className="x-skel" style={{ height: 200 }} /> : !items.length ? <p className="x-muted" data-testid="act-empty">Nothing here yet.</p> : (
        <>
          {days.map((d) => (
            <div key={d.day} className="ac-act-day">
              <h3>{d.day}</h3>
              <ul className="ac-act">
                {d.rows.map((it) => (
                  <li key={it.id} className={`ac-act-${it.group}`} data-testid="act-row">
                    <span className="ac-act-ic" aria-hidden>{(() => { const Icon = ICON[it.kind] ?? IDot; return <Icon size={12} />; })()}</span>
                    <div><b>{it.summary}</b><span className="x-muted">{new Date(it.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{it.device ? ` · ${it.device}` : ''}{shownIp(it.ip) ? ` · ${shownIp(it.ip)}` : ''}</span></div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {next && <button className="x-btn x-btn--sm" onClick={() => void loadMore()} disabled={more} data-testid="act-more">{more ? 'Loading…' : 'Show older'}</button>}
        </>
      )}
      <p className="x-muted ac-fine">Something here you don’t recognise? Change your password, turn on two-factor sign-in and sign out other devices on the Security page.</p>
    </section>
  );
}

// ── Your data ──
export function ExportCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <section className="x-card ac-st-card" aria-labelledby="ac-ex" data-testid="data-export">
      <div className="x-ch"><h2 id="ac-ex">Download your data</h2></div>
      <p className="x-muted">One JSON file with everything stored for your account: trades, journal, strategies and runs, alerts, exchange orders, copies, settings and activity. Exchange keys, broker passwords and other secrets are left out.</p>
      <button className="x-btn" disabled={busy} onClick={async () => { setBusy(true); try { await accountApi.exportData(); toast.success('Download started'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }} data-testid="data-export-btn">{busy ? 'Preparing…' : 'Download my data'}</button>
    </section>
  );
}

export function DeleteCard({ email }: { email: string | null }) {
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<{ sentTo: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { accountApi.deleteStatus().then((r) => setBlockers(r.blockers), () => setBlockers([])); }, []);
  const close = () => { if (busy) return; setOpen(false); setSent(null); setOtp(''); setTyped(''); setErr(''); };
  async function ask() {
    setBusy(true); setErr('');
    try { setSent(await accountApi.deleteRequest()); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t send the code'); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr('');
    try {
      await accountApi.deleteConfirm(otp);
      window.location.href = '/?deleted=1';
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t delete the account'); setBusy(false); }
  }
  return (
    <section className="x-card ac-st-card ac-danger" aria-labelledby="ac-del" data-testid="data-delete">
      <div className="x-ch"><h2 id="ac-del">Delete your account</h2></div>
      <p className="x-muted">Deletes your account and everything in it, for good: trades, journal, strategies, alerts, exchange connections (their keys are wiped) and settings. Download your data first if you want a copy. Open positions on your exchange aren’t touched.</p>
      {blockers && blockers.length > 0 && (
        <div className="ac-blockers" data-testid="data-delete-blockers">
          <b>Before you can delete it:</b>
          <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="x-muted ac-fine">Copies and leading are on <Link className="x-link" href="/copy/following">My copies</Link>; live strategies on <Link className="x-link" href="/strategies/deployments">Deployments</Link>.</p>
        </div>
      )}
      <button className="x-btn ac-btn-danger" disabled={!blockers || blockers.length > 0} onClick={() => setOpen(true)} data-testid="data-delete-btn">Delete my account</button>
      {open && (
        <Modal title="Delete your account?" sub="This can’t be undone." onClose={close} busy={busy} testId="data-delete-dialog"
          footer={!sent ? <><button className="x-btn" onClick={close} disabled={busy}>Keep my account</button><button className="x-btn ac-btn-danger" onClick={() => void ask()} disabled={busy} data-testid="data-delete-send">{busy ? 'Sending…' : `Email a code to ${email ?? 'me'}`}</button></>
            : <><button className="x-btn" onClick={close} disabled={busy}>Keep my account</button><button className="x-btn ac-btn-danger" onClick={() => void confirm()} disabled={busy || otp.length !== 6 || typed !== 'DELETE'} data-testid="data-delete-confirm">{busy ? 'Deleting…' : 'Delete everything'}</button></>}>
          {!sent ? <p>We’ll email a 6-digit code to make sure it’s you.</p> : (
            <form className="ac-form" onSubmit={(e) => { e.preventDefault(); if (otp.length === 6 && typed === 'DELETE') void confirm(); }}>
              <p>We sent a code to {sent.sentTo}. It works for 10 minutes.</p>
              <label className="x-field"><span>Code</span><input className="x-input m" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} data-testid="data-delete-otp" /></label>
              <label className="x-field"><span>Type DELETE to confirm</span><input className="x-input m" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="data-delete-typed" /></label>
              <button type="button" className="ac-linkbtn" onClick={() => void ask()} disabled={busy}>Send a new code</button>
            </form>
          )}
          {err && <p className="cp-err" data-testid="data-delete-error">{err}</p>}
        </Modal>
      )}
    </section>
  );
}

// ── Plan (H15) ──
export function PlanCard() {
  const [p, setP] = useState<PlanSummary | null>(null);
  useEffect(() => { accountApi.plan().then(setP, () => setP(null)); }, []);
  if (!p) return null;
  return (
    <section className="x-card ac-st-card" aria-labelledby="ac-plan" data-testid="plan-card">
      <div className="x-ch"><h2 id="ac-plan">Plan</h2><span className="x-tag x-tag--g" data-testid="plan-label">{p.label}</span></div>
      <p className="x-muted">{p.plansEnabled ? 'What your plan includes, and how much of it you use.' : 'Everything is free while TRADElogs is new. These are the limits everyone has.'}</p>
      <ul className="ac-limits">
        {p.limits.map((l) => (
          <li key={l.key} data-testid={`plan-${l.key}`}>
            <span>{l.label}</span>
            <i aria-hidden><b style={{ width: `${Math.min(100, (l.used / Math.max(1, l.limit)) * 100)}%` }} className={l.used >= l.limit ? 'is-full' : ''} /></i>
            <span className="m">{l.used} / {l.limit}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Tour (H9) ──
export function TourCard() {
  const [done, setDone] = useState(false);
  return (
    <section className="x-card ac-st-card" aria-labelledby="ac-tour" data-testid="tour-card">
      <div className="x-ch"><h2 id="ac-tour">Product tour</h2></div>
      <p className="x-muted">A short card on the dashboard, analytics, the coach, strategies and copy trading the first time you open each.</p>
      <button className="x-btn" disabled={done} onClick={async () => { const { restartTour } = await import('@/components/v6/tour'); await restartTour(); setDone(true); }} data-testid="tour-restart">{done ? 'It starts on the dashboard' : 'Take the tour again'}</button>
    </section>
  );
}

// ── Install the app (H14) ──
export function InstallCard() {
  const [state, setState] = useState<'installed' | 'ready' | 'ios' | 'other' | null>(null);
  useEffect(() => {
    const read = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setState(standalone ? 'installed' : window.__tlInstall ? 'ready' : ios ? 'ios' : 'other');
    };
    read();
    window.addEventListener('tl-install-ready', read);
    return () => window.removeEventListener('tl-install-ready', read);
  }, []);
  if (!state) return null;
  return (
    <section className="x-card ac-st-card" aria-labelledby="ac-pwa" data-testid="install-card">
      <div className="x-ch"><h2 id="ac-pwa">Install TRADElogs</h2>{state === 'installed' && <span className="x-tag x-tag--g">Installed</span>}</div>
      {state === 'installed' ? <p className="x-muted">You’re using the installed app.</p>
        : state === 'ready' ? (
          <>
            <p className="x-muted">Add TRADElogs to your home screen or dock. It opens in its own window, with notifications.</p>
            <button className="x-btn" onClick={async () => { const { promptInstall } = await import('@/components/pwa-setup'); const r = await promptInstall(); if (r === 'accepted') setState('installed'); }} data-testid="install-btn">Install</button>
          </>
        ) : state === 'ios' ? <p className="x-muted" data-testid="install-ios">On iPhone or iPad: open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>
        : <p className="x-muted" data-testid="install-other">Use your browser’s menu and choose <b>Install TRADElogs</b> or <b>Add to Home Screen</b>. In Chrome and Edge it’s also the install icon at the right of the address bar.</p>}
    </section>
  );
}
