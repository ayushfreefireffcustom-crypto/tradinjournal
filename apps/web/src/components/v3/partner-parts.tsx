'use client';

// Building blocks shared by the partner portal (/partner/*) and the admin
// partner pages: the referral funnel, trend chart, channel table, activity
// feed and the referred-clients table. Tracking only — no money anywhere.
import { useMemo, useState, type ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { AreaLine } from '@/components/v3/analytics-parts';
import { ICheck, ICopy, IDownload } from '@/components/v3/icons';
import { timeAgo } from '@/components/app-shell';
import {
  PARTNER_STATUS_LABEL, STATUS_LABEL, type PartnerChannel, type PartnerClient, type PartnerDailyPoint, type PartnerEvent,
  type PartnerFunnel, type PartnerRange, type PartnerStatus, type ReferralStatus,
} from '@/lib/partner-api';

export const RANGES: PartnerRange[] = ['7D', '30D', '90D', 'ALL'];
export type PRange = PartnerRange;
export const RANGE_LABEL: Record<PartnerRange, string> = { '7D': 'last 7 days', '30D': 'last 30 days', '90D': 'last 90 days', ALL: 'all time' };

export const n = (v: number) => v.toLocaleString('en-US');
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Avatar + status ───────────────────────────────────────────────────────
const HUES = ['#6E4BFF', '#19C37D', '#F59E0B', '#0EA5E9', '#EC4899', '#14B8A6', '#8B5CF6', '#F97316'];
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const ini = name.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const c = HUES[h % HUES.length]!;
  return <span className="pt-av" style={{ width: size, height: size, fontSize: size * 0.38, color: c, background: `${c}1A` }} aria-hidden>{ini}</span>;
}

const TONE: Record<ReferralStatus, string> = { SIGNED_UP: 'n', CONNECTED: 'v', ACTIVE: 'g', INACTIVE: 'a' };
export function StatusPill({ s }: { s: ReferralStatus }) {
  return <span className={`v3-pill ${TONE[s]} pt-st`}><i />{STATUS_LABEL[s]}</span>;
}

const PTONE: Record<PartnerStatus, string> = { ACTIVE: 'g', PENDING: 'a', SUSPENDED: 'r', REVOKED: 'n' };
export function PartnerStatusPill({ s }: { s: PartnerStatus }) {
  return <span className={`v3-pill ${PTONE[s]} pt-st`}><i />{PARTNER_STATUS_LABEL[s]}</span>;
}

export function RangeSeg({ value, onChange, small = false }: { value: PartnerRange; onChange: (r: PartnerRange) => void; small?: boolean }) {
  return (
    <div className={`v3-seg ${small ? 'sm' : ''}`} role="group" aria-label="Date range">
      {RANGES.map(k => <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{k === 'ALL' ? 'All' : k}</button>)}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', className = 'v3-btn v3-btn--o', testId }: { text: string; label?: string; className?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`${className} pt-copy ${done ? 'done' : ''}`} data-testid={testId}
      onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1600); }}>
      {done ? <ICheck size={15} /> : <ICopy size={15} />}{done ? 'Copied' : label}
    </button>
  );
}

