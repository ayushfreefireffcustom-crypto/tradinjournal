'use client';

import { useState } from 'react';
import type { AdminUserFilter, AdminUserRowDto } from '@/lib/admin-api';
import { fmtRelative, statusTone, toneClass } from './admin-utils';
import { UserDrawer } from './user-drawer';
import { CaretDown, CaretUp } from '@phosphor-icons/react';

const FILTERS: { id: AdminUserFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'elefin', label: 'ELEFIN' },
  { id: 'grant', label: 'GRANT' },
  { id: 'inactive', label: 'INACTIVE' },
  { id: 'no_broker', label: 'NO BROKER' },
  { id: 'active_today', label: 'ACTIVE TODAY' },
];

function Badge({ tone, children }: { tone: keyof typeof toneClass; children: React.ReactNode }) {
  return (
    <span className={`inline-flex text-[9px] tracking-widest px-2 py-0.5 border rounded ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

function UserCard({
  user,
  onOpen,
}: {
  user: AdminUserRowDto;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border-soft rounded p-3 bg-surface/30 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            {user.activeToday && <span className="w-2 h-2 rounded-full bg-profit pulse-dot shrink-0" />}
            <span className="text-sm text-fg font-medium truncate">{user.name || 'Unnamed'}</span>
          </div>
          <div className="text-[11px] text-fg-2 truncate mt-0.5">{user.email}</div>
        </button>
        <button type="button" onClick={() => setOpen(o => !o)} className="p-1 text-fg-3" aria-label="Toggle">
          {open ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <Badge tone={statusTone('elefin', user.elefinStatus)}>{user.elefinStatus}</Badge>
        <Badge tone={statusTone('activity', user.activityStatus)}>{user.activityStatus}</Badge>
        <Badge tone="neutral">{user.usageMinToday}m today</Badge>
        <Badge tone={user.tradeCount7d >= 2 ? 'profit' : 'warning'}>{user.tradeCount7d} trades/7d</Badge>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-border-soft grid grid-cols-2 gap-2 text-[10px]">
          <div><span className="text-fg-3">Brokers</span><div className="text-fg">{user.brokerCount} · {user.brokers.join(', ') || '—'}</div></div>
          <div><span className="text-fg-3">Usage 7d</span><div className="text-fg numeric">{user.avgSessionMin7d}m</div></div>
          <div><span className="text-fg-3">Last seen</span><div className="text-fg">{fmtRelative(user.lastActiveAt)}</div></div>
          <div><span className="text-fg-3">Feature</span><div className="text-fg">{user.topFeature ?? '—'}</div></div>
        </div>
      )}
      <button type="button" onClick={onOpen} className="mt-3 w-full text-[10px] tracking-widest text-fg-3 hover:text-fg border border-border-soft rounded py-2">
        OPEN DOSSIER
      </button>
    </div>
  );
}

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
    <div className="tcard p-4 sm:p-5 min-w-0" data-testid="admin-users">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Users directory</div>
            <div className="text-sm text-fg-2 mt-1">{total} total · page {page}/{totalPages}</div>
          </div>
          <form onSubmit={onSearchSubmit} className="flex gap-2 w-full sm:w-auto sm:min-w-[280px]">
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search email or name…"
              className="flex-1 min-w-0 bg-app border border-border-soft rounded px-3 py-2 text-sm"
            />
            <button type="submit" className="btn btn-ghost border border-border-soft px-3 text-[11px] shrink-0">
              SEARCH
            </button>
          </form>
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`shrink-0 px-2.5 py-1.5 text-[9px] tracking-widest rounded border ${
                filter === f.id ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-fg-3 text-sm">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-fg-3 text-sm">No users found.</div>
      ) : (
        <>
          <div className="lg:hidden space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {users.map(u => (
              <UserCard key={u.id} user={u} onOpen={() => setDrawerId(u.id)} />
            ))}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-[11px] min-w-[980px]">
              <thead>
                <tr className="text-fg-3 text-left border-b border-border-soft">
                  {['USER', 'ELEFIN', 'ACTIVITY', 'USAGE', 'TRADES', 'BROKERS', 'LAST SEEN', ''].map(h => (
                    <th key={h || 'a'} className="py-2 pr-2 font-normal tracking-widest text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.id}
                    className="border-b border-border-soft/50 hover:bg-surface/20 align-top cursor-pointer"
                    onClick={() => setDrawerId(u.id)}
                  >
                    <td className="py-2.5 pr-2 min-w-[160px]">
                      <div className="flex items-center gap-1.5">
                        {u.activeToday && <span className="w-1.5 h-1.5 rounded-full bg-profit shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-fg truncate">{u.name}</div>
                          <div className="text-fg-3 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-2"><Badge tone={statusTone('elefin', u.elefinStatus)}>{u.elefinStatus}</Badge></td>
                    <td className="py-2.5 pr-2"><Badge tone={statusTone('activity', u.activityStatus)}>{u.activityStatus}</Badge></td>
                    <td className="py-2.5 pr-2 numeric whitespace-nowrap">
                      <div>{u.usageMinToday}m today</div>
                      <div className="text-fg-3">{u.avgSessionMin7d}m / 7d</div>
                    </td>
                    <td className="py-2.5 pr-2 numeric whitespace-nowrap">
                      <div>{u.tradeCount7d}/7d</div>
                      <div className="text-fg-3">{u.totalTrades} tot</div>
                    </td>
                    <td className="py-2.5 pr-2 max-w-[120px]">
                      <div className="numeric">{u.brokerCount}</div>
                      <div className="text-fg-3 truncate">{u.brokers.join(', ') || '—'}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-fg-3 whitespace-nowrap">{fmtRelative(u.lastActiveAt)}</td>
                    <td className="py-2.5 text-right text-[10px] text-fg-3">VIEW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-border-soft">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="btn btn-ghost border border-border-soft px-3 py-1.5 text-[10px] disabled:opacity-40">PREV</button>
          <span className="text-[11px] text-fg-3 numeric px-2">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="btn btn-ghost border border-border-soft px-3 py-1.5 text-[10px] disabled:opacity-40">NEXT</button>
        </div>
      )}

      {drawerId && (
        <UserDrawer
          userId={drawerId}
          onClose={() => setDrawerId(null)}
          onRecheck={onRecheck}
          recheckBusy={actionBusy === `user-${drawerId}`}
        />
      )}
    </div>
  );
}
