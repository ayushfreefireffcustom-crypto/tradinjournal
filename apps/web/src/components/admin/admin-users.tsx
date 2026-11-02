'use client';

import { useState } from 'react';
import type { AdminUserFilter, AdminUserRowDto } from '@/lib/admin-api';
import { fmtRelative, sentence, statusTone, tagClass } from './admin-utils';
import { UserDrawer } from './user-drawer';
import { ISearch } from '@/components/v6/icons';

const FILTERS: { id: AdminUserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'elefin', label: 'Elefin' },
  { id: 'grant', label: 'Grant' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'no_broker', label: 'No broker' },
  { id: 'active_today', label: 'Active today' },
];

interface Props {
  users: AdminUserRowDto[];
  total: number;
  page: number;
  limit: number;
  search: string;
  filter: AdminUserFilter;
  loading: boolean;
  actionBusy: string | null;
  onSearchChange: (v: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onFilterChange: (f: AdminUserFilter) => void;
  onPageChange: (page: number) => void;
  onRecheck: (id: string) => void;
}

export function AdminUsersSection({
  users, total, page, limit, search, filter, loading, actionBusy,
  onSearchChange, onSearchSubmit, onFilterChange, onPageChange, onRecheck,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const [drawerId, setDrawerId] = useState<string | null>(null);

  return (
    <section className="x-card" data-testid="admin-users">
      <div className="x-ch">
        <h2>Users</h2><span className="x-sub"><span className="m">{total}</span> total</span>
      </div>
      <div className="ad-toolbar">
        <form onSubmit={onSearchSubmit} className="ad-search">
          <label className="x-search">
            <ISearch size={15} />
            <input className="x-input" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search email or name" aria-label="Search users" />
          </label>
          <button type="submit" className="x-btn">Search</button>
        </form>
        <div className="x-seg x-seg--sm" role="group" aria-label="Filter users">
          {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilterChange(f.id)}>{f.label}</button>)}
        </div>
      </div>

      {loading ? (
        <div className="ad-tbl-sk">{[0, 1, 2, 3, 4].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
      ) : users.length === 0 ? (
        <div className="x-empty"><p>No users match this search or filter.</p></div>
      ) : (
        <div className="x-tblwrap ad-scroll">
          <table className="x-tbl ad-tbl ad-users">
            <thead>
              <tr><th>User</th><th>Elefin</th><th>Activity</th><th className="n">Usage today</th><th className="n">Trades, 7d</th><th>Brokers</th><th>Last seen</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="x-click" tabIndex={0} onClick={() => setDrawerId(u.id)} onKeyDown={e => { if (e.key === 'Enter') setDrawerId(u.id); }}>
                  <td>
                    <div className="ad-who">
                      <i className={`x-dot ${u.activeToday ? '' : 'x-dot--off'}`} title={u.activeToday ? 'Active today' : undefined} />
                      <span><b>{u.name || 'Unnamed'}</b><small>{u.email}</small></span>
                    </div>
                  </td>
                  <td><span className={tagClass[statusTone('elefin', u.elefinStatus)]}>{sentence(u.elefinStatus)}</span></td>
                  <td><span className={tagClass[statusTone('activity', u.activityStatus)]}>{sentence(u.activityStatus)}</span></td>
                  <td className="n m">{u.usageMinToday}m<small className="ad-sub">{u.avgSessionMin7d}m / 7d</small></td>
                  <td className={`n m ${u.tradeCount7d >= 2 ? '' : 'x-muted'}`}>{u.tradeCount7d}<small className="ad-sub">{u.totalTrades} total</small></td>
                  <td className="ad-brk"><span className="m">{u.brokerCount}</span><small className="ad-sub">{u.brokers.join(', ') || '—'}</small></td>
                  <td className="x-muted">{fmtRelative(u.lastActiveAt)}</td>
                  <td className="n"><span className="ad-chev" aria-hidden>›</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="ad-pager">
          <span>Page <span className="m">{page}</span> of <span className="m">{totalPages}</span></span>
          <div>
            <button type="button" className="x-btn x-btn--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
            <button type="button" className="x-btn x-btn--sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
          </div>
        </div>
      )}

      {drawerId && (
        <UserDrawer userId={drawerId} onClose={() => setDrawerId(null)} onRecheck={onRecheck} recheckBusy={actionBusy === `user-${drawerId}`} />
      )}
    </section>
  );
}
