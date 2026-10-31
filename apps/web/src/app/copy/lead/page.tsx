'use client';

// Become a leader (C4.7) and the leader's own tab (C4.8): apply with one of
// your exchange accounts, see the review status, and once live, your
// followers, their open copies and their combined P&L.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, useLoad } from '@/components/v6/copy/parts';
import { ICheck, ILeader } from '@/components/v3/icons';
import { exchangesApi, leadersApi, signedUsd, toneOf, venueName, type MyLeader } from '@/lib/copy-api';

const STATUS: Record<MyLeader['status'], { tag: string; tone: string; text: string }> = {
  PENDING: { tag: 'In review', tone: '', text: 'We check the account and your history, usually within two working days. You’ll get a notification.' },
  VERIFIED: { tag: 'Live', tone: 'x-tag--g', text: 'Your profile is on the leaderboard and people can copy you.' },
  PAUSED: { tag: 'Paused', tone: 'x-tag--r', text: 'New trades aren’t copied right now. When you close a trade, followers’ copies still close.' },
  DELISTED: { tag: 'Removed', tone: 'x-tag--r', text: 'Your profile was removed from copy trading. Contact support if you think this is a mistake.' },
};

export default function LeadPage() {
  const me = useLoad(() => leadersApi.me(), []);
  return (
    <AppShell legacy={false} pageTitle="Become a leader" pageSubtitle="Let other traders copy your exchange account">
      <div className="x-page" data-testid="lead-page">
        {me.error ? <ErrorCard message={me.error} onRetry={me.reload} /> : me.loading && me.data === null ? <div className="x-skel cp-skel-hero" /> : me.data ? <Portal l={me.data} onChange={v => me.setData(v)} /> : <Apply onDone={v => me.setData(v)} />}
      </div>
    </AppShell>
  );
}

function Apply({ onDone }: { onDone: (l: MyLeader) => void }) {
  const toast = useToast();
  const conns = useLoad(() => exchangesApi.list(), []);
  const [connectionId, setConnectionId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = (conns.data ?? []).filter(c => c.status === 'ACTIVE' && c.activeFollows === 0 && !c.isLeader);
  useEffect(() => { if (!connectionId && usable[0]) setConnectionId(usable[0].id); }, [usable, connectionId]);
  const ok = !!connectionId && name.trim().length >= 2 && bio.trim().length >= 20;

  return (
    <div className="cp-ld">
      <section className="x-card">
        <div className="x-ch"><h2>Apply</h2></div>
        {conns.loading && !conns.data ? <div className="x-skel cp-skel-input" /> : usable.length === 0 ? (
          <div className="x-empty">
            <span className="x-ic"><ILeader size={22} /></span>
            <b>Connect the account you trade</b>
            <p>Leaders are copied from a connected exchange account. Use one you trade yourself, not one that copies someone else.</p>
            <Link href="/exchanges" className="x-btn x-btn--hi">Connect exchange</Link>
          </div>
        ) : (
          <form className="cp-form" onSubmit={async e => {
            e.preventDefault();
            if (!ok) return;
            setBusy(true);
            setError(null);
            try {
              const r = await leadersApi.apply({ connectionId, displayName: name.trim(), bio: bio.trim() });
              toast.success('Application sent');
              onDone(r);
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not apply'); } finally { setBusy(false); }
          }}>
            <div className="x-field">
              <label htmlFor="ld-acct">Account to be copied</label>
              <select id="ld-acct" className="x-select" value={connectionId} onChange={e => setConnectionId(e.target.value)} data-testid="lead-account">
                {usable.map(c => <option key={c.id} value={c.id}>{c.label} · {venueName(c.exchange)} {c.environment === 'TESTNET' ? 'testnet' : ''} · ···{c.keyLast4}</option>)}
              </select>
            </div>
            <div className="x-field">
              <label htmlFor="ld-name">Display name</label>
              <input id="ld-name" className="x-input" value={name} onChange={e => setName(e.target.value.slice(0, 40))} placeholder="How followers see you" data-testid="lead-name" />
            </div>
            <div className="x-field">
              <label htmlFor="ld-bio">Your strategy</label>
              <textarea id="ld-bio" className="x-textarea" value={bio} onChange={e => setBio(e.target.value.slice(0, 2000))} placeholder="What you trade, your timeframe, how you manage risk." data-testid="lead-bio" />
              <span className="x-help">{bio.trim().length < 20 ? `${20 - bio.trim().length} more characters` : `${bio.length} / 2000`}</span>
            </div>
            {error && <div className="x-banner x-banner--err" role="alert" data-testid="lead-error">{error}</div>}
            <footer className="ac-dlg-ft"><button type="submit" className="x-btn x-btn--hi" disabled={!ok || busy} data-testid="lead-submit">{busy ? 'Sending…' : 'Send application'}</button></footer>
          </form>
        )}
      </section>
      <aside className="x-card">
        <div className="x-ch"><h2>How it works</h2></div>
        <ul className="cp-can">
          <li><ICheck size={15} /><span>Your stats come straight from the connected account. Nothing is self-reported.</span></li>
          <li><ICheck size={15} /><span>Followers copy your new trades from the moment they start; your open trades aren&rsquo;t copied into their accounts.</span></li>
          <li><ICheck size={15} /><span>You keep trading as normal. Hide your profile from the leaderboard at any time.</span></li>
          <li><ICheck size={15} /><span>The account you lead from can&rsquo;t copy anyone else.</span></li>
        </ul>
      </aside>
    </div>
  );
}

function Portal({ l, onChange }: { l: MyLeader; onChange: (l: MyLeader) => void }) {
  const toast = useToast();
  const st = STATUS[l.status];
  const [busy, setBusy] = useState(false);
  async function toggleListed() {
    setBusy(true);
    try { onChange(await leadersApi.updateMe({ listed: !l.listed })); toast.success(l.listed ? 'Hidden from the leaderboard' : 'Shown on the leaderboard'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update'); } finally { setBusy(false); }
  }
  return (
    <>
      <section className="x-card" data-testid="lead-portal">
        <div className="x-ch">
          <h2>{l.displayName}</h2>
          <span className={`x-tag ${st.tone}`} data-testid="lead-status">{st.tag}</span>
          {l.status === 'VERIFIED' && <span className="x-r"><Link className="x-link" href={`/copy/leaders/${l.id}`}>Public page</Link></span>}
        </div>
        <p className="x-muted cp-mb">{st.text}</p>
        <div className="x-strip" style={{ ['--n' as string]: 4 }}>
          <div><span>Followers</span><b className="m">{l.followers}</b></div>
          <div><span>Paused followers</span><b className="m">{l.pausedFollowers}</b></div>
          <div><span>Open copies</span><b className="m">{l.openCopiedPositions}</b></div>
          <div><span>Followers&rsquo; P&amp;L</span><b className={`m ${toneOf(l.followersPnlUsd)}`}>{signedUsd(l.followersPnlUsd)}</b></div>
        </div>
      </section>
      {l.status !== 'DELISTED' && (
        <section className="x-card">
          <div className="x-ch"><h2>Profile</h2><span className="x-sub">copied from {l.connectionLabel}</span></div>
          <label className="cp-toggle">
            <button type="button" className="x-switch" role="switch" aria-checked={l.listed} onClick={toggleListed} disabled={busy} aria-label="Show on the leaderboard" data-testid="lead-listed" />
            <span><b>Show on the leaderboard</b><small>Hidden profiles keep their current followers but take no new ones.</small></span>
          </label>
          {l.bio && <p className="cp-bio">{l.bio}</p>}
        </section>
      )}
    </>
  );
}
