'use client';

import type { AccessGrantDto } from '@/lib/admin-api';
import { fmtDate, fmtRelative, toneClass } from './admin-utils';
import { Ticket, XCircle } from '@phosphor-icons/react';

interface Props {
  grants: AccessGrantDto[];
  grantEmail: string;
  grantNote: string;
  grantBusy: boolean;
  actionBusy: string | null;
  onEmailChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRevoke: (id: string) => void;
}

function GrantCard({
  grant, busy, onRevoke,
}: { grant: AccessGrantDto; busy: boolean; onRevoke: () => void }) {
  const active = !grant.revokedAt;
  return (
    <div className="border border-border-soft rounded p-3 bg-surface/40 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-fg font-medium truncate">{grant.email}</div>
          <p className="text-[11px] text-fg-2 mt-1 break-words">{grant.note}</p>
        </div>
        <span className={`shrink-0 text-[9px] tracking-widest px-2 py-0.5 border rounded ${active ? toneClass.profit : toneClass.loss}`}>
          {active ? 'ACTIVE' : 'REVOKED'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg-3">
        <span>By {grant.grantedByEmail}</span>
        <span>·</span>
        <span>{fmtDate(grant.createdAt)}</span>
        {grant.revokedAt && (
          <>
            <span>·</span>
            <span>Revoked {fmtRelative(grant.revokedAt)}</span>
          </>
        )}
      </div>
      {active && (
        <button
          type="button"
          onClick={onRevoke}
          disabled={busy}
          className="mt-3 text-[10px] tracking-widest text-loss hover:underline flex items-center gap-1"
        >
          <XCircle size={12} />
          {busy ? 'REVOKING…' : 'REVOKE ACCESS'}
        </button>
      )}
    </div>
  );
}

export function AdminGrantsSection(props: Props) {
  const { grants, grantEmail, grantNote, grantBusy, actionBusy } = props;
  const activeCount = grants.filter(g => !g.revokedAt).length;

  return (
    <div className="tcard p-4 sm:p-5 min-w-0" data-testid="admin-grants">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Ticket size={16} className="text-fg-3 shrink-0" />
          <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase truncate">
            Manual access grants
          </div>
        </div>
        <span className="text-[10px] numeric text-fg-3 shrink-0">{activeCount} active</span>
      </div>

      <form onSubmit={props.onSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4">
        <input
          type="email"
          required
          value={grantEmail}
          onChange={e => props.onEmailChange(e.target.value)}
          placeholder="email@example.com"
          className="bg-app border border-border-soft rounded px-3 py-2.5 text-sm min-w-0"
        />
        <input
          required
          value={grantNote}
          onChange={e => props.onNoteChange(e.target.value)}
          placeholder="Why access was granted"
          className="bg-app border border-border-soft rounded px-3 py-2.5 text-sm min-w-0"
        />
        <button type="submit" disabled={grantBusy} className="btn btn-primary py-2.5 text-[11px] sm:px-6">
          {grantBusy ? '…' : 'GRANT'}
        </button>
      </form>

      {/* Mobile: cards */}
      <div className="lg:hidden space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {grants.length === 0 ? (
          <p className="text-sm text-fg-3 py-4 text-center">No grants yet.</p>
        ) : (
          grants.map(g => (
            <GrantCard
              key={g.id}
              grant={g}
              busy={actionBusy === g.id}
              onRevoke={() => props.onRevoke(g.id)}
            />
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-fg-3 text-left border-b border-border-soft">
              <th className="py-2 pr-3 font-normal tracking-widest text-[10px]">EMAIL</th>
              <th className="py-2 pr-3 font-normal tracking-widest text-[10px]">NOTE</th>
              <th className="py-2 pr-3 font-normal tracking-widest text-[10px]">GRANTED BY</th>
              <th className="py-2 pr-3 font-normal tracking-widest text-[10px]">DATE</th>
              <th className="py-2 pr-3 font-normal tracking-widest text-[10px]">STATUS</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {grants.map(g => (
              <tr key={g.id} className="border-b border-border-soft/50 hover:bg-surface/30">
                <td className="py-2.5 pr-3 text-fg max-w-[180px] truncate">{g.email}</td>
                <td className="py-2.5 pr-3 text-fg-2 max-w-[220px]">
                  <span className="line-clamp-2">{g.note}</span>
                </td>
                <td className="py-2.5 pr-3 text-fg-3">{g.grantedByEmail}</td>
                <td className="py-2.5 pr-3 text-fg-3 whitespace-nowrap">{fmtDate(g.createdAt)}</td>
                <td className="py-2.5 pr-3">
                  <span className={`text-[9px] tracking-widest px-2 py-0.5 border rounded ${g.revokedAt ? toneClass.loss : toneClass.profit}`}>
                    {g.revokedAt ? 'REVOKED' : 'ACTIVE'}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  {!g.revokedAt && (
                    <button
                      type="button"
                      onClick={() => props.onRevoke(g.id)}
                      disabled={actionBusy === g.id}
                      className="text-[10px] text-loss hover:underline"
                    >
                      REVOKE
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
