'use client';

// A trader's side of the partner programme: who referred them, whether each MT5
// account checks out under that partner's IB, what they've unlocked and why
// anything is still locked, plus the choice to share their P&L with the partner.
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ChartLineUp, Eye, EyeSlash, Handshake, LockKeyOpen, Megaphone, Package, PlugsConnected, Pulse, ShieldCheck, ToggleRight, Toolbox, Trash, WarningCircle } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { dayUtc, ibApi, PRODUCT_TYPE_LABEL, type AccessAccount, type ClientAccess } from '@/lib/ib-api';
import { EntPill, VerifyPill } from '@/components/v6/account/ib-parts';
import { day } from '@/components/v6/account/partner-parts';
import { timeAgo } from '@/components/app-shell';
import { CodeTicket, Journey, type Station, type TicketState } from '@/components/v6/account/access-art';
import { partnerApi, type PartnerProfile } from '@/lib/partner-api';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';
import '@/styles/v6/access.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
/** Access stops because the package ends (not the holder's own access period). */
const endsByPackage = (p: { expiresAt: string | null; endsOn: string | null }) =>
  !!p.expiresAt && !!p.endsOn && Date.parse(p.expiresAt) === Date.parse(`${p.endsOn}T00:00:00Z`) + 86_400_000;