// ── Funnel ────────────────────────────────────────────────────────────────
export function Funnel({ f, rule, title = 'Your funnel' }: { f: PartnerFunnel; rule: { minTrades: number; windowDays: number }; title?: string }) {
  const rangeLabel = RANGE_LABEL[f.range];
  const steps: { l: string; v: number; sub: ReactNode; conv: number | null; hint?: string }[] = [
    { l: 'Link clicks', v: f.clicks, sub: <>Times the link was opened</>, conv: null },
    { l: 'Signed up', v: f.signups, sub: <>{pct(f.converted, f.clicks)} of clicks convert</>, conv: f.clicks ? f.converted / f.clicks : 0,
      hint: 'Signups include people who typed your code. The % counts only clicks that led to a signup.' },
    { l: 'MT5 connected', v: f.connected, sub: <>{pct(f.connected, f.signups)} of signups</>, conv: f.signups ? f.connected / f.signups : 0 },
    { l: 'Active traders', v: f.active, sub: <>{pct(f.active, f.connected)} of connected</>, conv: f.connected ? f.active / f.connected : 0,
      hint: `Active = ${rule.minTrades}+ closed trades in the last ${rule.windowDays} days, counted from their synced MT5 history.` },
  ];
  return (
    <section className="v3-card pt-funnel" aria-label="Referral funnel" data-testid="partner-funnel">
      <div className="v3-ch"><h3>{title}<span> · {rangeLabel}</span></h3></div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.l} style={{ animationDelay: `${i * 60}ms` }}>
            <span className="l">{s.l}{s.hint && <abbr title={s.hint} aria-label={s.hint}>?</abbr>}</span>
            <b className="num">{n(s.v)}</b>
            <span className="s">{s.sub}</span>
            <span className="m"><i style={{ width: `${s.conv == null ? 100 : Math.max(s.conv * 100, s.v ? 2 : 0)}%`, animationDelay: `${120 + i * 80}ms` }} /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────
type Metric = 'clicks' | 'signups' | 'active';
export function TrendCard({ daily }: { daily: PartnerDailyPoint[] }) {
  const [m, setM] = useState<Metric>('signups');
  const pts = useMemo(() => daily.map(d => (m === 'clicks' ? d.clicks : m === 'signups' ? d.clients : d.active)), [m, daily]);
  const label = (i: number) => new Date(`${daily[i]!.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmt = (v: number) => (m === 'clicks' ? `${n(v)} clicks` : m === 'signups' ? `${n(v)} clients` : `${n(v)} active`);
  return (
    <section className="v3-card pt-trend" data-testid="partner-trend">
      <div className="v3-ch">
        <h3>{m === 'clicks' ? 'Clicks per day' : m === 'signups' ? 'Total clients' : 'Active traders'}</h3>
        <div className="v3-seg sm" role="group" aria-label="Metric">
          {([['signups', 'Clients'], ['active', 'Active'], ['clicks', 'Clicks']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={m === k} onClick={() => setM(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="pt-trend-body"><AreaLine pts={pts} fmt={fmt} height={236} labelFor={label} /></div>
      {daily.length > 1 && <div className="pt-axis"><span>{label(0)}</span><span>{label(Math.floor((daily.length - 1) / 2))}</span><span>{label(daily.length - 1)}</span></div>}
    </section>
  );
}

// ── Share card ────────────────────────────────────────────────────────────
const WA = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.3a.5.5 0 000-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
const TG = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M21.5 3.6L2.9 10.8c-1.3.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.8.8s.6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5zM9.4 13.4l8.7-5.5c.4-.3.8-.1.5.2l-7.2 6.5-.3 3.1z" /></svg>;
const XI = <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg>;
export function shareLinks(url: string) {
  const text = encodeURIComponent('I journal my MT5 trades with TRADElogs — read-only, free to start:');
  const u = encodeURIComponent(url);
  return [
    { l: 'WhatsApp', icon: WA, href: `https://wa.me/?text=${text}%20${u}` },
    { l: 'Telegram', icon: TG, href: `https://t.me/share/url?url=${u}&text=${text}` },
    { l: 'X', icon: XI, href: `https://x.com/intent/post?text=${text}&url=${u}` },
  ];
}
export function ShareRow({ url }: { url: string }) {
  return (
    <div className="pt-share">
      {shareLinks(url).map(s => <a key={s.l} href={s.href} target="_blank" rel="noopener noreferrer" className="v3-btn v3-btn--o">{s.icon}{s.l}</a>)}
    </div>
  );
}

export function Qr({ url, size = 132, id }: { url: string; size?: number; id: string }) {
  return (
    <div className="pt-qr">
      <QRCodeCanvas id={id} value={url} size={size * 2} style={{ width: size, height: size }} fgColor="#0E0D12" bgColor="#FFFFFF" level="M" />
      <button type="button" className="v3-link" onClick={() => {
        const c = document.getElementById(id) as HTMLCanvasElement | null;
        if (!c) return;
        const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'tradelogs-referral-qr.png'; a.click();
      }}><IDownload size={14} /> Download QR</button>
    </div>
  );
}

export function LinkBox({ url, testId }: { url: string; testId?: string }) {
  return (
    <div className="pt-linkbox">
      <span className="u" title={url}>{url.replace(/^https:\/\//, '')}</span>
      <CopyButton text={url} label="Copy link" className="v3-btn v3-btn--ink pt-copy-ink" testId={testId} />
    </div>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────
export function ChannelTable({ channels, right, withLinks = false, onArchive }: { channels: PartnerChannel[]; right?: ReactNode; withLinks?: boolean; onArchive?: (c: PartnerChannel) => void }) {
  const best = Math.max(...channels.map(c => c.signups), 1);
  return (
    <section className="v3-card a-flush pt-ch" data-testid="partner-channels">
      <div className="v3-ch"><h3>By channel<span> · all time</span></h3>{right}</div>
      <div className="v3-tbl-wrap">
        <table className="v3-table">
          <thead><tr><th>Channel</th>{withLinks && <th>Link</th>}<th className="r">Clicks</th><th className="r">Signups</th><th className="r">Click → signup</th><th className="r">MT5 connected</th><th className="r">Active</th>{onArchive && <th className="r"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{channels.map(c => (
            <tr key={c.id} className="static">
              <td><div className="pt-chn"><b>{c.label}</b><span className="bar"><i style={{ width: `${(c.signups / best) * 100}%` }} /></span></div></td>
              {withLinks && <td><div className="pt-chlink"><code>{c.url.replace(/^https:\/\//, '')}</code><CopyButton text={c.url} label="Copy" className="v3-btn v3-btn--o pt-copy-sm" /></div></td>}
              <td className="r num">{n(c.clicks)}</td>
              <td className="r num" style={{ fontWeight: 700 }}>{n(c.signups)}</td>
              <td className="r"><span className="v3-pill v num">{pct(c.converted, c.clicks)}</span></td>
              <td className="r num">{n(c.connected)}</td>
              <td className="r num lg">{n(c.active)}</td>
              {onArchive && <td className="r">{c.slug ? <button type="button" className="pt-rowbtn" onClick={() => onArchive(c)}>Archive</button> : <span className="mute pt-default">Default</span>}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────
const EV: Record<PartnerEvent['kind'], { t: string; c: string }> = {
  signup: { t: 'signed up', c: 'n' }, connected: { t: 'connected MT5', c: 'v' }, active: { t: 'became an active trader', c: 'g' }, inactive: { t: 'went inactive', c: 'a' },
};
export function ActivityFeed({ events, limit = 8 }: { events: PartnerEvent[]; limit?: number }) {
  const list = events.filter(e => new Date(e.at).getTime() <= Date.now()).slice(0, limit);
  return (
    <section className="v3-card pt-feed" data-testid="partner-activity">
      <div className="v3-ch"><h3>Recent activity</h3></div>
      {list.length === 0 ? <div className="d-empty"><b>Nothing yet</b>Share your link — signups and MT5 connections show up here.</div> : (
        <ul>
          {list.map((e, i) => (
            <li key={e.id} style={{ animationDelay: `${i * 40}ms` }}>
              <span className={`dot ${EV[e.kind].c}`} />
              <p><b>{e.client}</b> {EV[e.kind].t}<small>{e.channel} · {timeAgo(e.at)}</small></p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Clients table ─────────────────────────────────────────────────────────
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
/** "Mumbai, India" from a city and an ISO-2 country, tolerating either missing. */
export function place(city: string | null, country: string | null): string {
  let c = country;
  if (country && /^[A-Z]{2}$/i.test(country)) { try { c = regionNames?.of(country.toUpperCase()) ?? country; } catch { c = country; } }
  return [city, c].filter(Boolean).join(', ') || 'Location not set';
}

export function ClientRows({ clients, onUnlink }: { clients: PartnerClient[]; onUnlink?: (c: PartnerClient) => void }) {
  return (
    <div className="v3-tbl-wrap">
      <table className="v3-table pt-clients">
        <thead><tr><th>Client</th><th>Joined via</th><th>Signed up</th><th>Status</th><th className="r">Trades · 30d</th><th className="r">Lots · 30d</th><th className="r">Last active</th>{onUnlink && <th className="r"><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{clients.map(c => (
          <tr key={c.id} className="static">
            <td><div className="pt-who"><Avatar name={c.name} /><span><b>{c.name}</b><small>{place(c.city, c.country)}</small></span></div></td>
            <td><span className="pt-via">{c.channel}{c.via !== 'link' && <em>{c.via}</em>}</span></td>
            <td className="mute">{day(c.signedUpAt)}</td>
            <td><StatusPill s={c.status} /></td>
            <td className="r num">{c.status === 'SIGNED_UP' ? <span className="mute">—</span> : n(c.trades30d)}</td>
            <td className="r num">{c.status === 'SIGNED_UP' ? <span className="mute">—</span> : c.lots30d.toFixed(2)}</td>
            <td className="r mute">{c.lastActiveAt ? timeAgo(c.lastActiveAt) : '—'}</td>
            {onUnlink && <td className="r"><button type="button" className="pt-rowbtn" onClick={() => onUnlink(c)}>Unlink</button></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
