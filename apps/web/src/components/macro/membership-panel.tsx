'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MacroMember, MacroMemberApplyInput } from '@/lib/macro-api';
import { macroApi } from '@/lib/macro-api';
import { ICheck } from '@/components/v6/macro/ui';

const EXCHANGES = ['DELTA', 'COINDCX'] as const;
const EXCHANGE_LABEL: Record<(typeof EXCHANGES)[number], string> = { DELTA: 'Delta', COINDCX: 'CoinDCX' };

const EXPLORER_PERKS = ['All macro dashboards', 'Regime + confluence engine', 'Calendar, news & education'];
const MEMBER_PERKS = ['Full SignalX signal levels', 'Entry / stop / targets + risk sizing', 'Paper blotter & rationale'];

function statusTag(status: MacroMember['status']): string {
  if (status === 'APPROVED') return 'x-tag x-tag--g';
  if (status === 'REJECTED') return 'x-tag x-tag--r';
  return 'x-tag';
}
const statusWord = (s: MacroMember['status']) => s.charAt(0) + s.slice(1).toLowerCase();

export default function MembershipPanel() {
  const [member, setMember] = useState<MacroMember | null | undefined>(undefined);
  const [exchange, setExchange] = useState<(typeof EXCHANGES)[number]>('DELTA');
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signalsNote, setSignalsNote] = useState('');

  // Admin queue — the probe 403s for non-admins, which hides the whole section.
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState<MacroMember[]>([]);
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const [adminError, setAdminError] = useState('');

  const loadPending = useCallback(async () => {
    const rows = await macroApi.adminMembers('PENDING');
    setIsAdmin(true);
    setPending(rows);
  }, []);

  useEffect(() => {
    macroApi
      .membership()
      .then(setMember)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load membership'));
    loadPending().catch(() => setIsAdmin(false)); // 403 → not an admin
  }, [loadPending]);

  async function decide(id: string, action: 'approve' | 'reject') {
    setAdminBusy(id);
    setAdminError('');
    try {
      if (action === 'approve') await macroApi.adminApprove(id);
      else await macroApi.adminReject(id);
      await loadPending();
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setAdminBusy(null);
    }
  }

  async function apply(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: MacroMemberApplyInput = { exchange, exchangeUid: uid };
      setMember(await macroApi.apply(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  }

  async function probeSignals() {
    setSignalsNote('');
    try {
      const rows = await macroApi.signals();
      setSignalsNote(`Access OK — ${rows.length} signal(s) live.`);
    } catch (err) {
      setSignalsNote(err instanceof Error ? err.message : 'Signals locked');
    }
  }

  const showForm = member === null || member?.status === 'REJECTED';

  if (member === undefined && !error) {
    return (
      <div className="mc-acc mc-stack" data-testid="macro-membership-loading" role="status" aria-label="Loading access">
        <div className="mc-2 mc-2--even"><div className="x-skel mc-sk-tier" /><div className="x-skel mc-sk-tier" /></div>
        <div className="x-skel mc-sk-acc" />
      </div>
    );
  }

  return (
    <div className="mc-acc mc-stack" data-testid="macro-membership">
      <div className="mc-2 mc-2--even">
        <section className="x-card mc-tier on">
          <div className="x-ch"><h2>Explorer</h2><span className="x-r"><span className="x-tag x-tag--g">Active · free</span></span></div>
          <ul>{EXPLORER_PERKS.map(p => <li key={p}><ICheck size={15} className="pos" />{p}</li>)}</ul>
        </section>
        <section className="x-card mc-tier">
          <div className="x-ch"><h2>SignalX member</h2><span className="x-r"><span className="x-tag">Verified</span></span></div>
          <ul>{MEMBER_PERKS.map(p => <li key={p}><ICheck size={15} className="x-dim" />{p}</li>)}</ul>
        </section>
      </div>

      <section className="x-card">
        <div className="x-ch"><h2>SignalX access</h2></div>
        <p className="x-muted mc-p">Free dashboards are open to every signed-in user. Signal levels stay gated on the server until your exchange mapping is approved (24–48h verification).</p>

        {member && (
          <div className="mc-status" data-testid="macro-membership-status">
            <span className={statusTag(member.status)}>{statusWord(member.status)}</span>
            <span className="m x-muted">{member.exchange} · {member.exchangeUid}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={apply} className="mc-form" data-testid="macro-apply-form">
            <div className="x-field">
              <span className="x-label" id="mc-ex-l">Exchange</span>
              <div className="x-seg" role="group" aria-labelledby="mc-ex-l">
                {EXCHANGES.map(x => (
                  <button key={x} type="button" onClick={() => setExchange(x)} aria-pressed={exchange === x} data-testid={`macro-apply-exchange-${x}`}>
                    {EXCHANGE_LABEL[x]}
                  </button>
                ))}
              </div>
            </div>
            <div className="x-field">
              <label htmlFor="mc-uid">Exchange user ID</label>
              <div className="mc-form-row">
                <input id="mc-uid" value={uid} onChange={e => setUid(e.target.value)} placeholder="e.g. 48213377" required maxLength={128}
                  className="x-input" data-testid="macro-apply-uid" />
                <button type="submit" disabled={busy || !uid.trim()} className="x-btn x-btn--hi" data-testid="macro-apply-submit">
                  {busy ? 'Submitting…' : member?.status === 'REJECTED' ? 'Re-apply' : 'Request access'}
                </button>
              </div>
            </div>
          </form>
        )}

        {member?.status === 'PENDING' && <p className="x-muted mc-p mc-mt">Your mapping is under review. You will be unlocked once it is verified.</p>}

        {member?.status === 'APPROVED' && (
          <button type="button" onClick={probeSignals} className="x-btn x-btn--hi mc-mt" data-testid="macro-signals-probe">Check signal access</button>
        )}

        {error && <div className="x-banner x-banner--err mc-mt" data-testid="macro-membership-error" role="alert"><span>{error}</span></div>}
        {signalsNote && <p className="x-muted mc-p mc-mt" data-testid="macro-signals-note">{signalsNote}</p>}
      </section>

      {isAdmin && (
        <section className="x-card" data-testid="macro-admin-queue">
          <div className="x-ch"><h2>Pending applications</h2><span className="x-sub">admin</span><span className="x-r m">{pending.length}</span></div>
          {pending.length === 0 ? <p className="x-muted mc-p">No pending applications.</p> : (
            <ul className="mc-adm x-list">
              {pending.map(m => (
                <li key={m.id} data-testid={`macro-admin-row-${m.id}`}>
                  <div><b>{m.exchange} · <span className="m">{m.exchangeUid}</span></b><small>Applied <span className="m">{new Date(m.createdAt).toLocaleString()}</span></small></div>
                  <div className="mc-btns">
                    <button type="button" disabled={adminBusy === m.id} onClick={() => decide(m.id, 'approve')} className="x-btn x-btn--sm x-btn--g" data-testid={`macro-admin-approve-${m.id}`}>
                      {adminBusy === m.id ? 'Saving…' : 'Approve'}
                    </button>
                    <button type="button" disabled={adminBusy === m.id} onClick={() => decide(m.id, 'reject')} className="x-btn x-btn--sm x-btn--danger" data-testid={`macro-admin-reject-${m.id}`}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {adminError && <div className="x-banner x-banner--err mc-mt" role="alert"><span>{adminError}</span></div>}
        </section>
      )}
    </div>
  );
}
