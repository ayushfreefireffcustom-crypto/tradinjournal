'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { AdminEngagementDto, AdminOverviewDto } from '@/lib/admin-api';
import { GaugeRing, LiquidBar } from './gauge-ring';
import { pct, fmtRelative, auditLabel } from './admin-utils';
import { TraderOpsStrip } from './trader-ops-strip';

// Leaflet reads `window` on import — must be client-only, never SSR'd.
const AdminGeoMap = dynamic(
  () => import('./admin-geo-map').then(m => ({ default: m.AdminGeoMap })),
  { ssr: false, loading: () => <section className="x-card"><div className="x-ch"><h2>User locations</h2></div><div className="x-skel x-skel--in ad-map-sk" /></section> },
);

const n = (v: number) => v.toLocaleString('en-US');

function Funnel({ overview }: { overview: AdminOverviewDto }) {
  const steps = [
    { label: 'Signed up', value: overview.funnel.signups },
    { label: 'Email verified', value: overview.funnel.emailVerified },
    { label: 'Elefin verified', value: overview.funnel.elefinVerified },
    { label: 'Broker connected', value: overview.funnel.withBroker },
    { label: 'Active traders', value: overview.funnel.activeTraders },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <section className="x-card">
      <div className="x-ch"><h2>Access funnel</h2><span className="x-sub">share of signups</span></div>
      <ol className="ad-funnel">
        {steps.map((s, i) => (
          <li key={s.label}>
            <span className="l">{s.label}</span>
            <span className="v"><b className="m">{n(s.value)}</b><small className="m">{i === 0 ? '100%' : `${pct(s.value, steps[0]!.value)}%`}</small></span>
            <span className="x-bar"><i style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EngagementChart({ data }: { data: AdminEngagementDto | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data?.days.length) {
    return (
      <section className="x-card">
        <div className="x-ch"><h2>Daily active users</h2></div>
        <div className="x-empty"><p>No usage data yet. Heartbeats fill this in.</p></div>
      </section>
    );
  }
  const maxDau = Math.max(...data.days.map(d => d.dau), 1);
  const avg = Math.round(data.days.reduce((a, d) => a + d.dau, 0) / data.days.length);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', o);
  const h = hover != null ? data.days[hover] : null;
  return (
    <section className="x-card ad-eng">
      <div className="x-ch">
        <h2>Daily active users</h2><span className="x-sub">last {data.range}</span>
        <div className="x-r">avg <b className="m ad-tx">{avg}</b> a day</div>
      </div>
      <div className="ad-bars" onMouseLeave={() => setHover(null)}>
        {data.days.map((d, i) => (
          <div key={d.date} className={`ad-bar ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} aria-label={`${fmt(d.date, { day: 'numeric', month: 'short' })}: ${d.dau} users, ${d.avgSessionMin} min average`}>
            <i style={{ height: `${Math.max(4, (d.dau / maxDau) * 100)}%` }} />
          </div>
        ))}
        {h && hover != null && (
          <div className={`ad-tip ${hover > data.days.length * 0.6 ? 'l' : ''}`} style={{ left: `${((hover + 0.5) / data.days.length) * 100}%` }}>
            <span>{fmt(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <b className="m">{h.dau} users</b>
            <span className="m">{h.avgSessionMin} min avg</span>
          </div>
        )}
      </div>
      <div className="ad-axis"><span>{fmt(data.days[0]!.date, { day: 'numeric', month: 'short' })}</span><span>{fmt(data.days[data.days.length - 1]!.date, { day: 'numeric', month: 'short' })}</span></div>
    </section>
  );
}

function FeatureUsage({ overview }: { overview: AdminOverviewDto }) {
  const items = [...overview.featureUsage7d].sort((a, b) => b.events - a.events);
  const max = Math.max(...items.map(f => f.events), 1);
  return (
    <section className="x-card">
      <div className="x-ch"><h2>Feature usage</h2><span className="x-sub">last 7 days</span></div>
      {items.length === 0 ? <div className="x-empty"><p>No feature events yet.</p></div> : (
        <div className="ad-hbars">
          <div className="ad-hbar ad-hbar--h"><span>Feature</span><span /><span className="r">Events</span><span className="r">Users</span></div>
          {items.map(f => (
            <div key={f.feature} className="ad-hbar">
              <span className="ad-cap">{f.feature.charAt(0).toUpperCase() + f.feature.slice(1)}</span>
              <span className="x-bar"><i style={{ width: `${Math.max(2, (f.events / max) * 100)}%` }} /></span>
              <b className="m r">{n(f.events)}</b>
              <span className="m r x-muted">{n(f.uniqueUsers)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CommandOverview({
  overview,
  engagement,
  onToggleMaint,
  maintBusy,
}: {
  overview: AdminOverviewDto;
  engagement: AdminEngagementDto | null;
  onToggleMaint: () => void;
  maintBusy: boolean;
}) {
  const live = !overview.maintenance.enabled;
  const elefinPct = pct(overview.elefinVerified, overview.totalUsers);
  const brokerPct = pct(overview.usersWithBrokers, overview.totalUsers);
  const activityPct = overview.elefinVerified ? pct(overview.activeTraders, overview.elefinVerified) : 0;
  const syncPct = overview.brokerAccounts ? pct(overview.syncHealthy, overview.brokerAccounts) : 100;
  const maxBroker = overview.brokerBreakdown[0]?.count || 1;

  return (
    <div className="x-page" data-testid="admin-overview-tab">
      <section className={`x-card ad-status ${live ? '' : 'off'}`}>
        <div className="ad-status-t">
          <b><i className={`x-dot ${live ? '' : 'x-dot--r'}`} />{live ? 'All systems live' : 'Maintenance mode is on'}</b>
          <span><span className="m">{overview.liveUsageSessions}</span> live now · <span className="m">{overview.dau}</span> DAU · <span className="m">{overview.brokerAccounts}</span> brokers · <span className="m">{n(overview.totalTrades7d)}</span> trades in 7 days</span>
        </div>
        <button type="button" onClick={onToggleMaint} disabled={maintBusy} className={`x-btn ${live ? 'x-btn--danger' : 'x-btn--hi'}`}>
          {maintBusy ? 'Updating…' : live ? 'Enable maintenance' : 'Go live'}
        </button>
      </section>

      <div className="x-strip x-strip--card ad-strip4">
        <div><span>Daily active users</span><b className="m">{overview.dau}</b><small className="ad-small">WAU <span className="m">{overview.wau}</span> · MAU <span className="m">{overview.mau}</span></small></div>
        <div><span>Avg session today</span><b className="m">{overview.avgSessionMinToday}m</b><small className="ad-small"><span className="m">{overview.avgSessionMin7d}m</span> avg over 7 days</small></div>
        <div><span>Brokers connected</span><b className="m">{overview.brokerAccounts}</b><small className="ad-small"><span className="m">{overview.elefinBrokerAccounts}</span> Elefin</small></div>
        <div><span>Active traders</span><b className="m pos">{overview.activeTraders}</b><small className="ad-small"><span className="m">{overview.inactiveTraders}</span> inactive</small></div>
      </div>

      <div className="ad-rates">
        <GaugeRing value={elefinPct} label="Elefin verified" sub={`${overview.elefinVerified} of ${overview.totalUsers} users`} tone="g" />
        <GaugeRing value={brokerPct} label="Broker attached" sub={`${overview.usersWithBrokers} users`} tone="n" />
        <GaugeRing value={activityPct} label="Activity pass" sub="among Elefin-verified" tone={activityPct >= 50 ? 'g' : 'r'} />
        <LiquidBar value={syncPct} label="Sync health" sub={`${overview.syncStale} stale over 24h`} />
      </div>

      <div className="ad-row2">
        <EngagementChart data={engagement} />
        <Funnel overview={overview} />
      </div>

      <TraderOpsStrip />

      <AdminGeoMap />

      <div className="ad-row2">
        <FeatureUsage overview={overview} />
        <section className="x-card">
          <div className="x-ch"><h2>Brokers</h2><span className="x-sub">connected accounts</span></div>
          {overview.brokerBreakdown.length === 0 ? <div className="x-empty"><p>No brokers yet.</p></div> : (
            <div className="ad-hbars">
              {overview.brokerBreakdown.slice(0, 8).map(b => (
                <div key={b.broker} className="ad-hbar ad-hbar--3">
                  <span className="ad-cap">{b.broker}{b.elefin && <span className="x-badge">Elefin</span>}</span>
                  <span className={`x-bar ${b.elefin ? '' : 'ad-bar-mut'}`}><i style={{ width: `${(b.count / maxBroker) * 100}%` }} /></span>
                  <b className="m r">{b.count}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="x-strip x-strip--card ad-strip4">
        <div><span>Usage hours, 7 days</span><b className="m">{overview.totalUsageHours7d}</b></div>
        <div><span>Stickiness</span><b className="m">{overview.stickiness}</b></div>
        <div><span>Manual grants</span><b className="m">{overview.manualGrantsActive}</b></div>
        <div><span>Signups, 30 days</span><b className="m">{overview.signups30d}</b></div>
      </div>

      <section className="x-card">
        <div className="x-ch"><h2>Live pulse</h2></div>
        <div className="ad-pulse">
          <div>
            <span className="x-label">Recent signups</span>
            {overview.recentSignups.length === 0 ? <p className="ad-none">No signups yet.</p> : (
              <ul className="ad-feed">
                {overview.recentSignups.slice(0, 4).map(u => <li key={u.id}><span>{u.email}</span><small>{fmtRelative(u.createdAt)}</small></li>)}
              </ul>
            )}
          </div>
          <div>
            <span className="x-label">Admin actions</span>
            {overview.recentAudit.length === 0 ? <p className="ad-none">No actions yet.</p> : (
              <ul className="ad-feed">
                {overview.recentAudit.slice(0, 4).map(a => <li key={a.id}><span>{auditLabel(a.action)}</span><small>{fmtRelative(a.createdAt)}</small></li>)}
              </ul>
            )}
          </div>
          <div className="x-strip ad-cohorts">
            <div><span>Grant cohort</span><b className="m">{overview.cohorts.grantUsers}</b></div>
            <div><span>Elefin cohort</span><b className="m">{overview.cohorts.elefinUsers}</b></div>
            <div><span>Median hours to broker / Elefin</span><b className="m">{overview.onboarding.medianHoursToBroker ?? '—'}h / {overview.onboarding.medianHoursToElefin ?? '—'}h</b></div>
          </div>
        </div>
      </section>
    </div>
  );
}
