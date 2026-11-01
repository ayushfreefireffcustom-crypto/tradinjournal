'use client';

// Subscriptions (H3): marketplace strategies you run. Pause, change size, or
// cancel (let open trades finish, or close them now).
import Link from 'next/link';
import { useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad, usePoll } from '@/components/v6/copy/parts';
import { ApiError } from '@/lib/copy-api';
import { marketApi, type Subscription } from '@/lib/marketplace-api';
import { tone, usd } from '@/lib/strategies-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/marketplace.css';

const STATUS: Record<Subscription['status'], [string, string]> = { active: ['Running', 'x-tag--g'], paused: ['Paused', ''], cancelled: ['Cancelled', ''], ended: ['Stopped', ''], attention: ['Needs attention', 'x-tag--r'] };

export default function SubscriptionsPage() {
  const toast = useToast();
  const list = useLoad(() => marketApi.subscriptions(), []);
  usePoll(() => void list.reload(), 30_000);
  const [cancel, setCancel] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function act(s: Subscription, action: 'pause' | 'resume' | 'cancel' | 'cancel_settle') {
    setBusy(s.id);
    try {
      await marketApi.manage(s.id, action);
      toast.success(action === 'pause' ? 'Paused: no new trades' : action === 'resume' ? 'Running again' : action === 'cancel' ? 'Cancelled: open trades finish on their own exits' : 'Cancelled and closed');
      setCancel(null);
      void list.reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'That didn’t work'); }
    finally { setBusy(null); }
  }
  async function size(s: Subscription, v: string) {
    const m = Number(v);
    if (!(m >= 0.01 && m <= 10) || m === s.deployment?.multiplier) return;
    try { await marketApi.resize(s.id, m); toast.success(`New trades at ${m}× size`); void list.reload(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Couldn’t change the size'); }
  }
  const rows = list.data ?? [];
  const live = rows.filter((r) => r.status !== 'cancelled' && r.status !== 'ended');
  const past = rows.filter((r) => r.status === 'cancelled' || r.status === 'ended');
  const row = (s: Subscription) => {
    const d = s.deployment;
    const open = s.status === 'active' || s.status === 'paused' || s.status === 'attention';
    return (
      <article key={s.id} className="x-card mk-subrow" data-testid={`mk-sub-${s.id}`}>
        <header>
          <div><b>{s.template?.name ?? 'Removed strategy'}</b><span className="x-muted">{s.template ? `by ${s.template.creator}` : 'The creator removed it; your run continues.'}{s.template && !s.template.listed ? ' · unlisted' : ''}</span></div>
          <span className={`x-tag ${STATUS[s.status][1]}`} data-testid="mk-sub-status">{STATUS[s.status][0]}</span>
          {d && <span className={`x-tag ${d.mode === 'live' ? 'x-tag--r' : ''}`}>{d.mode === 'live' ? 'Live' : 'Paper'}</span>}
        </header>
        {d && (
          <div className="mk-stats">
            <div><span>Closed P&amp;L</span><b className={`m ${tone(d.closedPnl)}`}>{usd(d.closedPnl)}</b></div>
            <div><span>Open P&amp;L</span><b className={`m ${tone(d.openPnl)}`}>{d.openPnl == null ? (d.mode === 'live' ? 'on exchange' : '—') : usd(d.openPnl)}</b></div>
            <div><span>Trades</span><b className="m">{d.trades}</b></div>
            <div><span>Since</span><b>{new Date(d.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</b></div>
          </div>
        )}
        {s.params.length > 0 && <p className="x-muted mk-fine">Your settings: {s.params.map((p) => `${p.label} ${p.value}`).join(' · ')}</p>}
        {d?.error && <p className="cp-err">{d.error}</p>}
        <div className="mk-subact">
          {d && <Link className="x-btn x-btn--sm" href={`/strategies/deployments/${d.id}`}>Activity</Link>}
          {open && d && (
            <>
              {s.status === 'paused' || s.status === 'attention' ? <button className="x-btn x-btn--sm" disabled={busy === s.id} onClick={() => void act(s, 'resume')} data-testid="mk-sub-resume">Resume</button>
                : <button className="x-btn x-btn--sm" disabled={busy === s.id} onClick={() => void act(s, 'pause')} data-testid="mk-sub-pause">Pause</button>}
              <label className="mk-size">Size <input className="x-input m" type="number" min={0.01} max={10} step={0.1} defaultValue={d.multiplier} key={d.multiplier} onBlur={(e) => void size(s, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label="Size multiplier" data-testid="mk-sub-size" />×</label>
              <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => setCancel(s)} data-testid="mk-sub-cancel">Cancel</button>
            </>
          )}
        </div>
      </article>
    );
  };
  return (
    <AppShell legacy={false} pageTitle="Subscriptions" pageSubtitle="Marketplace strategies you run" actions={<Link className="x-btn" href="/marketplace">Marketplace</Link>}>
      <div className="x-page mk-page" data-testid="mk-subs-page">
        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="x-skel" style={{ height: 300 }} /> : !rows.length ? (
          <div className="x-card x-empty" data-testid="mk-subs-empty"><b>You’re not running any marketplace strategies</b><p>Pick one in the <Link className="x-link" href="/marketplace">marketplace</Link> and run it on paper first.</p></div>
        ) : (
          <>
            {live.length > 0 ? <div className="mk-subs">{live.map(row)}</div> : <p className="x-muted">Nothing running right now.</p>}
            {past.length > 0 && <><h2 className="mk-h2">Ended</h2><div className="mk-subs">{past.map(row)}</div></>}
          </>
        )}
      </div>
      {cancel && (
        <Modal title={`Cancel ${cancel.template?.name ?? 'this strategy'}?`} sub="No new trades either way." onClose={() => setCancel(null)} busy={busy === cancel.id} testId="mk-cancel-dialog"
          footer={<><button className="x-btn" onClick={() => setCancel(null)}>Keep running</button>
            <button className="x-btn" onClick={() => void act(cancel, 'cancel')} disabled={busy === cancel.id} data-testid="mk-cancel-stop">Let open trades finish</button>
            <button className="x-btn x-btn--hi" onClick={() => void act(cancel, 'cancel_settle')} disabled={busy === cancel.id} data-testid="mk-cancel-settle">Close them now</button></>}>
          <p>“Let open trades finish” keeps each open position until its stop, target or exit rule closes it. “Close them now” closes them at market{cancel.deployment?.mode === 'live' ? ' on your exchange account' : ''}.</p>
        </Modal>
      )}
    </AppShell>
  );
}
