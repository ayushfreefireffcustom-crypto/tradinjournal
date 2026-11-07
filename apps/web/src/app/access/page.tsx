'use client';

// A trader's side of the partner programme: who referred them, whether each MT5
// account checks out under that partner's IB, what they've unlocked and why
// anything is still locked, plus the choice to share their P&L with the partner.
// Each section holds a small render of the real screen (components/v6/account/access-art).
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Hourglass, LockSimple, Trash, WarningCircle } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import { dayUtc, ibApi, PRODUCT_TYPE_LABEL, type AccessAccount, type AccessPackage, type ClientAccess } from '@/lib/ib-api';
import { VerifyPill } from '@/components/v6/account/ib-parts';
import { day } from '@/components/v6/account/partner-parts';
import { timeAgo } from '@/components/app-shell';
import { Caption, LinkPreview, PartnerRowPreview, PathList, VMatch, VSignup, VUnlock, Win, type LookupState, type PathRow } from '@/components/v6/account/access-art';
import { partnerApi, type PartnerProfile } from '@/lib/partner-api';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';
import '@/styles/v6/access.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const first = (n: string) => n.split(' ')[0] ?? n;
/** Access stops because the package ends (not the holder's own access period). */
const endsByPackage = (p: { expiresAt: string | null; endsOn: string | null }) =>
  !!p.expiresAt && !!p.endsOn && Date.parse(p.expiresAt) === Date.parse(`${p.endsOn}T00:00:00Z`) + 86_400_000;

