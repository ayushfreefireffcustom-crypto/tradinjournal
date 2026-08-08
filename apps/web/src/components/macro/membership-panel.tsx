'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MacroMember, MacroMemberApplyInput } from '@/lib/macro-api';
import { macroApi } from '@/lib/macro-api';

const EXCHANGES = ['DELTA', 'COINDCX'] as const;

const EXPLORER_PERKS = ['All macro dashboards', 'Regime + confluence engine', 'Calendar, news & education'];
const MEMBER_PERKS = ['Full TradeAI signal levels', 'Entry / stop / targets + risk sizing', 'Paper blotter & rationale'];

function statusBadge(status: MacroMember['status']): string {
  if (status === 'APPROVED') return 'text-profit border-profit/30 bg-profit/10';
  if (status === 'REJECTED') return 'text-loss border-loss/30 bg-loss/10';
  return 'text-warning border-warning/30 bg-warning/10';
}

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

  return (
    <div className="space-y-3 max-w-3xl mx-auto" data-testid="macro-membership">
      {/* Tier comparison */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="tcard p-4 border-profit/25">
          <div className="flex items-center justify-between">
            <span className="text-[11px] tracking-[0.16em] text-fg">EXPLORER</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-profit/30 bg-profit/10 text-profit">
              ACTIVE · FREE
            </span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {EXPLORER_PERKS.map(p => (
              <li key={p} className="text-[12px] text-fg-2 flex gap-2">
                <span className="text-profit">✓</span> {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="tcard p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] tracking-[0.16em] text-fg">TRADEAI MEMBER</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-fg-3">VERIFIED</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {MEMBER_PERKS.map(p => (
              <li key={p} className="text-[12px] text-fg-2 flex gap-2">
                <span className="text-fg-3">◆</span> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Access / status */}
      <div className="tcard p-4">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// TRADEAI ACCESS</div>
        <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">
          Free dashboards are open to every signed-in user. Signal levels stay <span className="text-fg-2">server-gated</span>{' '}
          until your exchange mapping is approved (24–48h verification).
        </p>

        {member === undefined && !error && <p className="text-[12px] text-fg-3 mt-3">Loading membership…</p>}

        {member && (
          <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid="macro-membership-status">
            <span className={`text-[10px] tracking-[0.14em] px-2 py-0.5 rounded border ${statusBadge(member.status)}`}>
              {member.status}
            </span>
            <span className="text-[12px] text-fg-3 numeric">{member.exchange} · {member.exchangeUid}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={apply} className="mt-4 space-y-3" data-testid="macro-apply-form">
            <div>
              <div className="text-[10px] tracking-[0.14em] text-fg-3 mb-1.5">EXCHANGE</div>
              <div className="flex gap-2">
                {EXCHANGES.map(x => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setExchange(x)}
                    data-testid={`macro-apply-exchange-${x}`}
                    className={`px-3 py-1.5 text-[11px] tracking-[0.12em] rounded-[var(--radius-btn)] border transition-colors ${
                      exchange === x
                        ? 'border-profit/40 bg-profit/10 text-profit'
                        : 'border-border text-fg-3 hover:text-fg'
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={uid}
                onChange={e => setUid(e.target.value)}
                placeholder="Exchange User ID"
                required
                maxLength={128}
                className="flex-1 bg-surface border border-border rounded-[var(--radius-btn)] px-3 py-2 text-sm focus-ring"
                data-testid="macro-apply-uid"
              />
              <button
                type="submit"
                disabled={busy || !uid.trim()}
                className="btn px-4 py-2 text-[11px] tracking-[0.12em] uppercase bg-profit/15 text-profit border border-profit/30 disabled:opacity-40"
                data-testid="macro-apply-submit"
              >
                {busy ? 'Submitting…' : member?.status === 'REJECTED' ? 'Re-apply' : 'Request access'}
              </button>
            </div>
          </form>
        )}

        {member?.status === 'PENDING' && (
          <p className="mt-3 text-[12px] text-fg-3">Your mapping is under review — you’ll be unlocked once verified.</p>
        )}

        {member?.status === 'APPROVED' && (
          <button
            type="button"
            onClick={probeSignals}
            className="mt-3 text-[11px] tracking-[0.12em] uppercase text-profit hover:underline"
            data-testid="macro-signals-probe"
          >
            Check signal access →
          </button>
        )}

        {error && <p className="text-loss text-[12px] mt-2" data-testid="macro-membership-error">{error}</p>}
        {signalsNote && <p className="text-fg-3 text-[12px] mt-2" data-testid="macro-signals-note">{signalsNote}</p>}
      </div>
    </div>
  );
}
