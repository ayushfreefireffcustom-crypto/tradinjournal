'use client';

// Admin › Copy trading (C5): the leader review queue and leader management,
// the global kill switch, and engine health. Every action asks for a
// confirmation (with a reason where it affects people) and is audited.
import { useCallback, useEffect, useState } from 'react';
import Link from '@/components/v6/ui/link';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { ago, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import { ISync } from '@/components/v6/icons';
import { adminCopyApi, pct, usd, venueName, type AdminLeaderAction, type AdminLeaderRow, type EngineHealth, type KillSwitch, type LeaderStatus } from '@/lib/copy-api';
import '@/styles/v6/admin.css';
import '@/styles/v6/kit.css';
import '@/styles/v6/copy.css';

type View = 'PENDING' | 'VERIFIED' | 'PAUSED' | 'DELISTED' | 'ALL';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'PENDING', label: 'Review queue' },
  { id: 'VERIFIED', label: 'Live' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'DELISTED', label: 'Removed' },
  { id: 'ALL', label: 'All' },
];
const STATUS_TAG: Record<LeaderStatus, [string, string]> = {
  PENDING: ['In review', ''],
  VERIFIED: ['Live', 'x-tag--g'],
  PAUSED: ['Paused', 'x-tag--r'],
  DELISTED: ['Removed', 'x-tag--r'],
};
const ACTIONS: Record<LeaderStatus, AdminLeaderAction[]> = { PENDING: ['approve', 'reject'], VERIFIED: ['pause', 'delist'], PAUSED: ['resume', 'delist'], DELISTED: [] };
const ACTION_LABEL: Record<AdminLeaderAction, string> = { approve: 'Approve', reject: 'Reject', pause: 'Pause', resume: 'Resume', delist: 'Remove' };
const ms = (v: number | null) => (v == null ? '—' : v < 60_000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v / 60_000)} min`);

export default function AdminCopyPage() {
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const [tab, setTab] = useState<'leaders' | 'engine'>('leaders');
  const [view, setView] = useState<View>('PENDING');
  const [rows, setRows] = useState<AdminLeaderRow[] | null>(null);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadLeaders = useCallback(async () => {
    try { setRows(await adminCopyApi.leaders(view === 'ALL' ? undefined : view)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load leaders'); }
  }, [view]);
  const loadHealth = useCallback(async () => {
    try { setHealth(await adminCopyApi.health()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load engine health'); }
  }, []);
  useEffect(() => { void loadLeaders(); }, [loadLeaders]);
  useEffect(() => { void loadHealth(); }, [loadHealth]);
  usePoll(() => void loadHealth(), 30_000);

  async function act(l: AdminLeaderRow, action: AdminLeaderAction) {
    const copy: Record<AdminLeaderAction, { title: string; body: string; tone: 'default' | 'danger' }> = {
      approve: { title: `Approve ${l.displayName}?`, body: 'Their profile goes live on the leaderboard and people can start copying them.', tone: 'default' },
      reject: { title: `Reject ${l.displayName}'s application?`, body: 'The application is removed and they can apply again. They see the reason you give.', tone: 'danger' },
      pause: { title: `Pause ${l.displayName}?`, body: `New trades stop being copied to their ${l.followers} ${l.followers === 1 ? 'follower' : 'followers'}. Closes still copy. Everyone is notified.`, tone: 'danger' },
      resume: { title: `Resume ${l.displayName}?`, body: 'Their new trades are copied again. Followers are notified.', tone: 'default' },
      delist: { title: `Remove ${l.displayName}?`, body: `This can't be undone. All ${l.followers} live ${l.followers === 1 ? 'copy stops' : 'copies stop'} and open copies stay on followers' accounts for them to manage. Everyone is notified.`, tone: 'danger' },
    };
    const c = copy[action];
    const r = await ask({
      title: c.title,
      body: (
        <div className="cp-adm-confirm">
          <p>{c.body}</p>
          {action === 'approve' && <div className="x-inset"><b>Strategy</b><p>{l.bio || 'No write-up.'}</p><small>{l.user.email} · {l.connection.label} · ···{l.connection.keyLast4} · {l.tradeCount} trades recorded</small></div>}
        </div>
      ),
      confirmLabel: ACTION_LABEL[action],
      tone: c.tone,
      reason: action !== 'approve' && action !== 'resume',
      reasonRequired: action === 'reject' || action === 'delist',
      reasonLabel: 'Reason (the leader sees this)',
    });
    if (!r) return;
    setBusy(l.id);
    try {
      await adminCopyApi.act(l.id, action, r.reason);
      toast.success(`${ACTION_LABEL[action]}: ${l.displayName}`);
      await Promise.all([loadLeaders(), loadHealth()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That didn’t work');
    } finally {
      setBusy(null);
    }
  }

  async function toggleKill(k: KillSwitch) {
    const r = await ask(k.enabled
      ? { title: 'Turn copy trading back on?', body: 'Leaders’ new trades are copied again from now. Fills that arrived while it was off are not replayed.', confirmLabel: 'Turn back on' }
      : { title: 'Stop all copy trading?', body: 'Every copy, entries and exits, stops within seconds for every user until you turn it back on. Use it for outages or emergencies.', confirmLabel: 'Stop everything', tone: 'danger', reason: true, reasonRequired: true, reasonLabel: 'Reason (kept in the audit log)' });
    if (!r) return;
    setBusy('kill');
    try {
      await adminCopyApi.setKillSwitch(!k.enabled, r.reason);
      toast.success(k.enabled ? 'Copy trading is back on' : 'Copy trading stopped');
      await loadHealth();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That didn’t work');
    } finally {
      setBusy(null);
    }
  }

  const ks = health?.killSwitch;
  const pending = health?.leaders.PENDING ?? 0;

  return (
    <AppShell legacy={false} pageTitle="Copy trading admin" pageSubtitle="Leaders, kill switch, engine"
      actions={<button className="x-btn" onClick={() => { void loadLeaders(); void loadHealth(); }}><ISync size={14} />Refresh</button>}>
      <AdminOnly>
        <div className="x-page" data-testid="admin-copy-page">
          {ks && (
            <section className={`x-card cp-kill ${ks.enabled ? 'on' : ''}`} data-testid="admin-kill">
              <div>
                <b>{ks.enabled ? 'Copy trading is stopped for everyone' : 'Copy trading is running'}</b>
                <small>{ks.enabled ? `${ks.reason ?? 'No reason given'} · ${ks.by ?? 'unknown'} · ${ago(ks.at)}` : ks.at ? `Last turned on ${ago(ks.at)}${ks.by ? ` by ${ks.by}` : ''}` : 'The kill switch has never been used.'}</small>
              </div>
              <button className={`x-btn ${ks.enabled ? 'x-btn--hi' : 'x-btn--danger'}`} onClick={() => toggleKill(ks)} disabled={busy === 'kill'} data-testid="admin-kill-toggle">
                {ks.enabled ? 'Turn copy trading on' : 'Stop all copy trading'}
              </button>
            </section>
          )}

          <div className="x-tabs" role="tablist" aria-label="Copy trading admin">
            <button role="tab" aria-selected={tab === 'leaders'} onClick={() => setTab('leaders')} data-testid="admin-copy-tab-leaders">Leaders{pending > 0 && <span className="x-badge">{pending}</span>}</button>
            <button role="tab" aria-selected={tab === 'engine'} onClick={() => setTab('engine')} data-testid="admin-copy-tab-engine">Engine</button>
          </div>

          {error && <ErrorCard message={error} onRetry={() => { setError(null); void loadLeaders(); void loadHealth(); }} />}

          {tab === 'leaders' && (
            <section className="x-card" aria-label="Leaders">
              <div className="x-ch">
                <div className="x-seg x-seg--in" role="tablist" aria-label="Leader status">
                  {VIEWS.map(v => <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>{v.label}</button>)}
                </div>
              </div>
              {rows == null ? <div className="x-skel cp-skel-table" /> : rows.length === 0 ? (
                <p className="x-muted cp-pad" data-testid="admin-leaders-empty">{view === 'PENDING' ? 'No applications waiting.' : 'No leaders here.'}</p>
              ) : (
                <div className="x-tblwrap">
                  <table className="x-tbl cp-adm-tbl" data-testid="admin-leaders">
                    <thead><tr><th>Leader</th><th>Status</th><th>Account</th><th className="n">Followers</th><th className="n">Return 30d</th><th className="n">Max DD</th><th className="n">Equity</th><th>Last trade</th><th>Applied</th><th /></tr></thead>
                    <tbody>
                      {rows.map(l => (
                        <tr key={l.id} data-testid={`admin-leader-${l.id}`}>
                          <td>
                            <b className="cp-adm-name">{l.status === 'VERIFIED' || l.status === 'PAUSED' ? <Link href={`/copy/leaders/${l.id}`}>{l.displayName}</Link> : l.displayName}</b>
                            <small className="cp-adm-sub">{l.user.email}{!l.listed && ' · hidden'}</small>
                          </td>
                          <td><span className={`x-tag ${STATUS_TAG[l.status][1]}`}>{STATUS_TAG[l.status][0]}</span></td>
                          <td>
                            {venueName(l.connection.exchange)}{l.connection.environment === 'TESTNET' ? ' testnet' : ''}
                            <small className={`cp-adm-sub ${l.connection.status === 'ACTIVE' ? '' : 'neg'}`}>···{l.connection.keyLast4} · {l.connection.status === 'ACTIVE' ? 'key working' : 'key broken'}</small>
                          </td>
                          <td className="m n">{l.followers}</td>
                          <td className={`m n ${l.roi30dPct == null ? '' : l.roi30dPct >= 0 ? 'pos' : 'neg'}`}>{pct(l.roi30dPct, 1, true)}</td>
                          <td className="m n">{pct(l.maxDrawdownAllPct)}</td>
                          <td className="m n">{usd(l.equityUsd)}</td>
                          <td>{ago(l.lastTradeAt)}</td>
                          <td>{ago(l.createdAt)}</td>
                          <td className="cp-adm-acts">
                            {ACTIONS[l.status].map((a, i) => {
                              // Going live needs a working key; the API refuses it otherwise.
                              const keyBlocked = (a === 'approve' || a === 'resume') && l.connection.status !== 'ACTIVE';
                              return (
                                <button key={a} className={`x-btn x-btn--sm ${i === 0 && a !== 'pause' ? 'x-btn--hi' : a === 'delist' || a === 'reject' || a === 'pause' ? 'x-btn--ghost cp-del' : ''}`}
                                  onClick={() => act(l, a)} disabled={busy === l.id || keyBlocked} title={keyBlocked ? 'The leader needs to reconnect their exchange key first' : undefined}
                                  data-testid={`admin-leader-${a}-${l.id}`}>{ACTION_LABEL[a]}</button>
                              );
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'engine' && (health ? <EnginePanel h={health} /> : <div className="x-skel cp-skel-hero" />)}
        </div>
      </AdminOnly>
      {dialog}
    </AppShell>
  );
}

function EnginePanel({ h }: { h: EngineHealth }) {
  const d = h.last24h;
  return (
    <div className="x-page" data-testid="admin-engine">
      <section className="x-card">
        <div className="x-ch">
          <h2>Engine</h2>
          <span className={`x-tag ${h.engine.up ? 'x-tag--g' : 'x-tag--r'}`} data-testid="admin-engine-state"><i className={`x-dot ${h.engine.up ? '' : 'x-dot--r'}`} />{h.engine.up ? 'Running' : h.engine.lastBeatAt ? 'Not responding' : 'Never seen'}</span>
          <span className="x-sub">last heartbeat {ago(h.engine.lastBeatAt)}{h.engine.startedAt ? ` · up since ${ago(h.engine.startedAt)}` : ''}</span>
        </div>
        {!h.engine.up && <div className="x-banner x-banner--err cp-mb" role="alert">The engine hasn&rsquo;t checked in for over 3 minutes. Leaders&rsquo; trades are not being copied. Check the engine service on Railway.</div>}
        <div className="x-strip" style={{ ['--n' as string]: 4 }}>
          <div><span>Leader streams open</span><b className="m">{h.engine.liveWatchers ?? '—'} <small className="x-muted">of {h.watchedLeaders}</small></b></div>
          <div><span>Last leader fill</span><b>{ago(h.lastLeaderFillAt)}</b></div>
          <div><span>Broken keys in use</span><b className={`m ${h.brokenConnections ? 'neg' : ''}`}>{h.brokenConnections}</b></div>
          <div><span>Positions out of sync</span><b className={`m ${h.driftPositions ? 'neg' : ''}`}>{h.driftPositions}</b></div>
        </div>
      </section>

      <section className="x-card">
        <div className="x-ch"><h2>Last 24 hours</h2></div>
        <div className="x-strip" style={{ ['--n' as string]: 6 }}>
          <div><span>Copied</span><b className="m">{d.filled}</b></div>
          <div><span>Not copied</span><b className="m">{d.skipped}</b></div>
          <div><span>Rejected</span><b className={`m ${d.rejected ? 'neg' : ''}`}>{d.rejected}</b></div>
          <div><span>Median delay</span><b className="m">{ms(d.medianLatencyMs)}</b></div>
          <div><span>Slow 10%</span><b className="m">{ms(d.p90LatencyMs)}</b></div>
          <div><span>Avg slippage</span><b className="m">{d.meanAbsSlippageBps == null ? '—' : `${d.meanAbsSlippageBps} bps`}</b></div>
        </div>
        <div className="x-ch cp-ch-gap"><h3>Why copies didn&rsquo;t go through</h3></div>
        {d.topReasons.length === 0 ? <p className="x-muted cp-pad">Nothing skipped or rejected.</p> : (
          <ul className="cp-closes" data-testid="admin-engine-reasons">{d.topReasons.map(r => <li key={r.reason}><b className="m">{r.count}</b><span>{r.reason}</span></li>)}</ul>
        )}
      </section>

      <section className="x-card">
        <div className="x-ch"><h2>Totals</h2></div>
        <div className="x-strip" style={{ ['--n' as string]: 6 }}>
          <div><span>Leaders live</span><b className="m">{h.leaders.VERIFIED}</b></div>
          <div><span>In review</span><b className="m">{h.leaders.PENDING}</b></div>
          <div><span>Leaders paused</span><b className="m">{h.leaders.PAUSED}</b></div>
          <div><span>Copies running</span><b className="m">{h.follows.ACTIVE}</b></div>
          <div><span>Copies paused</span><b className="m">{h.follows.PAUSED}</b></div>
          <div><span>Copies stopped</span><b className="m">{h.follows.STOPPED}</b></div>
        </div>
      </section>
    </div>
  );
}
