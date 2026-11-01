'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TRADING_ENABLED } from '@/lib/features';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
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
import { auditLabel, fmtRelative, sentence } from '@/components/admin/admin-utils';
import { ISync } from '@/components/v3/icons';
import '@/styles/v6/admin.css';

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
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select}
      pageTitle="Command center" pageSubtitle="Usage, access, brokers and platform health"
      actions={
        <>
          <Link href="/admin/feedback" className="x-btn" data-testid="admin-feedback-link">Feedback</Link>
          <Link href="/admin/marketplace" className="x-btn" data-testid="admin-mk-link">Marketplace</Link>
          {TRADING_ENABLED && <Link href="/admin/copy" className="x-btn" data-testid="admin-copy-link">Copy trading</Link>}
          <button type="button" onClick={() => void loadCore(true)} disabled={refreshing || loading} className="x-btn" data-testid="admin-refresh">
            <ISync size={15} className={refreshing ? 'x-spin' : ''} />Refresh
          </button>
        </>
      }>
      <div className="x-page ad-page" data-testid="admin-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert">
            <span>{error}</span>
            <button type="button" className="x-btn x-btn--sm" onClick={() => void loadCore(true)}>Retry</button>
          </div>
        )}

        <AdminTabs tab={tab} onChange={setTab} />

        {loading ? (
          <div className="x-page" aria-busy="true" data-testid="admin-loading">
            <div className="x-skel ad-sk-status" />
            <div className="x-skel ad-sk-strip" />
            <div className="ad-row2"><div className="x-skel ad-sk-card" /><div className="x-skel ad-sk-card" /></div>
          </div>
        ) : (
          <>
            {overview && tab === 'overview' && (
              <CommandOverview
                overview={overview}
                engagement={engagement}
                onToggleMaint={() => void toggleMaintenance()}
                maintBusy={maintBusy}
              />
            )}

            {tab === 'users' && (users ? (
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
            ) : <div className="x-skel ad-sk-card" />)}

            {tab === 'access' && overview && (
              <div className="x-page">
                <div className="x-strip x-strip--card ad-strip3">
                  <div>
                    <span>Elefin verification</span>
                    <b>{sentence(overview.elefinVerifyMode)}</b>
                    {overview.elefinVerifyMode === 'stub' && <small className="ad-small neg">Stub mode. Switch to live once the Elefin API is ready.</small>}
                  </div>
                  <div><span>Pending Elefin</span><b className="m">{pendingElefin}</b><small className="ad-small">waiting for verification</small></div>
                  <div><span>Inactive queue</span><b className={`m ${inactiveCount ? 'neg' : ''}`}>{inactiveCount}</b><small className="ad-small">below the activity rule</small></div>
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
              <div className="x-page">
                <AdminMaintenancePanel
                  maintenance={overview.maintenance}
                  maintMessage={maintMessage}
                  maintBusy={maintBusy}
                  onMessageChange={setMaintMessage}
                  onToggle={() => void toggleMaintenance()}
                />

                <div className="x-strip x-strip--card ad-strip4">
                  <div><span>Auth sessions</span><b className="m">{overview.activeSessionsNow}</b></div>
                  <div><span>Live usage</span><b className="m pos">{overview.liveUsageSessions}</b></div>
                  <div><span>Sync healthy</span><b className="m">{overview.syncHealthy}</b></div>
                  <div><span>Sync stale</span><b className={`m ${overview.syncStale ? 'neg' : ''}`}>{overview.syncStale}</b></div>
                </div>

                <section className="x-card" data-testid="admin-audit">
                  <div className="x-ch"><h2>Audit log</h2><span className="x-sub">latest {audit.length}</span></div>
                  {audit.length === 0 ? (
                    <div className="x-empty"><p>No admin actions yet.</p></div>
                  ) : (
                    <div className="x-tblwrap ad-scroll ad-audit-wrap">
                      <table className="x-tbl ad-tbl ad-audit">
                        <thead><tr><th>Action</th><th>Admin</th><th>Target</th><th className="n">When</th></tr></thead>
                        <tbody>
                          {audit.map(a => (
                            <tr key={a.id}>
                              <td>{auditLabel(a.action)}</td>
                              <td className="x-muted">{a.actorEmail}</td>
                              <td className="x-muted">{a.targetType ?? '—'}</td>
                              <td className="n x-muted">{fmtRelative(a.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
