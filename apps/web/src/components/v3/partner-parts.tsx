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
  STATUS_LABEL, type PartnerChannel, type PartnerClient, type PartnerEvent, type PartnerOverview, type ReferralStatus,
} from '@/lib/partner-api';

const DAY = 86_400_000;
export const RANGES = [['7D', 7], ['30D', 30], ['90D', 90], ['ALL', 0]] as const;
export type PRange = (typeof RANGES)[number][0];

export const n = (v: number) => v.toLocaleString('en-US');
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Funnel numbers for a range: clicks in range, and the clients who signed up in it. */
export function funnelFor(o: Pick<PartnerOverview, 'daily' | 'clients'>, range: PRange) {
  const days = RANGES.find(r => r[0] === range)![1];
  const from = days ? Date.now() - days * DAY : 0;
  const clients = o.clients.filter(c => new Date(c.signedUpAt).getTime() >= from);
  return {
    clicks: o.daily.filter(d => new Date(d.date).getTime() >= from - DAY / 2).reduce((a, b) => a + b.clicks, 0),
    signups: clients.length,
    connected: clients.filter(c => c.status !== 'SIGNED_UP').length,
    active: clients.filter(c => c.status === 'ACTIVE').length,
    clients,
    from,
  };
}

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
export function Funnel({ f, rule, rangeLabel, title = 'Your funnel' }: { f: { clicks: number; signups: number; connected: number; active: number }; rule: { minTrades: number; windowDays: number }; rangeLabel: string; title?: string }) {
  const steps: { l: string; v: number; sub: ReactNode; conv: number | null; hint?: string }[] = [
    { l: 'Link clicks', v: f.clicks, sub: <>Times the link was opened</>, conv: null },
    { l: 'Signed up', v: f.signups, sub: <>{pct(f.signups, f.clicks)} of clicks</>, conv: f.clicks ? f.signups / f.clicks : 0 },
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
export function TrendCard({ o, from }: { o: Pick<PartnerOverview, 'daily' | 'clients'>; from: number }) {
  const [m, setM] = useState<Metric>('signups');
  const days = useMemo(() => o.daily.filter(d => new Date(d.date).getTime() >= from - DAY / 2), [o.daily, from]);
  const pts = useMemo(() => {
    if (m === 'clicks') return days.map(d => d.clicks);
    const key = (iso: string) => iso.slice(0, 10);
    const per = new Map<string, number>();
    for (const c of o.clients) {
      if (m === 'active' && c.status !== 'ACTIVE') continue;
      const k = key(m === 'active' ? (c.connectedAt ?? c.signedUpAt) : c.signedUpAt);
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    // Running total of clients, so the line reads as "how big my base is".
    let run = o.clients.filter(c => (m !== 'active' || c.status === 'ACTIVE') && new Date(m === 'active' ? (c.connectedAt ?? c.signedUpAt) : c.signedUpAt).getTime() < new Date(days[0]?.date ?? 0).getTime()).length;
    return days.map(d => (run += per.get(key(d.date)) ?? 0));
  }, [m, days, o.clients]);
  const label = (i: number) => new Date(days[i]!.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
      {days.length > 1 && <div className="pt-axis"><span>{label(0)}</span><span>{label(Math.floor((days.length - 1) / 2))}</span><span>{label(days.length - 1)}</span></div>}
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
export function ChannelTable({ channels, right, withLinks = false }: { channels: PartnerChannel[]; right?: ReactNode; withLinks?: boolean }) {
  const best = Math.max(...channels.map(c => c.signups), 1);
  return (
    <section className="v3-card a-flush pt-ch" data-testid="partner-channels">
      <div className="v3-ch"><h3>By channel<span> · all time</span></h3>{right}</div>
      <div className="v3-tbl-wrap">
        <table className="v3-table">
          <thead><tr><th>Channel</th>{withLinks && <th>Link</th>}<th className="r">Clicks</th><th className="r">Signups</th><th className="r">Click → signup</th><th className="r">MT5 connected</th><th className="r">Active</th></tr></thead>
          <tbody>{channels.map(c => (
            <tr key={c.id} className="static">
              <td><div className="pt-chn"><b>{c.label}</b><span className="bar"><i style={{ width: `${(c.signups / best) * 100}%` }} /></span></div></td>
              {withLinks && <td><div className="pt-chlink"><code>{c.url.replace(/^https:\/\//, '')}</code><CopyButton text={c.url} label="Copy" className="v3-btn v3-btn--o pt-copy-sm" /></div></td>}
              <td className="r num">{n(c.clicks)}</td>
              <td className="r num" style={{ fontWeight: 700 }}>{n(c.signups)}</td>
              <td className="r"><span className="v3-pill v num">{pct(c.signups, c.clicks)}</span></td>
              <td className="r num">{n(c.connected)}</td>
              <td className="r num lg">{n(c.active)}</td>
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
export function ClientRows({ clients }: { clients: PartnerClient[] }) {
  return (
    <div className="v3-tbl-wrap">
      <table className="v3-table pt-clients">
        <thead><tr><th>Client</th><th>Joined via</th><th>Signed up</th><th>Status</th><th className="r">Trades · 30d</th><th className="r">Lots · 30d</th><th className="r">Last active</th></tr></thead>
        <tbody>{clients.map(c => (
          <tr key={c.id} className="static">
            <td><div className="pt-who"><Avatar name={c.name} /><span><b>{c.name}</b><small>{c.city}, {c.country}</small></span></div></td>
            <td><span className="pt-via">{c.channel}{c.via === 'code' && <em>code</em>}</span></td>
            <td className="mute">{day(c.signedUpAt)}</td>
            <td><StatusPill s={c.status} /></td>
            <td className="r num">{c.status === 'SIGNED_UP' ? <span className="mute">—</span> : n(c.trades30d)}</td>
            <td className="r num">{c.status === 'SIGNED_UP' ? <span className="mute">—</span> : c.lots30d.toFixed(2)}</td>
            <td className="r mute">{c.lastActiveAt ? timeAgo(c.lastActiveAt) : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
