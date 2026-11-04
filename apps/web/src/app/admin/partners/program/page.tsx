'use client';

// Super admin: the whole partner programme at a glance — partner pipeline, the
// referral funnel across every partner, aggregate client trading, a partner-wise
// table and CSV exports.
import Link from '@/components/v6/ui/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useAccounts } from '@/lib/use-accounts';
import { cash, ibApi, money, per, type AdminPackageRow, type CohortRow, type ProgramOverview, type ProgramSettings, type Range } from '@/lib/ib-api';
import { CohortTable } from '@/components/v6/account/ib-charts';
import { useConfirm } from '@/components/confirm-dialog';
import { IArrowLeft } from '@/components/v6/icons';
import { Avatar, RangeSeg, n, pct } from '@/components/v6/account/partner-parts';
import { IbFunnelCard, TradingCard } from '@/components/v6/account/ib-parts';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

type Sort = 'clients' | 'verified' | 'eligible' | 'trades30d' | 'lots30d' | 'pnl30d';

export default function AdminPartnerProgramPage() {
  const router = useRouter();
  const { accounts, selected, select } = useAccounts();
  const [range, setRange] = useState<Range>('30D');
  const [d, setD] = useState<ProgramOverview | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>('clients');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'ACTIVE' | 'SUSPENDED' | 'errors'>('all');
  const [cohorts, setCohorts] = useState<CohortRow[] | null>(null);
  const [pkgs, setPkgs] = useState<AdminPackageRow[] | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();
  const loadPkgs = useCallback(() => ibApi.adminPackages().then(setPkgs).catch(() => setPkgs([])), []);
  useEffect(() => { ibApi.cohorts().then(setCohorts).catch(() => setCohorts([])); void loadPkgs(); }, [loadPkgs]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);
  async function hold(p: AdminPackageRow) {
    const r = await ask(p.adminHold
      ? { title: `Put “${p.name}” back on offer?`, confirmLabel: 'Release' }
      : { title: `Pause “${p.name}”?`, body: `${p.partner}’s clients stop being able to unlock it; current holders move to the grace period. The partner sees your note.`, confirmLabel: 'Pause', tone: 'danger', reason: true });
    if (!r) return;
    try { await ibApi.holdPackage(p.id, !p.adminHold, r.reason); setToast(p.adminHold ? 'Back on offer.' : 'Paused.'); await loadPkgs(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'That didn’t work.'); }
  }
  const [rule, setRule] = useState<ProgramSettings | null>(null);
  useEffect(() => { ibApi.settings().then(setRule).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try { setD(await ibApi.program(range)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the programme.'); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const rows = (d?.rows ?? []).filter(r => !q.trim() || `${r.name} ${r.email} ${r.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter(r => status === 'all' || (status === 'errors' ? r.brokerErrors > 0 : r.status === status))
    .sort((a, b) => b[sort] - a[sort]);
  const th = (k: Sort, l: string) => <th className="n" aria-sort={sort === k ? 'descending' : undefined}><button type="button" className={sort === k ? 'ad-sorted' : ''} onClick={() => setSort(k)}>{l}</button></th>;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner programme"
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}
      actions={<>
        <RangeSeg value={range} onChange={setRange} />
        <a className="x-btn" href={ibApi.exportUrl('clients')} download data-testid="export-clients"><DownloadSimple size={15} weight="bold" />Clients CSV</a>
        <a className="x-btn" href={ibApi.exportUrl('partners')} download><DownloadSimple size={15} weight="bold" />Partners CSV</a>
      </>}>
      <div className="x-page" data-testid="admin-program"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <><div className="x-skel ad-sk-strip" /><div className="x-skel ad-sk-card" /></>}

          {d && <>
            <div className="x-strip x-strip--card ib-adm-strip" aria-label="Partner pipeline">
              <div><span>Active partners</span><b className="m">{n(d.partners.active)}</b></div>
              <div><span>Waiting for review</span><b className="m">{n(d.partners.pending)}</b><small className="ad-small">{n(d.partners.needsInfo)} asked for more info</small></div>
              <div><span>Suspended</span><b className="m">{n(d.partners.suspended)}</b></div>
              <div><span>Rejected / revoked</span><b className="m">{n(d.partners.rejected + d.partners.revoked)}</b></div>
              <div><span>Manual reviews</span><b className={`m ${d.attention.reviews ? '' : 'x-dim'}`}>{n(d.attention.reviews)}</b><small className="ad-small"><Link className="x-link" href="/admin/partners/reviews">Open queue</Link></small></div>
              <div><span>Flags · sync errors</span><b className={`m ${d.attention.flags + d.attention.syncErrors ? 'neg' : 'x-dim'}`}>{n(d.attention.flags)} · {n(d.attention.syncErrors)}</b></div>
            </div>

            <IbFunnelCard f={d.funnel} rule={{ minTrades: rule?.activeMinTrades ?? 1, windowDays: rule?.activeWindowDays ?? 30 }} title="Referral funnel, every partner" sub={<Link className="x-link" href="/admin/partners/settings">Programme rules</Link>} />
            <TradingCard t={d.trading} title="Referred clients’ trading, last 30 days" note="Across every partner’s connected clients. Per-client numbers are in the clients export." />

            <section className="x-card" data-testid="program-rows">
              <div className="x-ch"><h2>Partners</h2><span className="x-sub"><span className="m">{rows.length}</span></span>
                <div className="x-r">
                  <select className="x-select" value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Filter partners">
                    <option value="all">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="errors">With broker errors</option>
                  </select>
                  <input className="x-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search partners" aria-label="Search partners" />
                </div></div>
              {rows.length === 0 ? <EmptyState compact icon="search" title={d.rows.length ? 'No partner matches' : 'No active partners yet'}>{d.rows.length ? 'Try another search.' : 'Approve an application or add a partner.'}</EmptyState> : (
                <div className="x-tblwrap ad-scroll">
                  <table className="x-tbl ad-tbl">
                    <thead><tr><th>Partner</th>{th('clients', 'Referred')}<th className="n">Connected</th>{th('verified', 'Verified')}<th className="n">Active</th>{th('eligible', 'Unlocked')}{th('trades30d', 'Trades, 30d')}{th('lots30d', 'Lots, 30d')}{th('pnl30d', 'Net P&L, 30d')}<th className="n">Win / lose</th><th className="n">Broker errors</th></tr></thead>
                    <tbody>{rows.map(r => (
                      <tr key={r.id} className="x-click" tabIndex={0} onClick={() => router.push(`/admin/partners/${r.id}`)} onKeyDown={e => { if (e.key === 'Enter') router.push(`/admin/partners/${r.id}`); }}>
                        <td><div className="ac-who"><Avatar name={r.name} /><span><b>{r.name}</b><small>{r.code ?? r.email}{r.status !== 'ACTIVE' ? ` · ${r.status.toLowerCase()}` : ''}</small></span></div></td>
                        <td className="n m">{n(r.clients)}</td>
                        <td className="n m">{n(r.connected)}<small className="x-dim"> {pct(r.connected, r.clients)}</small></td>
                        <td className="n m">{n(r.verified)}</td>
                        <td className="n m">{n(r.active)}</td>
                        <td className={`n m ${r.eligible ? 'pos' : 'x-dim'}`}>{n(r.eligible)}</td>
                        <td className="n m">{n(r.trades30d)}</td>
                        <td className="n m">{r.lots30d.toFixed(2)}</td>
                        <td className={`n m ${r.pnl30d > 0 ? 'pos' : r.pnl30d < 0 ? 'neg' : ''}`}>{money(r.pnl30d)}</td>
                        <td className="n m"><span className="pos">{r.profitable}</span><span className="x-dim"> / </span><span className="neg">{r.losing}</span></td>
                        <td className={`n m ${r.brokerErrors ? 'neg' : 'x-dim'}`}>{r.brokerErrors}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="x-card" data-testid="program-cohorts">
              <div className="x-ch"><h2>Retention by signup month</h2><span className="x-sub">every partner&rsquo;s referred clients</span></div>
              {!cohorts ? <div className="x-skel x-skel--in" /> : cohorts.length ? <CohortTable rows={cohorts} /> : <p className="x-muted ib-pad">No referred signups in the last 12 months.</p>}
            </section>

            <section className="x-card" data-testid="program-packages">
              <div className="x-ch"><h2>Packages on offer</h2><span className="x-sub"><span className="m">{pkgs?.length ?? 0}</span></span><div className="x-r"><Link href="/admin/partners/finance" className="x-btn x-btn--sm x-btn--ghost">Finance</Link></div></div>
              {!pkgs ? <div className="x-skel x-skel--in" /> : pkgs.length === 0 ? <p className="x-muted ib-pad">No partner has created a package yet.</p> : (
                <div className="x-tblwrap ad-scroll"><table className="x-tbl ad-tbl"><thead><tr><th>Package</th><th>Partner</th><th>Contents</th><th>Price</th><th className="n">Unlocked</th><th className="n">Paying</th><th>Status</th><th className="n"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{pkgs.map(p => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td>
                      <td><Link className="x-link" href={`/admin/partners/${p.partnerId}`}>{p.partner}</Link></td>
                      <td className="x-muted">{p.perks.length} features · {p.productIds.length} tools · {p.templateIds.length} strategies</td>
                      <td className="m">{p.priceCents ? `${cash(p.priceCents, p.currency)} / ${per(p.periodDays)}` : 'Free'}</td>
                      <td className="n m">{p.holders}</td><td className="n m">{p.subscribers}</td>
                      <td>{p.adminHold ? <span className="x-tag x-tag--r">Paused by admin</span> : <span className={`x-tag ${p.status === 'LIVE' ? 'x-tag--g' : ''}`}>{p.status.toLowerCase()}</span>}</td>
                      <td className="n"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void hold(p)} data-testid={`pkg-hold-${p.name}`}>{p.adminHold ? 'Release' : 'Pause'}</button></td>
                    </tr>
                  ))}</tbody></table></div>
              )}
            </section>
          </>}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}
