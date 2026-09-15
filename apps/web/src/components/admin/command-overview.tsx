'use client';

import type { AdminEngagementDto, AdminOverviewDto } from '@/lib/admin-api';
import { GaugeRing, LiquidBar } from './gauge-ring';
import { pct, fmtRelative } from './admin-utils';
import { StatCard } from '@/components/stat-card';
import {
  Pulse, Clock, Bank, ChartLineUp, Users, ShieldCheck,
} from '@phosphor-icons/react';
import { AdminGeoMap } from './admin-geo-map';
import { TraderOpsStrip } from './trader-ops-strip';

function Funnel({ overview }: { overview: AdminOverviewDto }) {
  const steps = [
    { label: 'Signups', value: overview.funnel.signups },
    { label: 'Email OK', value: overview.funnel.emailVerified },
    { label: 'Elefin', value: overview.funnel.elefinVerified },
    { label: 'Broker', value: overview.funnel.withBroker },
    { label: 'Active', value: overview.funnel.activeTraders },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="tcard p-4 sm:p-5 min-w-0">
      <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase mb-4">Access funnel</div>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const rate = i === 0 ? 100 : pct(s.value, steps[0]!.value);
          return (
            <div key={s.label} className="min-w-0">
              <div className="flex justify-between text-[11px] mb-1 gap-2">
                <span className="text-fg-2 truncate">{s.label}</span>
                <span className="numeric text-fg shrink-0">{s.value} · {rate}%</span>
              </div>
              <div className="kpi-bar h-2">
                <div
                  className="kpi-bar-fill h-full bg-profit"
                  style={{ width: `${Math.max(3, (s.value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EngagementChart({ data }: { data: AdminEngagementDto | null }) {
  if (!data?.days.length) {
    return (
      <div className="tcard p-4 sm:p-5 min-w-0">
        <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase mb-2">Engagement</div>
        <p className="text-sm text-fg-3">No usage data yet — heartbeats will fill this in.</p>
      </div>
    );
  }
  const maxDau = Math.max(...data.days.map(d => d.dau), 1);
  return (
    <div className="tcard p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">DAU · {data.range}</div>
        <div className="text-[10px] text-fg-3 numeric">avg min overlay</div>
      </div>
      <div className="flex items-end gap-1 h-32">
        {data.days.map(d => {
          const h = Math.max(4, (d.dau / maxDau) * 100);
          const day = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric' });
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative">
              <div className="w-full flex items-end flex-1 min-h-0">
                <div
                  className="w-full rounded-sm bg-profit/70 hover:bg-profit transition-colors"
                  style={{ height: `${h}%` }}
                  title={`${d.dau} users · ${d.avgSessionMin}m avg`}
                />
              </div>
              <span className="text-[8px] text-fg-3">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeatureCarousel({ overview }: { overview: AdminOverviewDto }) {
  const items = overview.featureUsage7d.length
    ? overview.featureUsage7d
    : ['dashboard', 'charts', 'macro', 'coach', 'journal', 'trades'].map(f => ({
        feature: f,
        events: 0,
        uniqueUsers: 0,
      }));

  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase mb-2 px-0.5">Feature usage · 7d</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {items.map(f => (
          <div key={f.feature} className="tcard p-3 shrink-0 min-w-[140px]">
            <div className="text-[9px] tracking-widest text-fg-3 uppercase">{f.feature}</div>
            <div className="font-display font-black text-xl numeric mt-1">{f.events}</div>
            <div className="text-[10px] text-fg-3 mt-0.5">{f.uniqueUsers} users</div>
          </div>
        ))}
      </div>
    </div>
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
  const activityPct = overview.elefinVerified
    ? pct(overview.activeTraders, overview.elefinVerified)
    : 0;
  const syncPct = overview.brokerAccounts
    ? pct(overview.syncHealthy, overview.brokerAccounts)
    : 100;

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden" data-testid="admin-overview-tab">
      {/* Status ribbon */}
      <div className={`tcard p-4 border-l-4 ${live ? 'border-l-profit' : 'border-l-loss'} min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Pulse size={16} className={live ? 'text-profit' : 'text-loss'} />
              <span className={`font-display font-black text-lg tracking-tight ${live ? 'text-profit' : 'text-loss'}`}>
                {live ? 'ALL SYSTEMS LIVE' : 'MAINTENANCE MODE'}
              </span>
            </div>
            <p className="text-[11px] text-fg-2 mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
                {overview.liveUsageSessions} live · {overview.dau} DAU · {overview.brokerAccounts} brokers · {overview.totalTrades7d} trades/7d
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleMaint}
            disabled={maintBusy}
            className={`btn py-2 px-3 text-[10px] shrink-0 ${live ? 'btn-ghost border border-loss/40 text-loss' : 'btn-primary'}`}
          >
            {maintBusy ? '…' : live ? 'ENABLE MAINTENANCE' : 'GO LIVE'}
          </button>
        </div>
      </div>

      <TraderOpsStrip />

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="DAU" value={String(overview.dau)} count={overview.dau} format={n => String(n)} sub={`WAU ${overview.wau} · MAU ${overview.mau}`} accent="profit" index={0} />
        <StatCard label="Avg session today" value={`${overview.avgSessionMinToday}m`} sub={`${overview.avgSessionMin7d}m avg · 7d`} index={1} />
        <StatCard label="Brokers connected" value={String(overview.brokerAccounts)} count={overview.brokerAccounts} format={n => String(n)} sub={`${overview.elefinBrokerAccounts} Elefin`} index={2} />
        <StatCard label="Active traders" value={String(overview.activeTraders)} count={overview.activeTraders} format={n => String(n)} accent="profit" sub={`${overview.inactiveTraders} inactive`} index={3} />
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <GaugeRing value={elefinPct} label="Elefin verified" sub={`${overview.elefinVerified}/${overview.totalUsers}`} tone="profit" />
        <GaugeRing value={brokerPct} label="Broker attach" sub={`${overview.usersWithBrokers} users`} tone="neutral" />
        <GaugeRing value={activityPct} label="Activity pass" sub="among Elefin" tone={activityPct >= 50 ? 'profit' : 'warning'} />
        <LiquidBar value={syncPct} label="Sync health" sub={`${overview.syncStale} stale >24h`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <EngagementChart data={engagement} />
        <Funnel overview={overview} />
      </div>

      <AdminGeoMap />

      <FeatureCarousel overview={overview} />

      {/* Extra metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: Clock, label: 'Usage hours 7d', value: overview.totalUsageHours7d },
          { icon: Users, label: 'Stickiness', value: overview.stickiness },
          { icon: ShieldCheck, label: 'Manual grants', value: overview.manualGrantsActive },
          { icon: ChartLineUp, label: 'Signups 30d', value: overview.signups30d },
        ].map(m => (
          <div key={m.label} className="tcard p-3 min-w-0">
            <m.icon size={14} className="text-fg-3" />
            <div className="font-display font-black text-xl numeric mt-1">{m.value}</div>
            <div className="text-[9px] tracking-widest text-fg-3 uppercase mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Broker breakdown + live pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="tcard p-4 sm:p-5 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Bank size={14} className="text-fg-3" />
            <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Brokers</div>
          </div>
          {overview.brokerBreakdown.length === 0 ? (
            <p className="text-sm text-fg-3">No brokers yet.</p>
          ) : (
            <div className="space-y-2">
              {overview.brokerBreakdown.slice(0, 8).map(b => {
                const max = overview.brokerBreakdown[0]?.count || 1;
                return (
                  <div key={b.broker}>
                    <div className="flex justify-between text-[11px] mb-1 gap-2">
                      <span className="truncate text-fg">{b.broker}{b.elefin ? ' · ELEFIN' : ''}</span>
                      <span className="numeric text-fg-2">{b.count}</span>
                    </div>
                    <div className="kpi-bar h-1.5">
                      <div className="kpi-bar-fill h-full" style={{ width: `${(b.count / max) * 100}%`, background: b.elefin ? '#08C465' : '#71717A' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="tcard p-4 sm:p-5 min-w-0">
          <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase mb-3">Live pulse</div>
          <div className="space-y-3">
            <div>
              <div className="text-[9px] tracking-widest text-fg-3 mb-1">RECENT SIGNUPS</div>
              {overview.recentSignups.slice(0, 4).map(u => (
                <div key={u.id} className="flex justify-between gap-2 text-[11px] py-1 border-b border-border-soft/40">
                  <span className="truncate text-fg">{u.email}</span>
                  <span className="text-fg-3 shrink-0">{fmtRelative(u.createdAt)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[9px] tracking-widest text-fg-3 mb-1">ADMIN ACTIONS</div>
              {overview.recentAudit.slice(0, 4).map(a => (
                <div key={a.id} className="flex justify-between gap-2 text-[11px] py-1 border-b border-border-soft/40">
                  <span className="truncate text-fg">{a.action}</span>
                  <span className="text-fg-3 shrink-0">{fmtRelative(a.createdAt)}</span>
                </div>
              ))}
              {overview.recentAudit.length === 0 && <p className="text-sm text-fg-3">No actions yet.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="border border-border-soft rounded p-2">
                <div className="text-fg-3">Grant cohort</div>
                <div className="numeric text-fg text-lg font-display font-black">{overview.cohorts.grantUsers}</div>
              </div>
              <div className="border border-border-soft rounded p-2">
                <div className="text-fg-3">Elefin cohort</div>
                <div className="numeric text-fg text-lg font-display font-black">{overview.cohorts.elefinUsers}</div>
              </div>
              <div className="border border-border-soft rounded p-2 col-span-2">
                <div className="text-fg-3">Median hours → broker / Elefin</div>
                <div className="numeric text-fg mt-0.5">
                  {overview.onboarding.medianHoursToBroker ?? '—'}h / {overview.onboarding.medianHoursToElefin ?? '—'}h
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
