'use client';

// My copies (C4.5): every follow with its status, P&L and controls. Pause keeps
// copying exits; stop asks what to do with open copies. Updates live.
import { useState } from 'react';
import Link from '@/components/v6/ui/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import FollowDialog from '@/components/v6/copy/follow-dialog';
import StopDialog from '@/components/v6/copy/stop-dialog';
import { FollowStatusTag, Monogram, useCopyStream } from '@/components/v6/copy/parts';
import { ago, useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import { IMirror, IPause, IPlay } from '@/components/v6/icons';
import { followsApi, signedUsd, sizingLabel, toneOf, venueName, type Follow } from '@/lib/copy-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/copy.css';

export default function FollowingPage() {
  const toast = useToast();
  const [showStopped, setShowStopped] = useState(false);
  const follows = useLoad(() => followsApi.list(showStopped), [showStopped]);
  useCopyStream(() => void follows.reload());
  usePoll(() => void follows.reload(), 60_000);
  const [editing, setEditing] = useState<Follow | null>(null);
  const [stopping, setStopping] = useState<Follow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = follows.data ?? [];
  const replace = (f: Follow) => follows.setData(prev => (prev ?? []).map(x => (x.id === f.id ? f : x)).filter(x => showStopped || x.status !== 'STOPPED'));
  const totals = list.filter(f => f.status !== 'STOPPED').reduce((t, f) => ({ r: t.r + f.realizedPnlUsd, u: t.u + f.unrealizedPnlUsd, open: t.open + f.openPositions }), { r: 0, u: 0, open: 0 });

  async function toggle(f: Follow) {
    setBusy(f.id);
    try {
      const r = await followsApi.update(f.id, { action: f.status === 'ACTIVE' ? 'pause' : 'resume' });
      replace(r);
      toast.success(r.status === 'ACTIVE' ? 'Copying resumed' : 'Paused: exits still copy');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell legacy={false} pageTitle="My copies" pageSubtitle="Leaders you copy"
      actions={<Link href="/copy" className="x-btn x-btn--hi">Find leaders</Link>}>
      <div className="x-page" data-testid="following-page">
        <div className="x-strip x-strip--card" style={{ ['--n' as string]: 3 }}>
          <div><span>Realized P&amp;L</span><b className={`m ${toneOf(totals.r)}`}>{follows.data ? signedUsd(totals.r) : '—'}</b></div>
          <div><span>Open P&amp;L</span><b className={`m ${toneOf(totals.u)}`}>{follows.data ? signedUsd(totals.u) : '—'}</b></div>
          <div><span>Open positions</span><b className="m">{follows.data ? totals.open : '—'}</b></div>
        </div>

        {follows.error ? <ErrorCard message={follows.error} onRetry={follows.reload} /> : follows.loading && !follows.data ? (
          <div className="cp-grid">{[0, 1].map(i => <div key={i} className="x-skel cp-skel-card" />)}</div>
        ) : list.length === 0 ? (
          <div className="x-card x-empty" data-testid="following-empty">
            <span className="x-ic"><IMirror size={22} /></span>
            <b>{showStopped ? 'No copies yet' : 'You’re not copying anyone'}</b>
            <p>Pick a leader, choose your size, and their new trades are copied to your exchange account.</p>
            <Link href="/copy" className="x-btn x-btn--hi">Browse leaders</Link>
          </div>
        ) : (
          <section className="cp-grid" aria-label="Copies" data-testid="following-list">
            {list.map(f => (
              <article key={f.id} className={`x-card cp-fol ${f.status === 'STOPPED' ? 'off' : ''}`} data-testid={`follow-${f.id}`}>
                <header className="cp-fol-h">
                  <Monogram name={f.leader.displayName} />
                  <div className="cp-fol-id">
                    <Link href={`/copy/following/${f.id}`}><b>{f.leader.displayName}</b></Link>
                    <small>{sizingLabel(f.sizingMode, f.sizingValue)} · {f.connection.label}</small>
                  </div>
                  <FollowStatusTag f={f} />
                </header>
                {f.status === 'PAUSED' && f.pauseReason && <p className="cp-err" role="status">{f.pauseReason}. New trades aren&rsquo;t copied; exits still are.</p>}
                {f.connection.status !== 'ACTIVE' && f.status !== 'STOPPED' && <p className="cp-err" role="status">Your exchange key stopped working. <Link className="x-link" href="/exchanges">Reconnect</Link></p>}
                <div className="x-strip" style={{ ['--n' as string]: 3 }}>
                  <div><span>Realized</span><b className={`m ${toneOf(f.realizedPnlUsd)}`}>{signedUsd(f.realizedPnlUsd)}</b></div>
                  <div><span>Open P&amp;L</span><b className={`m ${toneOf(f.unrealizedPnlUsd)}`}>{signedUsd(f.unrealizedPnlUsd)}</b></div>
                  <div><span>Copied</span><b className="m">{f.copiedOrders}</b></div>
                </div>
                <footer className="cp-fol-f">
                  <span className="x-muted">{f.status === 'STOPPED' ? `Stopped ${ago(f.stoppedAt)}` : `Since ${ago(f.startedAt)} · last copy ${ago(f.lastCopyAt)}`}{f.skippedOrders + f.failedOrders > 0 ? ` · ${f.skippedOrders + f.failedOrders} not copied` : ''}</span>
                  {f.status !== 'STOPPED' ? (
                    <span className="cp-fol-acts">
                      <button className="x-btn x-btn--sm" onClick={() => toggle(f)} disabled={busy === f.id} data-testid={`follow-toggle-${f.id}`}>
                        {f.status === 'ACTIVE' ? <><IPause size={13} />Pause</> : <><IPlay size={13} />Resume</>}
                      </button>
                      <button className="x-btn x-btn--sm" onClick={() => setEditing(f)}>Settings</button>
                      <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={() => setStopping(f)} data-testid={`follow-stop-${f.id}`}>Stop</button>
                    </span>
                  ) : <Link href={`/copy/leaders/${f.leader.id}`} className="x-btn x-btn--sm">Leader</Link>}
                </footer>
              </article>
            ))}
          </section>
        )}
        <label className="cp-toggle cp-toggle--inline">
          <button type="button" className="x-switch" role="switch" aria-checked={showStopped} onClick={() => setShowStopped(v => !v)} aria-label="Show stopped copies" />
          <span>Show stopped copies</span>
        </label>
        <p className="cp-note">Copies run on {list[0] ? venueName(list[0].leader.exchange) : 'your exchange'}. Totals cover each copy since it last started.</p>
      </div>
      {editing && (
        <FollowDialog leader={{ id: editing.leader.id, displayName: editing.leader.displayName, exchange: editing.leader.exchange, environment: editing.connection.environment }} follow={editing}
          onClose={() => setEditing(null)} onDone={f => { replace(f); setEditing(null); toast.success('Settings saved'); }} />
      )}
      {stopping && (
        <StopDialog follow={stopping} onClose={() => setStopping(null)}
          onDone={r => { replace(r.follow); setStopping(null); toast.success(`Stopped copying ${r.follow.leader.displayName}`); }} />
      )}
    </AppShell>
  );
}
