'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MacroMember, MacroMemberApplyInput } from '@/lib/macro-api';
import { macroApi } from '@/lib/macro-api';

const EXCHANGES = ['DELTA', 'COINDCX'] as const;

export default function MembershipPanel() {
  const [member, setMember] = useState<MacroMember | null | undefined>(undefined);
  const [exchange, setExchange] = useState<(typeof EXCHANGES)[number]>('DELTA');
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signalsNote, setSignalsNote] = useState('');

  useEffect(() => {
    macroApi
      .membership()
      .then(setMember)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load membership'));
  }, []);

  async function apply(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: MacroMemberApplyInput = { exchange, exchangeUid: uid };
      const row = await macroApi.apply(body);
      setMember(row);
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
      setSignalsNote(`Access OK — ${rows.length} signal(s) (P5 will fill levels).`);
    } catch (err) {
      setSignalsNote(err instanceof Error ? err.message : 'Signals locked');
    }
  }

  return (
    <div className="tcard p-4" data-testid="macro-membership">
      <div className="text-[10px] tracking-[0.2em] text-fg-3">// TRADEAI ACCESS</div>
      <p className="text-sm text-fg-3 mt-2">
        Free dashboards are open to every signed-in user. Signal levels stay server-gated until your
        exchange mapping is approved.
      </p>

      {member === undefined && <p className="text-[12px] text-fg-3 mt-3">Loading membership…</p>}

      {member && (
        <div className="mt-3 text-[12px]" data-testid="macro-membership-status">
          Status:{' '}
          <span className="text-fg font-medium">{member.status}</span>
          <span className="text-fg-3"> · {member.exchange} · {member.exchangeUid}</span>
        </div>
      )}

      {member === null && (
        <form onSubmit={apply} className="mt-3 flex flex-col sm:flex-row gap-2">
          <select
            value={exchange}
            onChange={e => setExchange(e.target.value as (typeof EXCHANGES)[number])}
            className="bg-surface border border-border rounded-[var(--radius-btn)] px-2 py-1.5 text-sm"
            data-testid="macro-apply-exchange"
          >
            {EXCHANGES.map(x => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <input
            value={uid}
            onChange={e => setUid(e.target.value)}
            placeholder="Exchange User ID"
            required
            maxLength={128}
            className="flex-1 bg-surface border border-border rounded-[var(--radius-btn)] px-2 py-1.5 text-sm"
            data-testid="macro-apply-uid"
          />
          <button
            type="submit"
            disabled={busy || !uid.trim()}
            className="btn px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase bg-profit/15 text-profit border border-profit/30 disabled:opacity-40"
            data-testid="macro-apply-submit"
          >
            {busy ? 'Submitting…' : 'Request access'}
          </button>
        </form>
      )}

      {member?.status === 'REJECTED' && (
        <form onSubmit={apply} className="mt-3 flex flex-col sm:flex-row gap-2">
          <select
            value={exchange}
            onChange={e => setExchange(e.target.value as (typeof EXCHANGES)[number])}
            className="bg-surface border border-border rounded-[var(--radius-btn)] px-2 py-1.5 text-sm"
          >
            {EXCHANGES.map(x => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <input
            value={uid}
            onChange={e => setUid(e.target.value)}
            placeholder="Corrected Exchange User ID"
            required
            maxLength={128}
            className="flex-1 bg-surface border border-border rounded-[var(--radius-btn)] px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !uid.trim()}
            className="btn px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase border border-border"
          >
            Re-apply
          </button>
        </form>
      )}

      {member?.status === 'APPROVED' && (
        <button
          type="button"
          onClick={probeSignals}
          className="mt-3 text-[11px] tracking-[0.12em] uppercase text-profit hover:underline"
          data-testid="macro-signals-probe"
        >
          Check signal access
        </button>
      )}

      {error && <p className="text-loss text-[12px] mt-2" data-testid="macro-membership-error">{error}</p>}
      {signalsNote && <p className="text-fg-3 text-[12px] mt-2" data-testid="macro-signals-note">{signalsNote}</p>}
    </div>
  );
}
