'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { LoadingScreen } from '@/components/loader';
import {
  adminApi,
  type AdminOverviewDto,
  type AdminEngagementDto,
  type AccessGrantDto,
  type AdminUsersResponse,
  type AdminUserFilter,
  type AdminAuditItemDto,
} from '@/lib/admin-api';
import { AdminTabs, type AdminTab } from '@/components/admin/admin-tabs';
import { CommandOverview } from '@/components/admin/command-overview';
import { AdminMaintenancePanel } from '@/components/admin/admin-maintenance';
import { AdminGrantsSection } from '@/components/admin/admin-grants';
import { AdminUsersSection } from '@/components/admin/admin-users';
import { ArrowsClockwise, ShieldWarning } from '@phosphor-icons/react';
import { fmtRelative } from '@/components/admin/admin-utils';

export default function AdminPage() {
  const router = useRouter();
  const { accounts, selected, select } = useAccounts();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [engagement, setEngagement] = useState<AdminEngagementDto | null>(null);
  const [grants, setGrants] = useState<AccessGrantDto[]>([]);
  const [users, setUsers] = useState<AdminUsersResponse | null>(null);
  const [audit, setAudit] = useState<AdminAuditItemDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [maintBusy, setMaintBusy] = useState(false);
  const [maintMessage, setMaintMessage] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [userFilter, setUserFilter] = useState<AdminUserFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadUsers = useCallback(async (page: number, q: string, filter: AdminUserFilter) => {
    setUsersLoading(true);
    try {
      const us = await adminApi.users(page, 20, q || undefined, filter);
      setUsers(us);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'FORBIDDEN') router.replace('/dashboard');
      else setError(err.message);
    } finally {
      setUsersLoading(false);
    }
  }, [router]);

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [ov, eng, gr, au] = await Promise.all([
        adminApi.overview(),
        adminApi.engagement('14d'),
        adminApi.grants(),
        adminApi.audit(1, 40),
      ]);
      setOverview(ov);
      setEngagement(eng);
      setGrants(gr);
      setAudit(au.items);
      setMaintMessage(ov.maintenance.message ?? '');
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'FORBIDDEN') router.replace('/dashboard');
      else setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => { void loadCore(); }, [loadCore]);

  useEffect(() => {
    if (!loading) void loadUsers(userPage, userSearch, userFilter);
  }, [userPage, userSearch, userFilter, loading, loadUsers]);

  async function addGrant(e: React.FormEvent) {
    e.preventDefault();
    setGrantBusy(true);
    setError('');
    try {
      await adminApi.createGrant({ email: grantEmail.trim(), note: grantNote.trim() });
      setGrantEmail('');
      setGrantNote('');
      await loadCore(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create grant');
    } finally {
      setGrantBusy(false);
    }
  }

  async function toggleMaintenance() {
    if (!overview) return;
    setMaintBusy(true);
    setError('');
    try {
      const next = !overview.maintenance.enabled;
      const result = await adminApi.setMaintenance({
        enabled: next,
        message: maintMessage.trim() || undefined,
      });
      setOverview({ ...overview, maintenance: result });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Maintenance toggle failed');
    } finally {
      setMaintBusy(false);
    }
  }

  async function revokeGrant(id: string) {
    setActionBusy(id);
    try {
      await adminApi.revokeGrant(id);
      await loadCore(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setActionBusy(null);
    }
  }

  async function recheckUser(id: string) {
    setActionBusy(`user-${id}`);
    try {
      await adminApi.recheckUser(id);
      await loadUsers(userPage, userSearch, userFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recheck failed');
    } finally {
      setActionBusy(null);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUserSearch(searchInput.trim());
    setUserPage(1);
  }

  function handleFilterChange(f: AdminUserFilter) {
    setUserFilter(f);
    setUserPage(1);
  }

  const pendingElefin = overview?.elefinPending ?? 0;
  const inactiveCount = overview?.inactiveTraders ?? 0;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Admin" pageTitle="Command center">
      {loading ? (
        <LoadingScreen label="Loading command center" />
      ) : (
        <div
          className="w-full max-w-[1440px] mx-auto p-3 sm:p-4 lg:p-5 space-y-4 min-w-0 overflow-x-hidden"
          data-testid="admin-page"
        >
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display font-black text-xl sm:text-2xl tracking-tight text-fg truncate">
                Ops command center
              </h1>
              <p className="text-[11px] sm:text-[12px] text-fg-2 mt-1">
                Usage, access, brokers, and platform health — built for leadership visibility.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCore(true)}
              disabled={refreshing}
              className="btn btn-ghost border border-border-soft px-3 py-2 text-[10px] tracking-widest shrink-0 flex items-center gap-1.5"
            >
              <ArrowsClockwise size={14} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">REFRESH</span>
            </button>
          </div>

          {error && (
            <div className="tcard p-3 text-loss text-sm border border-loss/30 bg-loss/5" role="alert">
              {error}
            </div>
          )}

          <AdminTabs tab={tab} onChange={setTab} />

          {overview && tab === 'overview' && (
            <CommandOverview
              overview={overview}
              engagement={engagement}
              onToggleMaint={() => void toggleMaintenance()}
              maintBusy={maintBusy}
            />
          )}

          {tab === 'users' && users && (
            <AdminUsersSection
              users={users.users}
              total={users.total}
              page={userPage}
              limit={users.limit}
              search={searchInput}
              filter={userFilter}
              loading={usersLoading}
              actionBusy={actionBusy}
              onSearchChange={setSearchInput}
              onSearchSubmit={handleSearchSubmit}
              onFilterChange={handleFilterChange}
              onPageChange={setUserPage}
              onRecheck={id => void recheckUser(id)}
            />
          )}

          {tab === 'access' && overview && (
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="tcard p-4">
                  <div className="text-[9px] tracking-widest text-fg-3">ELEFIN MODE</div>
                  <div className="font-display font-black text-lg mt-1 uppercase">{overview.elefinVerifyMode}</div>
                  {overview.elefinVerifyMode === 'stub' && (
                    <div className="flex items-center gap-1 text-[10px] text-warning mt-1">
                      <ShieldWarning size={12} /> Stub — set live when boss API ready
                    </div>
                  )}
                </div>
                <div className="tcard p-4">
                  <div className="text-[9px] tracking-widest text-fg-3">PENDING ELEFIN</div>
                  <div className="font-display font-black text-2xl numeric mt-1">{pendingElefin}</div>
                </div>
                <div className="tcard p-4">
                  <div className="text-[9px] tracking-widest text-fg-3">INACTIVE QUEUE</div>
                  <div className="font-display font-black text-2xl numeric mt-1 text-warning">{inactiveCount}</div>
                </div>
              </div>
              <AdminGrantsSection
                grants={grants}
                grantEmail={grantEmail}
                grantNote={grantNote}
                grantBusy={grantBusy}
                actionBusy={actionBusy}
                onEmailChange={setGrantEmail}
                onNoteChange={setGrantNote}
                onSubmit={addGrant}
                onRevoke={id => void revokeGrant(id)}
              />
            </div>
          )}

          {tab === 'system' && overview && (
            <div className="space-y-4 min-w-0">
              <AdminMaintenancePanel
                maintenance={overview.maintenance}
                maintMessage={maintMessage}
                maintBusy={maintBusy}
                onMessageChange={setMaintMessage}
                onToggle={() => void toggleMaintenance()}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="tcard p-3">
                  <div className="text-[9px] tracking-widest text-fg-3">AUTH SESSIONS</div>
                  <div className="font-display font-black text-xl numeric">{overview.activeSessionsNow}</div>
                </div>
                <div className="tcard p-3">
                  <div className="text-[9px] tracking-widest text-fg-3">LIVE USAGE</div>
                  <div className="font-display font-black text-xl numeric text-profit">{overview.liveUsageSessions}</div>
                </div>
                <div className="tcard p-3">
                  <div className="text-[9px] tracking-widest text-fg-3">SYNC HEALTHY</div>
                  <div className="font-display font-black text-xl numeric">{overview.syncHealthy}</div>
                </div>
                <div className="tcard p-3">
                  <div className="text-[9px] tracking-widest text-fg-3">SYNC STALE</div>
                  <div className="font-display font-black text-xl numeric text-warning">{overview.syncStale}</div>
                </div>
              </div>

              <div className="tcard p-4 sm:p-5">
                <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase mb-3">Audit log</div>
                {audit.length === 0 ? (
                  <p className="text-sm text-fg-3">No admin actions yet.</p>
                ) : (
                  <div className="space-y-1 max-h-[420px] overflow-y-auto">
                    {audit.map(a => (
                      <div key={a.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-border-soft/50 text-[11px]">
                        <div className="min-w-0">
                          <div className="text-fg truncate">{a.action}</div>
                          <div className="text-fg-3 truncate">{a.actorEmail}</div>
                        </div>
                        <div className="text-fg-3 shrink-0">{fmtRelative(a.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