export default function AccessPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<ClientAccess | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setD(await ibApi.access()); setError(''); } catch (e) { setError(msg(e, 'Could not load your access.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const [me, setMe] = useState<PartnerProfile | null | undefined>(undefined);
  useEffect(() => { partnerApi.me().then(setMe).catch(() => setMe(null)); }, []);

  // The steps to a partner's tools, filled in from where this trader actually is.
  const stations: Station[] = d ? journey(d) : [];

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner access"
      pageSubtitle="Your partner, your broker check and what you’ve unlocked">
      <div className="x-page" data-testid="access-page">
        {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
        {!d && !error && <><div className="x-skel ac-sk-320" /><div className="x-skel ac-sk-168" /></>}

        {d && <>
          {d.partner
            ? <LinkedHero d={d} />
            : <JoinHero canJoin={d.canJoin} onJoined={x => { setD(x); setToast(`You’re now linked to ${x.partner?.name ?? 'your partner'}.`); }} />}

          <section className="x-card ax-journey-card" data-testid="access-progress">
            <div className="ax-h"><h2>{d.partner ? 'Your progress' : 'How it works'}</h2><span>{d.partner ? `${stations.filter(s => s.state === 'done').length} of ${stations.length} done` : 'Four steps, most of them automatic'}</span></div>
            <Journey stations={stations} />
          </section>

          {d.partner && <>
            <section className="x-card" data-testid="access-accounts">
              <div className="x-ch"><h2>Broker accounts</h2>{d.activity.checkedAt && <span className="x-sub">activity checked {timeAgo(d.activity.checkedAt)}</span>}</div>
              {d.accounts.length === 0
                ? <EmptyState compact icon="plug" title="Connect your MT5 account" actions={<Link href="/brokers" className="x-btn x-btn--hi">Connect MT5</Link>}>Use the account you opened with your partner&rsquo;s broker link. We check it against their list straight away.</EmptyState>
                : <ul className="ib-accts">{d.accounts.map(a => <AccountRow key={a.id} a={a} onChange={x => { setD(x); }} onToast={setToast} />)}</ul>}
              <AddAccount onAdded={x => { setD(x); setToast('Account added and checked.'); }} />
            </section>

            {d.products.length > 0 && (
              <section className="x-card" data-testid="access-tools">
                <div className="x-ch"><h2>Your tools from {d.partner.name.split(' ')[0]}</h2><span className="x-sub"><span className="m">{d.products.length}</span></span></div>
                <ul className="ib-accts">{d.products.map(t => (
                  <li key={t.id} className="ib-acct">
                    <div className="ib-acct-h">
                      <span><b><Toolbox size={15} weight="duotone" aria-hidden /> {t.name}</b><small>{PRODUCT_TYPE_LABEL[t.type]}{t.platform ? ` · ${t.platform}` : ''} · v{t.version}</small></span>
                      <Link href={`/access/tools/${t.id}`} className="x-btn x-btn--sm x-btn--hi" data-testid={`access-tool-${t.name}`}>Open</Link>
                    </div>
                    {t.description && <p>{t.description}</p>}
                  </li>
                ))}</ul>
              </section>
            )}

            <section className="x-card" data-testid="access-packages">
              <div className="x-ch"><h2>What {d.partner.name.split(' ')[0]} offers</h2></div>
              {d.packages.length === 0
                ? <EmptyState compact icon="star" title="Nothing on offer yet">When your partner publishes a package, it shows up here with what you need to unlock it.</EmptyState>
                : <div className="ib-pkgs">{d.packages.map(p => (
                    <article key={p.id} className="x-inset ib-pkg" data-testid={`access-pkg-${p.name}`}>
                      <div className="ib-pkg-h"><div><h3>{p.name}</h3>{p.description && <p>{p.description}</p>}</div><EntPill s={p.status} /></div>
                      <ul className="ib-perks">
                        {p.perks.map(k => <li key={k.key}><Package size={13} weight="bold" aria-hidden />{p.status === 'ACTIVE' || p.status === 'GRACE' ? <Link href={k.href} className="x-link">{k.label}</Link> : k.label}</li>)}
                        {p.templates.map(t => <li key={t.id}><Pulse size={13} weight="bold" aria-hidden />{p.status === 'ACTIVE' || p.status === 'GRACE' ? <Link href={`/marketplace/${t.id}`} className="x-link">{t.name}</Link> : t.name}</li>)}
                        {p.products.map(t => <li key={t.id}><Toolbox size={13} weight="bold" aria-hidden />{p.status === 'ACTIVE' || p.status === 'GRACE' ? <Link href={`/access/tools/${t.id}`} className="x-link">{t.name}</Link> : t.name}</li>)}
                      </ul>
                      {p.reasons.length > 0 && <ul className="ib-reasons">{p.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
                      <div className="ib-rules">
                        {p.status === 'GRACE' && p.graceUntil && <span>Grace ends {day(p.graceUntil)}</span>}
                        {p.grantedAt && p.status !== 'LOCKED' && <span>Unlocked {day(p.grantedAt)}</span>}
                        {p.expiresAt && p.status !== 'EXPIRED' && p.status !== 'LOCKED' && <span>Access until {endsByPackage(p) ? `the end of ${dayUtc(p.endsOn!)} (UTC)` : day(p.expiresAt)}</span>}
                        {p.endsOn && p.status === 'LOCKED' && <span data-testid={`access-ends-${p.name}`}>Offer ends {dayUtc(p.endsOn)}</span>}
                      </div>
                    </article>
                  ))}</div>}
            </section>

            <ConsentCard d={d} onChange={x => { setD(x); setToast(x.consent.share ? 'Your partner can now see your P&L.' : 'Your P&L is private again.'); }} />
          </>}

          {!d.partner && <WhatTheySee />}
          {!d.partner && d.lockedPerks.length > 0 && (
            <p className="ac-br-note"><ShieldCheck size={14} weight="duotone" aria-hidden />Some features come with a partner package: {d.lockedPerks.join(', ')}.</p>
          )}
          {me !== undefined && <PartnerBand me={me} />}
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}

/** Step states for the journey. The first unfinished step is the one to do next. */
function journey(d: ClientAccess): Station[] {
  const acct = d.accounts[0];
  const verified = d.accounts.some(a => a.status === 'VERIFIED');
  const unlocked = d.packages.filter(p => p.status === 'ACTIVE' || p.status === 'GRACE').length;
  const first = (n: string) => n.split(' ')[0];
  const raw = [
    { key: 'partner', done: !!d.partner, icon: <Handshake weight="duotone" />, title: d.partner ? 'Partner linked' : 'Link your partner',
      sub: d.partner ? `${d.partner.name} · code ${d.partner.code}` : 'Sign up through their link, or enter their code above' },
    { key: 'account', done: d.accounts.length > 0, icon: <PlugsConnected weight="duotone" />, title: 'Connect your broker account',
      sub: acct ? `${acct.label}${d.accounts.length > 1 ? ` +${d.accounts.length - 1} more` : ''}` : 'The MT5 account you opened through your partner',
      action: d.accounts.length ? undefined : <Link href="/brokers" className="x-btn x-btn--sm">Connect MT5</Link> },
    { key: 'check', done: verified, icon: <ShieldCheck weight="duotone" />, title: 'Broker check',
      sub: verified ? 'Opened under your partner' : d.partner && d.accounts.length ? 'Matching your account to their client list' : 'We match your account to your partner’s client list' },
    ...(d.partner ? [{ key: 'active', done: d.activity.active, icon: <ChartLineUp weight="duotone" />, title: 'Active trading',
      sub: `${d.activity.rule.minTrades}+ closed trade${d.activity.rule.minTrades === 1 ? '' : 's'} in ${d.activity.rule.windowDays} days · you have ${d.activity.trades}` }] : []),
    { key: 'unlock', done: unlocked > 0, icon: <LockKeyOpen weight="duotone" />, title: d.partner ? `Unlock ${first(d.partner.name)}’s tools` : 'Unlock their tools',
      sub: unlocked ? `${unlocked} package${unlocked === 1 ? '' : 's'} unlocked` : d.partner ? (d.packages.length ? `${d.packages.length} package${d.packages.length === 1 ? '' : 's'} on offer` : 'Nothing on offer yet') : 'Packages, indicators and strategies from your partner' },
  ];
  const next = raw.findIndex(r => !r.done);
  return raw.map((r, i) => ({ ...r, state: r.done ? 'done' : i === next ? 'now' : 'todo' }));
}

const initials = (n: string) => n.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** No partner yet: the code is the key. Typing fills the ticket and checks the code live. */
function JoinHero({ canJoin, onJoined }: { canJoin: boolean; onJoined: (d: ClientAccess) => void }) {
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<{ code: string; valid: boolean; name: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (code.length < 3) { setCheck(null); return; }
    const t = setTimeout(() => {
      partnerApi.checkCode(code).then(r => setCheck({ code, valid: r.valid, name: r.partnerName })).catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [code]);
  const current = check?.code === code ? check : null;
  const state: TicketState = !code ? 'idle' : code.length < 3 ? 'typing' : !current ? 'checking' : current.valid ? 'found' : 'missing';
  return (
    <section className="x-card ax-hero" data-testid="access-partner">
      <div>
        <span className="ax-eyebrow-l"><Handshake size={14} weight="bold" aria-hidden />Partner access</span>
        <h2>Your partner&rsquo;s code is <em>the key</em></h2>
        <p className="ax-hero-p">Joined because a trader, coach or community sent you? Link up with them to unlock the tools, indicators and strategies they share with their clients.</p>
        {canJoin && (
          <form className="ax-join" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setErr('');
            try { onJoined(await ibApi.join(code)); } catch (x) { setErr(msg(x, 'That code didn’t work.')); } finally { setBusy(false); }
          }}>
            <input className="x-input" value={code} maxLength={20} autoComplete="off" spellCheck={false}
              onChange={e => { setErr(''); setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase()); }}
              placeholder="Partner code" aria-label="Partner code" aria-describedby="ax-join-st" data-testid="access-join-code" />
            <button type="submit" className="x-btn x-btn--hi" disabled={code.length < 3 || busy || current?.valid === false} data-testid="access-join">{busy ? 'Linking…' : <>Link partner<ArrowRight size={15} weight="bold" aria-hidden /></>}</button>
            <span id="ax-join-st" role="status" className={`ax-join-st ${err || current?.valid === false ? 'bad' : current?.valid ? 'ok' : ''}`} data-testid="access-join-status">
              {err ? <><WarningCircle size={14} weight="bold" aria-hidden />{err}</>
                : current?.valid ? <><Handshake size={14} weight="bold" aria-hidden />{current.name ?? 'A partner'} uses this code</>
                : current ? <><WarningCircle size={14} weight="bold" aria-hidden />No active partner uses this code</>
                : 'You can link a partner once.'}
            </span>
          </form>
        )}
        <p className="ax-hint">No code? Ask the person who sent you to TRADElogs. Everything else on TRADElogs works without one.</p>
      </div>
      <CodeTicket code={code} state={state} partner={current?.valid ? current.name : null} />
    </section>
  );
}

/** Linked: who the partner is, the code, and how much is unlocked. */
function LinkedHero({ d }: { d: ClientAccess }) {
  const p = d.partner!;
  const unlocked = d.packages.filter(x => x.status === 'ACTIVE' || x.status === 'GRACE').length;
  return (
    <section className="x-card ax-hero" data-testid="access-partner">
      <div>
        <span className="ax-eyebrow-l"><Handshake size={14} weight="bold" aria-hidden />Your partner</span>
        <div className="ax-who"><span className="ax-av" aria-hidden>{initials(p.name)}</span><h2>Referred by {p.name}</h2></div>
        <div className="ax-chips">
          <span className="ax-chip">Code <b className="m">{p.code}</b></span>
          <span className="ax-chip"><b className="m">{unlocked}</b> of <b className="m">{d.packages.length}</b> package{d.packages.length === 1 ? '' : 's'} unlocked</span>
          {d.products.length > 0 && <span className="ax-chip"><b className="m">{d.products.length}</b> tool{d.products.length === 1 ? '' : 's'}</span>}
          {p.status === 'PAUSED' && <span className="ax-chip warn"><WarningCircle size={13} weight="bold" aria-hidden />Programme paused: unlocked packages are on their grace period</span>}
        </div>
        <p className="ax-hero-p">{unlocked ? `Everything ${p.name.split(' ')[0]} unlocked for you is listed below.` : 'Finish the steps below and their packages unlock by themselves.'}</p>
      </div>
      <CodeTicket code={p.code} state="linked" partner={p.name.split(' ')[0]} />
    </section>
  );
}

/** Plain-language privacy: what a partner can and can't see about a client. */
function WhatTheySee() {
  return (
    <section className="x-card" data-testid="access-privacy">
      <div className="ax-h"><h2>What a partner sees about you</h2><span>Your account stays yours</span></div>
      <div className="ax-see">
        <div className="is-always"><h3><span className="ax-see-ic"><Eye size={16} weight="bold" /></span>Always</h3>
          <ul><li>Your name, city and country</li><li>Whether your broker account checks out</li><li>How many trades and lots in the last 30 days</li></ul></div>
        <div className="is-choice"><h3><span className="ax-see-ic"><ToggleRight size={16} weight="bold" /></span>Only if you turn it on</h3>
          <ul><li>Your net P&amp;L, so they can coach you</li><li>You can switch it off any time</li></ul></div>
        <div className="is-never"><h3><span className="ax-see-ic"><EyeSlash size={16} weight="bold" /></span>Never</h3>
          <ul><li>Your email</li><li>Balance and equity</li><li>Individual trades</li><li>Your MT5 password</li></ul></div>
      </div>
    </section>
  );
}

/** Invite to the partner programme, or a way back to the partner dashboard. */
function PartnerBand({ me }: { me: PartnerProfile | null }) {
  const title = me?.status === 'ACTIVE' ? 'Your partner dashboard' : me?.status === 'PENDING' || me?.status === 'NEEDS_INFO' ? 'Your partner application' : 'Run a trading community?';
  const body = me?.status === 'ACTIVE' ? 'See who joined through you, their broker checks and what they’ve unlocked.'
    : me?.status === 'PENDING' ? 'It’s with our team. You’ll get an email when it’s reviewed.'
    : me?.status === 'NEEDS_INFO' ? 'Our team asked for a little more. Open it to see what.'
    : 'Become a TRADElogs partner: share your link, verify your clients at your broker and give them your own tools.';
  const cta = me?.status === 'ACTIVE' ? 'Open dashboard' : me?.status === 'PENDING' || me?.status === 'NEEDS_INFO' ? 'View application' : 'Become a partner';
  return (
    <section className="x-card ax-band" data-testid="access-partner-band">
      <span className="ax-band-ic"><Megaphone size={26} weight="duotone" aria-hidden /></span>
      <div><h3>{title}</h3><p>{body}</p></div>
      <Link href="/partner" className="x-btn x-btn--hi">{cta}<ArrowRight size={15} weight="bold" aria-hidden /></Link>
    </section>
  );
}

function AccountRow({ a, onChange, onToast }: { a: AccessAccount; onChange: (d: ClientAccess) => void; onToast: (s: string) => void }) {
  const [email, setEmail] = useState(a.brokerEmail ?? '');
  const [busy, setBusy] = useState<'check' | 'review' | null>(null);
  async function run(kind: 'check' | 'review') {
    setBusy(kind);
    try {
      const d = kind === 'check' ? await ibApi.verify(a.id, email.trim() || undefined) : await ibApi.review(a.id);
      onChange(d);
      const now = d.accounts.find(x => x.id === a.id);
      onToast(kind === 'review' ? 'Sent to our team. We’ll check it against the broker.' : now?.status === 'VERIFIED' ? 'Verified. Your partner’s packages are unlocking.' : 'Checked. See the note on the account.');
    } catch (x) { onToast(msg(x, 'That didn’t work.')); } finally { setBusy(null); }
  }
  return (
    <li className="ib-acct" data-testid={`access-acct-${a.label.split(' ')[0]}`}>
      <div className="ib-acct-h">
        <span><b className="m">{a.label}</b><small>{a.platform}{a.kind === 'external' ? ' · added for checking' : ''} · {a.broker}{a.checkedAt ? ` · checked ${timeAgo(a.checkedAt)}` : ''}</small></span>
        <span className="ib-br-btns"><VerifyPill s={a.status} />
          {a.kind === 'external' && <button type="button" className="x-btn x-btn--sm x-btn--ghost" aria-label="Remove account" onClick={async () => { try { onChange(await ibApi.removeAccount(a.id)); onToast('Account removed.'); } catch (x) { onToast(msg(x, 'Could not remove it.')); } }}><Trash size={14} weight="bold" /></button>}
        </span>
      </div>
      {a.reason && <p>{a.reason}</p>}
      {a.canRetry && (
        <div className="ib-acct-f">
          <input className="x-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email the broker has for this account (optional)" aria-label="Broker email" />
          <button type="button" className="x-btn x-btn--sm" disabled={!!busy} onClick={() => void run('check')}>{busy === 'check' ? 'Checking…' : 'Check again'}</button>
          {!a.reviewRequested && a.status !== 'MANUAL_REVIEW' && <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={!!busy} onClick={() => void run('review')}>Ask for a review</button>}
          {(a.reviewRequested || a.status === 'MANUAL_REVIEW') && <span className="x-help">Our team is reviewing this account.</span>}
        </div>
      )}
    </li>
  );
}

function ConsentCard({ d, onChange }: { d: ClientAccess; onChange: (d: ClientAccess) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="x-card ib-consent" data-testid="access-consent">
      <div>
        <h2 className="ib-h2">Share my P&amp;L with {d.partner?.name.split(' ')[0]}</h2>
        <p>Your partner always sees your name, city, broker check and how many trades you placed. Turn this on to also show your net P&amp;L, so they can coach you. You can turn it off any time.{d.consent.at ? ` Shared since ${day(d.consent.at)}.` : ''}</p>
      </div>
      <button type="button" role="switch" aria-checked={d.consent.share} className={`x-btn ${d.consent.share ? '' : 'x-btn--hi'}`} disabled={busy} data-testid="access-consent-toggle"
        onClick={async () => { setBusy(true); try { onChange(await ibApi.consent(!d.consent.share)); } finally { setBusy(false); } }}>
        {d.consent.share ? 'Stop sharing' : 'Share my P&L'}
      </button>
    </section>
  );
}

const PLATFORMS = ['MT4', 'MT5', 'CTRADER', 'OTHER'] as const;
function AddAccount({ onAdded }: { onAdded: (d: ClientAccess) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ platform: 'MT4', login: '', server: '', broker: '', brokerEmail: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return <p className="ib-note"><button type="button" className="x-link" onClick={() => setOpen(true)} data-testid="access-add-account">Trading on MT4 or another platform?</button> Add that account so it can be checked too.</p>;
  const valid = /^[A-Za-z0-9_-]{3,30}$/.test(f.login) && f.server.trim().length >= 2 && f.broker.trim().length >= 2;
  return (
    <form className="x-inset ac-form ac-form--wide" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('');
      try {
        onAdded(await ibApi.addAccount({ platform: f.platform, login: f.login.trim(), server: f.server.trim(), broker: f.broker.trim(), ...(f.brokerEmail.trim() ? { brokerEmail: f.brokerEmail.trim() } : {}) }));
        setOpen(false); setF({ platform: 'MT4', login: '', server: '', broker: '', brokerEmail: '' });
      } catch (x) { setErr(msg(x, 'Could not add the account.')); } finally { setBusy(false); }
    }} data-testid="access-add-form">
      <p className="ib-note">TRADElogs can&rsquo;t sign in to these accounts, so when the number is on your partner&rsquo;s list our team confirms it&rsquo;s yours before it counts. Trading activity comes from what the broker reports.</p>
      <div className="ib-form-row">
        <div className="x-field"><label>Platform</label><select className="x-select" value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}>{PLATFORMS.map(p => <option key={p} value={p}>{p === 'CTRADER' ? 'cTrader' : p === 'OTHER' ? 'Other' : p}</option>)}</select></div>
        <div className="x-field"><label>Account number</label><input className="x-input m" value={f.login} onChange={e => setF({ ...f, login: e.target.value.trim() })} placeholder="7001234" data-testid="access-add-login" /></div>
        <div className="x-field"><label>Server</label><input className="x-input" value={f.server} onChange={e => setF({ ...f, server: e.target.value })} placeholder="Xellion-Live" data-testid="access-add-server" /></div>
        <div className="x-field"><label>Broker</label><input className="x-input" value={f.broker} onChange={e => setF({ ...f, broker: e.target.value })} placeholder="Xellion" data-testid="access-add-broker" /></div>
        <div className="x-field"><label>Email at the broker <span className="x-dim">(optional)</span></label><input className="x-input" type="email" value={f.brokerEmail} onChange={e => setF({ ...f, brokerEmail: e.target.value })} /></div>
      </div>
      {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
      <div className="ib-acct-f"><button type="submit" className="x-btn x-btn--hi x-btn--sm" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add and check'}</button><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
