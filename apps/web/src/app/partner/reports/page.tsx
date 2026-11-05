'use client';

// Advanced partner reports: every funnel step per day, signup-month cohorts
// (retention), channels through to unlocked, tool and feature usage, package
// holders and strategy subscribers, and IB earnings by month. CSV export of clients.
import { useCallback, useEffect, useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { ibApi, PRODUCT_TYPE_LABEL, type ProductType, type Range, type Reports } from '@/lib/ib-api';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { RangeSeg, n, pct } from '@/components/v6/account/partner-parts';
import { CohortTable, DailyMultiples, MonthBars } from '@/components/v6/account/ib-charts';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

export default function PartnerReportsPage() {
  const { accounts, selected, select } = useAccounts();
  const [range, setRange] = useState<Range>('30D');
  const [d, setD] = useState<Reports | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setD(await ibApi.reports(range)); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(e instanceof Error ? e.message : 'Could not load reports.');
    }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Reports"
      pageSubtitle="Funnel, retention, usage and earnings"
      actions={!gate ? <><RangeSeg value={range} onChange={setRange} /><a className="x-btn" href={ibApi.partnerExportUrl()} download data-testid="partner-export"><DownloadSimple size={15} weight="bold" />Clients CSV</a></> : null}>
      <div className="x-page" data-testid="partner-reports">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <div className="x-skel ac-sk-320" />}
          {d && <>
            <section className="x-card" data-testid="reports-daily">
              <div className="x-ch"><h2>Day by day</h2><span className="x-sub">tap or hover a day to read every step</span></div>
              <DailyMultiples days={d.daily.map(x => x.date)} series={[
                { key: 'clicks', label: 'Link clicks', values: d.daily.map(x => x.clicks) },
                { key: 'signups', label: 'Signed up', values: d.daily.map(x => x.signups) },
                { key: 'connected', label: 'MT5 connected', values: d.daily.map(x => x.connected) },
                { key: 'verified', label: 'Broker verified', values: d.daily.map(x => x.verified) },
                { key: 'unlocked', label: 'Unlocked a package', values: d.daily.map(x => x.unlocked) },
              ]} />
            </section>

            <section className="x-card" data-testid="reports-cohorts">
              <div className="x-ch"><h2>Retention by signup month</h2><span className="x-sub">share of each month&rsquo;s signups</span></div>
              {d.cohorts.length ? <CohortTable rows={d.cohorts} /> : <EmptyState compact icon="report" title="No signups in the last 12 months">Cohorts appear once clients sign up through you.</EmptyState>}
            </section>

            <div className="ib-grid2">
              <section className="x-card" data-testid="reports-channels">
                <div className="x-ch"><h2>Channels to unlocked</h2></div>
                <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl ib-tbl-ch"><thead><tr><th>Channel</th><th className="n">Clicks</th><th className="n">Signups</th><th className="n">Verified</th><th className="n">Unlocked</th><th className="n">Signup → unlocked</th></tr></thead>
                  <tbody>{d.channels.map(c => <tr key={c.label}><td>{c.label}</td><td className="n m">{n(c.clicks)}</td><td className="n m">{n(c.signups)}</td><td className="n m">{n(c.verified)}</td><td className="n m">{n(c.unlocked)}</td><td className="n m x-muted">{pct(c.unlocked, c.signups)}</td></tr>)}</tbody></table></div>
              </section>
              <section className="x-card" data-testid="reports-features">
                <div className="x-ch"><h2>What your clients use</h2><span className="x-sub">last 30 days</span></div>
                {d.features.length === 0 ? <p className="x-muted ib-pad">No feature use recorded yet.</p> : (
                  <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>Feature</th><th className="n">Clients</th><th className="n">Page views</th></tr></thead>
                    <tbody>{d.features.map(f => <tr key={f.key}><td>{f.label}</td><td className="n m">{n(f.users)}</td><td className="n m">{n(f.views)}</td></tr>)}</tbody></table></div>
                )}
              </section>
            </div>

            <div className="ib-grid2">
              <section className="x-card" data-testid="reports-tools">
                <div className="x-ch"><h2>Your tools</h2><span className="x-sub">opens, last 30 days</span></div>
                {d.products.length === 0 ? <p className="x-muted ib-pad">Add tools on the Tools page to see who opens them.</p> : (
                  <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>Tool</th><th>Type</th><th className="n">Clients</th><th className="n">Opens</th></tr></thead>
                    <tbody>{d.products.map(p => <tr key={p.id}><td>{p.name}</td><td className="x-muted">{PRODUCT_TYPE_LABEL[p.type as ProductType] ?? p.type}</td><td className="n m">{n(p.users)}</td><td className="n m">{n(p.opens)}</td></tr>)}</tbody></table></div>
                )}
              </section>
              <section className="x-card" data-testid="reports-subs">
                <div className="x-ch"><h2>Subscriptions</h2><span className="x-sub">package holders and strategy followers</span></div>
                {d.marketplace.packageSubs.length + d.marketplace.strategySubs.length === 0 ? <p className="x-muted ib-pad">No packages or marketplace strategies yet.</p> : (
                  <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>Name</th><th>Kind</th><th className="n">Active</th><th className="n">All time</th></tr></thead>
                    <tbody>
                      {d.marketplace.packageSubs.map(p => <tr key={`p-${p.name}`}><td>{p.name}</td><td className="x-muted">Package</td><td className="n m">{n(p.active)}</td><td className="n m">{n(p.total)}</td></tr>)}
                      {d.marketplace.strategySubs.map(s => <tr key={`s-${s.name}`}><td>{s.name}</td><td className="x-muted">Marketplace strategy</td><td className="n m">{n(s.active)}</td><td className="n m">{n(s.total)}</td></tr>)}
                    </tbody></table></div>
                )}
              </section>
            </div>

            <section className="x-card" data-testid="reports-earnings">
              <div className="x-ch"><h2>Earnings by month</h2><span className="x-sub">IB commission reported by brokers</span></div>
              {d.earningsByMonth.length ? <MonthBars data={d.earningsByMonth.map(m => ({ label: m.month, value: m.ib }))} format={v => v.toFixed(2)} /> : <p className="x-muted ib-pad">Nothing reported yet.</p>}
            </section>
          </>}
        </>}
      </div>
    </AppShell>
  );
}
