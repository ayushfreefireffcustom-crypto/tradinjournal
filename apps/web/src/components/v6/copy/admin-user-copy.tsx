'use client';

// Copy trading in the admin user drawer (C5.3): the user's exchange accounts
// (status only, never keys), their leader profile, their copies, and a "stop
// copying" action that tells the user why.
import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import { adminCopyApi, signedUsd, sizingLabel, venueName, type AdminUserCopy, type Follow } from '@/lib/copy-api';
import { ago } from './parts';

export default function AdminUserCopySection({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserCopy | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, ask] = useConfirm();
  const load = useCallback(() => adminCopyApi.user(userId).then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed')), [userId]);
  useEffect(() => { void load(); }, [load]);

  async function stop(f: Follow) {
    const r = await ask({ title: `Stop copying ${f.leader.displayName}?`, body: 'Copying stops now. Open copies stay on their exchange account. The user is notified with your reason.', confirmLabel: 'Stop copying', tone: 'danger', reason: true, reasonRequired: true, reasonLabel: 'Reason (the user sees this)' });
    if (!r?.reason) return;
    setBusy(f.id);
    try { await adminCopyApi.stopFollow(f.id, r.reason); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not stop'); }
    finally { setBusy(null); }
  }

  return (
    <div className="ad-dos-sec" data-testid="admin-user-copy">
      <span className="x-label">Copy trading</span>
      {error && <div className="x-banner x-banner--err"><span>{error}</span></div>}
      {!data ? <i className="x-skel x-skel--in" /> : (
        <>
          {data.connections.length === 0 ? <p className="ad-none">No exchange accounts</p> : data.connections.map(c => (
            <div key={c.id} className="x-inset ad-dos-box">
              <div className="ad-dos-row"><b>{c.label}</b><span className={`x-tag ${c.status === 'ACTIVE' ? 'x-tag--g' : 'x-tag--r'}`}>{c.status === 'ACTIVE' ? 'Working' : c.status === 'REVOKED' ? 'Removed' : 'Key broken'}</span></div>
              <small>{venueName(c.exchange)} {c.environment === 'TESTNET' ? 'testnet' : 'live'} · ···{c.keyLast4} · added {ago(c.createdAt)}</small>
              {c.lastError && c.status !== 'ACTIVE' && <small className="neg">{c.lastError}</small>}
            </div>
          ))}
          {data.leader && <p className="ad-note">Leader profile <b>{data.leader.displayName}</b> · {data.leader.status.toLowerCase()}</p>}
          {data.follows.map(f => (
            <div key={f.id} className="x-inset ad-dos-box" data-testid={`admin-user-follow-${f.id}`}>
              <div className="ad-dos-row"><b>Copies {f.leader.displayName}</b><span className={`x-tag ${f.status === 'ACTIVE' ? 'x-tag--g' : f.status === 'PAUSED' ? 'x-tag--r' : ''}`}>{f.status.toLowerCase()}</span></div>
              <small>{sizingLabel(f.sizingMode, f.sizingValue)} · on {f.connection.label}</small>
              <small>Realized <span className="m">{signedUsd(f.realizedPnlUsd)}</span> · open <span className="m">{signedUsd(f.unrealizedPnlUsd)}</span> · {f.copiedOrders} copied</small>
              {f.status !== 'STOPPED' && <button className="x-btn x-btn--sm x-btn--danger" onClick={() => stop(f)} disabled={busy === f.id} data-testid={`admin-user-stop-${f.id}`}>Stop copying</button>}
            </div>
          ))}
        </>
      )}
      {dialog}
    </div>
  );
}