export default function AccessPage() {
  const { accounts, selected, select } = useAccounts();
  const { data: session } = authClient.useSession();
  const [d, setD] = useState<ClientAccess | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [me, setMe] = useState<PartnerProfile | null | undefined>(undefined);

  const load = useCallback(async () => {
    try { setD(await ibApi.access()); setError(''); } catch (e) { setError(msg(e, 'Could not load your access.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { partnerApi.me().then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const user = session?.user as { name?: string; city?: string | null; country?: string | null } | undefined;
  const place = [user?.city, user?.country === 'IN' ? 'India' : user?.country].filter(Boolean).join(', ');

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner access"
      pageSubtitle="Your partner, your broker check and what you’ve unlocked">
      <div className="x-page" data-testid="access-page">
        {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
        {!d && !error && <><div className="x-skel ac-sk-320" /><div className="x-skel ac-sk-168" /></>}

        {d && <>
          {d.partner ? <LinkedHero d={d} /> : <JoinHero canJoin={d.canJoin} onJoined={x => { setD(x); setToast(`You’re now linked to ${x.partner?.name ?? 'your partner'}.`); }} />}

          <section data-testid="access-progress">
            <PathList title={d.partner ? `Your path to ${first(d.partner.name)}’s tools` : 'Your path to a partner’s tools'} {...path(d)} />
          </section>

          {!d.partner && <>
            <div className="ax-sec"><h2>How it works</h2><p>Three things happen, and only the first one is up to you.</p></div>
            <div className="ax-cards">
              <article className="x-card ax-card"><VSignup /><h3>Link once.</h3><p>Sign up through your partner&rsquo;s link, or type their code. It sticks to your account for good.</p></article>
              <article className="x-card ax-card"><VMatch /><h3>Checked at the broker.</h3><p>We look for your MT5 account on your partner&rsquo;s client list at the broker. A match is the proof; an email alone never is.</p></article>
              <article className="x-card ax-card"><VUnlock /><h3>Their tools, yours.</h3><p>Packages unlock by themselves when the checks pass, and pause with a grace period if they stop passing.</p></article>
            </div>
            <Caption>Drawn from TRADElogs screens · demo names</Caption>
          </>}

          {d.partner && <Accounts d={d} setD={setD} setToast={setToast} />}
          {d.partner && d.products.length > 0 && <Tools d={d} />}
          {d.partner && <Packages d={d} />}

          <WhatTheySee d={d} name={user?.name ?? ''} place={place} onChange={x => { setD(x); setToast(x.consent.share ? `${first(x.partner?.name ?? 'Your partner')} can now see your P&L.` : 'Your P&L is private again.'); }} />

          {!d.partner && d.lockedPerks.length > 0 && (
            <p className="ac-br-note"><LockSimple size={14} weight="bold" aria-hidden />Some features come with a partner package: {d.lockedPerks.join(', ')}.</p>
          )}
          {me !== undefined && <PartnerBand me={me} />}
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}

/** The real steps, as checklist rows with their actual values. */
function path(d: ClientAccess): { rows: PathRow[]; next: string | null; action?: React.ReactNode } {
  const acct = d.accounts[0];
  const verified = d.accounts.find(a => a.status === 'VERIFIED');
  const unlocked = d.packages.filter(p => p.status === 'ACTIVE' || p.status === 'GRACE').length;
  const rule = d.activity.rule;
  const rows: PathRow[] = [
    { key: 'partner', title: 'Link your partner', note: d.partner ? `${d.partner.name}` : 'Their link or their code', value: d.partner ? d.partner.code : '—', done: !!d.partner },
    { key: 'account', title: 'Connect your MT5 account', note: acct ? `${acct.broker}${d.accounts.length > 1 ? ` + ${d.accounts.length - 1} more` : ''}` : 'The one you opened through your partner', value: acct ? acct.label.split(' · ')[0] : '—', done: d.accounts.length > 0 },
    { key: 'check', title: 'Broker check', note: verified ? `Found on ${d.partner ? first(d.partner.name) + '’s' : 'the'} client list` : d.partner && acct ? 'Not on their list yet' : 'We match your account to their list', value: verified ? 'Verified' : d.partner && acct ? 'Waiting' : '—', done: !!verified },
    ...(d.partner ? [{ key: 'active', title: 'Trade', note: `${rule.minTrades}+ closed trade${rule.minTrades === 1 ? '' : 's'} in ${rule.windowDays} days`, value: `${d.activity.trades} / ${rule.minTrades}`, done: d.activity.active, bar: rule.minTrades ? d.activity.trades / rule.minTrades : 1 }] : []),
    { key: 'unlock', title: 'Unlock their tools', note: d.partner ? (d.packages.length ? `${d.packages.length} package${d.packages.length === 1 ? '' : 's'} on offer` : 'Nothing on offer yet') : 'Packages, guides and strategies', value: d.partner ? `${unlocked} / ${d.packages.length}` : '—', done: unlocked > 0 },
  ];
  const next = rows.find(r => !r.done);
  const action = next?.key === 'account' ? <Link href="/brokers" className="x-btn x-btn--sm">Connect MT5</Link> : undefined;
  return { rows, next: next ? next.title.toLowerCase() : null, action };
}

/** No partner yet. Typing fills the link in the little browser and checks the code live. */
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
  const state: LookupState = !code ? 'idle' : code.length < 3 ? 'typing' : !current ? 'checking' : current.valid ? 'found' : 'missing';
  return (
    <section className="x-card ax-hero2" data-testid="access-partner">
      <div>
        <span className="ax-kicker">Partner access</span>
        <h2>Who sent <em>you</em>?</h2>
        <p className="ax-lede">If a trader, coach or community brought you to TRADElogs, link them once. Their tools unlock as soon as your broker account checks out.</p>
        {canJoin && (
          <form className="ax-join2" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setErr('');
            try { onJoined(await ibApi.join(code)); } catch (x) { setErr(msg(x, 'That code didn’t work.')); } finally { setBusy(false); }
          }}>
            <input className="x-input" value={code} maxLength={20} autoComplete="off" spellCheck={false}
              onChange={e => { setErr(''); setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase()); }}
              placeholder="Their code, e.g. MAYA" aria-label="Partner code" aria-describedby="ax-join-st" data-testid="access-join-code" />
            <button type="submit" className="x-btn x-btn--hi" disabled={code.length < 3 || busy || current?.valid === false} data-testid="access-join">{busy ? 'Linking…' : <>Link<ArrowRight size={15} weight="bold" aria-hidden /></>}</button>
            <span id="ax-join-st" role="status" className={`ax-st2 ${err || current?.valid === false ? 'bad' : current?.valid ? 'ok' : ''}`} data-testid="access-join-status">
              {err ? <><WarningCircle size={14} weight="bold" aria-hidden />{err}</>
                : current?.valid ? <><Check size={14} weight="bold" aria-hidden />{current.name ?? 'A partner'} uses this code</>
                : current ? <><WarningCircle size={14} weight="bold" aria-hidden />No active partner uses this code</>
                : 'You can link a partner once.'}
            </span>
          </form>
        )}
        <ul className="ax-facts"><li>No code? Everything else on TRADElogs works without one.</li></ul>
      </div>
      <div>
        <LinkPreview code={code} state={state} name={current?.valid ? current.name : null} />
        <Caption live>Live · checks the code as you type</Caption>
      </div>
    </section>
  );
}

/** Linked: who the partner is and how far along the client is. */
function LinkedHero({ d }: { d: ClientAccess }) {
  const p = d.partner!;
  const unlocked = d.packages.filter(x => x.status === 'ACTIVE' || x.status === 'GRACE').length;
  return (
    <section className="x-card ax-hero2" data-testid="access-partner">
      <div>
        <span className="ax-kicker">Your partner</span>
        <h2>{first(p.name)} brought <em>you</em> here.</h2>
        <p className="ax-lede">Referred by {p.name}. {unlocked ? `${unlocked === d.packages.length ? 'Everything' : `${unlocked} of ${d.packages.length} packages`} they offer is unlocked for you.` : 'Finish the list below and their packages unlock by themselves.'}</p>
        <ul className="ax-facts">
          <li>Code <b>{p.code}</b></li>
          <li><b>{unlocked}</b> of <b>{d.packages.length}</b> package{d.packages.length === 1 ? '' : 's'} unlocked</li>
          {d.products.length > 0 && <li><b>{d.products.length}</b> tool{d.products.length === 1 ? '' : 's'}</li>}
        </ul>
        {p.status === 'PAUSED' && <p className="ax-st2 bad"><WarningCircle size={14} weight="bold" aria-hidden />Their programme is paused, so what you unlocked runs on its grace period.</p>}
      </div>
      <div>
        <LinkPreview code={p.code} state="linked" name={p.name} />
        <Caption live>Your link · {p.code}</Caption>
      </div>
    </section>
  );
}

function Accounts({ d, setD, setToast }: { d: ClientAccess; setD: (x: ClientAccess) => void; setToast: (s: string) => void }) {
  return (
    <section data-testid="access-accounts">
      <Win title="Your broker accounts" right={d.activity.checkedAt ? `activity checked ${timeAgo(d.activity.checkedAt)}` : `${d.accounts.length} connected`} className="axwin--path">
        {d.accounts.length === 0
          ? <div className="ax-list"><p className="ac-p" style={{ padding: 16, margin: 0 }}>Connect the MT5 account you opened through your partner. We check it against their list straight away. <Link href="/brokers" className="x-link">Connect MT5</Link></p></div>
          : <ul className="ib-accts ax-list">{d.accounts.map(a => <AccountRow key={a.id} a={a} onChange={x => setD(x)} onToast={setToast} />)}</ul>}
        <div style={{ padding: '0 16px 12px' }}><AddAccount onAdded={x => { setD(x); setToast('Account added and checked.'); }} /></div>
      </Win>
    </section>
  );
}

function Tools({ d }: { d: ClientAccess }) {
  return (
    <section data-testid="access-tools">
      <Win title={`Tools from ${first(d.partner!.name)}`} right={`${d.products.length}`} className="axwin--path">
        <ul className="axrows">{d.products.map(t => (
          <li key={t.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
            <span><b>{t.name}</b>{t.description && <span className="axmute"> · {t.description}</span>}</span>
            <span className="axmute">{PRODUCT_TYPE_LABEL[t.type]}{t.platform ? ` · ${t.platform}` : ''} · v{t.version}</span>
            <Link href={`/access/tools/${t.id}`} className="x-btn x-btn--sm x-btn--hi" data-testid={`access-tool-${t.name}`}>Open</Link>
          </li>
        ))}</ul>
      </Win>
    </section>
  );
}

const ENT_CHIP: Record<string, { label: string; ok: boolean }> = {
  ACTIVE: { label: 'Unlocked', ok: true }, GRACE: { label: 'Grace period', ok: false }, SUSPENDED: { label: 'Paused', ok: false },
  EXPIRED: { label: 'Ended', ok: false }, LOCKED: { label: 'Locked', ok: false },
};

function Packages({ d }: { d: ClientAccess }) {
  const live = (p: AccessPackage) => p.status === 'ACTIVE' || p.status === 'GRACE';
  return (
    <section data-testid="access-packages">
      <div className="ax-sec"><h2>What {first(d.partner!.name)} offers</h2><p>{d.packages.length ? 'Unlocked packages open straight from here.' : 'When they publish a package, it shows up here.'}</p></div>
      {d.packages.length > 0 && (
        <div className="ax-pkgs2" style={{ padding: 0, marginTop: 12 }}>
          {d.packages.map(p => {
            const chip = ENT_CHIP[p.status] ?? ENT_CHIP.LOCKED!;
            return (
              <article key={p.id} className={`ax-pkg2 ${live(p) ? '' : 'is-off'}`} data-testid={`access-pkg-${p.name}`}>
                <Win title={p.name} right={<span className={`axchip ${chip.ok ? 'ok' : ''}`}>{chip.ok ? <Check size={11} weight="bold" /> : p.status === 'GRACE' ? <Hourglass size={11} weight="bold" /> : <LockSimple size={11} weight="bold" />}{chip.label}</span>}>
                  {p.description && <p className="ax-why" style={{ borderTop: 0 }}>{p.description}</p>}
                  <ul className="axrows">
                    {p.perks.map(k => <li key={k.key}><span className="axmute">Feature</span>{live(p) ? <Link href={k.href}>{k.label}</Link> : <span>{k.label}</span>}<span className="axmute">{live(p) ? 'Open' : ''}</span></li>)}
                    {p.templates.map(t => <li key={t.id}><span className="axmute">Strategy</span>{live(p) ? <Link href={`/marketplace/${t.id}`}>{t.name}</Link> : <span>{t.name}</span>}<span className="axmute">{live(p) ? 'Open' : ''}</span></li>)}
                    {p.products.map(t => <li key={t.id}><span className="axmute">Tool</span>{live(p) ? <Link href={`/access/tools/${t.id}`}>{t.name}</Link> : <span>{t.name}</span>}<span className="axmute">{live(p) ? 'Open' : ''}</span></li>)}
                  </ul>
                  {p.reasons.length > 0 && <p className="ax-why">{p.reasons.join(' ')}</p>}
                  <div className="ax-meta">
                    {p.status === 'GRACE' && p.graceUntil && <span>Grace ends {day(p.graceUntil)}</span>}
                    {p.grantedAt && p.status !== 'LOCKED' && <span>Unlocked {day(p.grantedAt)}</span>}
                    {p.expiresAt && p.status !== 'EXPIRED' && p.status !== 'LOCKED' && <span>Access until {endsByPackage(p) ? `the end of ${dayUtc(p.endsOn!)} (UTC)` : day(p.expiresAt)}</span>}
                    {p.endsOn && p.status === 'LOCKED' && <span data-testid={`access-ends-${p.name}`}>Offer ends {dayUtc(p.endsOn)}</span>}
                  </div>
                </Win>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Your row as your partner sees it, with the switch that changes it. */
function WhatTheySee({ d, name, place, onChange }: { d: ClientAccess; name: string; place: string; onChange: (x: ClientAccess) => void }) {
  const [busy, setBusy] = useState(false);
  const partner = d.partner ? first(d.partner.name) : null;
  return (
    <section className="x-card ax-see2" data-testid="access-privacy">
      <div>
        <span className="ax-kicker">Privacy</span>
        <h2 style={{ marginTop: 10 }}>What {partner ?? 'a partner'} sees.</h2>
        <p>Your name, city, broker check and how much you trade. Your P&amp;L only if you switch it on.</p>
        {d.partner ? (
          <button type="button" role="switch" aria-checked={d.consent.share} className="ax-switch" disabled={busy} data-testid="access-consent-toggle"
            onClick={async () => { setBusy(true); try { onChange(await ibApi.consent(!d.consent.share)); } finally { setBusy(false); } }}>
            <span className="sw" aria-hidden />
            <span><b>Share my P&amp;L with {partner}</b><small>{d.consent.share ? `On since ${d.consent.at ? day(d.consent.at) : 'today'} · turn off any time` : 'Off · so they can coach you, if you want'}</small></span>
          </button>
        ) : null}
        <p className="ax-never-l">Never shown</p>
        <ul className="ax-never"><li>Email</li><li>Balance</li><li>Equity</li><li>Individual trades</li><li>MT5 password</li></ul>
      </div>
      <div data-testid={d.partner ? 'access-consent' : undefined}>
        <PartnerRowPreview partner={partner} name={name} place={place} verified={d.accounts.some(a => a.status === 'VERIFIED')} trades={d.activity.trades} shared={!!d.partner && d.consent.share} />
        <Caption live>Your real row{d.partner ? ', updates as you switch' : ''}</Caption>
      </div>
    </section>
  );
}

/** Invite to the partner programme, or the way back to the partner dashboard. */
function PartnerBand({ me }: { me: PartnerProfile | null }) {
  const active = me?.status === 'ACTIVE', review = me?.status === 'PENDING' || me?.status === 'NEEDS_INFO';
  return (
    <section className="ax-band2" data-testid="access-partner-band">
      <span>
        <b>{active ? 'Your partner dashboard' : review ? 'Your partner application' : 'Run a trading community?'}</b>
        <span>{active ? 'Clients, broker checks and what they’ve unlocked.' : me?.status === 'NEEDS_INFO' ? 'Our team asked for a little more.' : review ? 'It’s with our team. You’ll get an email.' : 'Become a partner: share your link, verify clients at your broker, give them your tools.'}</span>
      </span>
      <Link href="/partner" className="x-btn">{active ? 'Open dashboard' : review ? 'View application' : 'Become a partner'}<ArrowRight size={15} weight="bold" aria-hidden /></Link>
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
