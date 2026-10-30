'use client';

import type { AccessGrantDto } from '@/lib/admin-api';
import { fmtDate, fmtRelative } from './admin-utils';

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

export function AdminGrantsSection(props: Props) {
  const { grants, grantEmail, grantNote, grantBusy, actionBusy } = props;
  const activeCount = grants.filter(g => !g.revokedAt).length;

  return (
    <section className="x-card" data-testid="admin-grants">
      <div className="x-ch"><h2>Manual access grants</h2><span className="x-sub"><span className="m">{activeCount}</span> active</span></div>

      <form onSubmit={props.onSubmit} className="ad-grant-form">
        <div className="x-field">
          <label htmlFor="ad-grant-email">Email</label>
          <input id="ad-grant-email" className="x-input" type="email" required value={grantEmail} onChange={e => props.onEmailChange(e.target.value)} placeholder="email@example.com" />
        </div>
        <div className="x-field">
          <label htmlFor="ad-grant-note">Reason</label>
          <input id="ad-grant-note" className="x-input" required value={grantNote} onChange={e => props.onNoteChange(e.target.value)} placeholder="Why access was granted" />
        </div>
        <button type="submit" disabled={grantBusy} className="x-btn x-btn--hi">{grantBusy ? 'Granting…' : 'Grant access'}</button>
      </form>

      {grants.length === 0 ? (
        <div className="x-empty"><p>No grants yet.</p></div>
      ) : (
        <div className="x-tblwrap ad-scroll">
          <table className="x-tbl ad-tbl ad-grants">
            <thead><tr><th>Email</th><th>Reason</th><th>Granted by</th><th>Date</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id}>
                  <td className="ad-ell">{g.email}</td>
                  <td className="ad-note-cell"><span>{g.note}</span></td>
                  <td className="x-muted">{g.grantedByEmail}</td>
                  <td className="x-muted">{fmtDate(g.createdAt)}</td>
                  <td>{g.revokedAt ? <span className="x-tag x-tag--r" title={`Revoked ${fmtRelative(g.revokedAt)}`}>Revoked</span> : <span className="x-tag x-tag--g">Active</span>}</td>
                  <td className="n">
                    {!g.revokedAt && (
                      <button type="button" onClick={() => props.onRevoke(g.id)} disabled={actionBusy === g.id} className="x-btn x-btn--sm x-btn--ghost ad-revoke">
                        {actionBusy === g.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
