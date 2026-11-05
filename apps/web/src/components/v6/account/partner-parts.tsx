'use client';

// Building blocks shared by the partner portal (/partner/*) and the admin
// partner pages: the referral funnel, trend chart, channel table, activity
// feed and the referred-clients table. Tracking only — no money anywhere.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { ICheck, ICopy, IDownload } from '@/components/v6/icons';
import { timeAgo } from '@/components/app-shell';
import {
  PARTNER_STATUS_LABEL, STATUS_LABEL, type PartnerChannel, type PartnerClient, type PartnerDailyPoint, type PartnerEvent,
  type PartnerFunnel, type PartnerRange, type PartnerStatus, type ReferralStatus, type RangeSel, MAX_RANGE_DAYS,
} from '@/lib/partner-api';
import DateRangePicker from '@/components/v6/ui/date-range';
import { rangeText } from '@/lib/date-presets';
import '@/styles/v6/account.css';

export const RANGES: Exclude<PartnerRange, 'CUSTOM'>[] = ['7D', '30D', '90D', 'ALL'];
export type PRange = PartnerRange;
export const RANGE_LABEL: Record<PartnerRange, string> = { '7D': 'last 7 days', '30D': 'last 30 days', '90D': 'last 90 days', ALL: 'all time', CUSTOM: 'custom range' };
/** "last 30 days" or "1 Oct – 31 Oct" for a range selection. */
export const rangeLabel = (r: RangeSel): string => (typeof r === 'string' ? RANGE_LABEL[r] : rangeText(r));
/** Same, from what the API echoed back (`to` is the exclusive end). */
export const echoedRange = (range: PartnerRange, from: string | null, to: string | null): string =>
  range === 'CUSTOM' && from && to ? rangeText({ from: from.slice(0, 10), to: new Date(Date.parse(to) - 86_400_000).toISOString().slice(0, 10) }) : RANGE_LABEL[range];

export const n = (v: number) => v.toLocaleString('en-US');
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Avatar + status ───────────────────────────────────────────────────────
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className="ac-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>{ini}</span>;
}

const TONE: Record<ReferralStatus, string> = { SIGNED_UP: '', CONNECTED: 'ac-tag-c', ACTIVE: 'x-tag--g', INACTIVE: 'x-tag--r' };
export function StatusPill({ s }: { s: ReferralStatus }) {
  return <span className={`x-tag ${TONE[s]} ac-st-pill`}><i />{STATUS_LABEL[s]}</span>;
}

const PTONE: Record<PartnerStatus, string> = { ACTIVE: 'x-tag--g', PENDING: 'ac-tag-c', NEEDS_INFO: 'ac-tag-c', SUSPENDED: 'x-tag--r', REJECTED: 'x-tag--r', REVOKED: '' };
export function PartnerStatusPill({ s }: { s: PartnerStatus }) {
  return <span className={`x-tag ${PTONE[s]} ac-st-pill`}><i />{PARTNER_STATUS_LABEL[s]}</span>;
}

/** Preset chips plus a custom from–to picker (UTC days, at most a year). */
export function RangeSeg({ value, onChange, small = false }: { value: RangeSel; onChange: (r: RangeSel) => void; small?: boolean }) {
  return (
    <div className="ac-range">
      <div className={`x-seg ${small ? 'x-seg--sm' : ''}`} role="group" aria-label="Date range">
        {RANGES.map(k => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} data-testid={`range-${k}`}>{k === 'ALL' ? 'All' : k}</button>)}
      </div>
      <DateRangePicker value={typeof value === 'string' ? null : value} onChange={r => onChange({ from: r.from, to: r.to })}
        maxDays={MAX_RANGE_DAYS} note="Days run midnight to midnight UTC." />
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', className = 'x-btn', testId }: { text: string; label?: string; className?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`${className} ${done ? 'ac-copied' : ''}`} data-testid={testId}
      onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1600); }}>
      {done ? <ICheck size={15} /> : <ICopy size={15} />}{done ? 'Copied' : label}
    </button>
  );
}

// ── Funnel ────────────────────────────────────────────────────────────────
export function Funnel({ f, rule, title = 'Your funnel' }: { f: PartnerFunnel; rule: { minTrades: number; windowDays: number }; title?: string }) {
  const steps: { l: string; v: number; sub: ReactNode; conv: number | null; hint?: string }[] = [
    { l: 'Link clicks', v: f.clicks, sub: <>Times the link was opened</>, conv: null },
    { l: 'Signed up', v: f.signups, sub: f.clicks ? <>{pct(f.converted, f.clicks)} of clicks convert</> : <>No link clicks yet</>, conv: f.clicks ? f.converted / f.clicks : 0,
      hint: 'Signups include people who typed your code. The % counts only clicks that led to a signup.' },
    { l: 'MT5 connected', v: f.connected, sub: f.signups ? <>{pct(f.connected, f.signups)} of signups</> : <>No signups yet</>, conv: f.signups ? f.connected / f.signups : 0 },
    { l: 'Active traders', v: f.active, sub: f.connected ? <>{pct(f.active, f.connected)} of connected</> : <>None connected yet</>, conv: f.connected ? f.active / f.connected : 0,
      hint: `Active = ${rule.minTrades}+ closed trades in the last ${rule.windowDays} days, counted from their synced MT5 history.` },
  ];
  return (
    <section className="x-card" aria-label="Referral funnel" data-testid="partner-funnel">
      <div className="x-ch"><h2>{title}</h2><span className="x-sub">{echoedRange(f.range, f.from, f.to)}</span></div>
      <ol className="ac-funnel">
        {steps.map(s => (
          <li key={s.l}>
            <span className="l">{s.l}{s.hint && <abbr title={s.hint} aria-label={s.hint}>?</abbr>}</span>
            <b className={`m ${s.v === 0 ? 'x-dim' : ''}`}>{n(s.v)}</b>
            <span className="s">{s.sub}</span>
            <span className="x-bar"><i style={{ width: `${s.conv == null ? 100 : Math.max(s.conv * 100, s.v ? 2 : 0)}%` }} /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────
type Metric = 'clicks' | 'signups' | 'active';

function TrendLine({ pts, label, fmt }: { pts: number[]; label: (i: number) => string; fmt: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState<number | null>(null);
  const H = 220;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(...pts, 1);
  const x = (i: number) => (pts.length < 2 ? w / 2 : (i / (pts.length - 1)) * w);
  const y = (v: number) => 10 + (1 - v / (max * 1.1)) * (H - 20);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div ref={ref} className="ac-trend" style={{ height: H }}
      onPointerMove={e => { const r = ref.current!.getBoundingClientRect(); setH(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))))); }}
      onPointerLeave={() => setH(null)}>
      {w > 0 && (
        <svg width={w} height={H} aria-hidden>
          {[0.25, 0.5, 0.75].map(t => <line key={t} x1={0} x2={w} y1={H * t} y2={H * t} stroke="var(--grid)" />)}
          <path d={`${d} L${x(pts.length - 1)},${H} L${x(0)},${H}Z`} fill="var(--g-soft)" />
          <path d={d} fill="none" stroke="var(--g)" strokeWidth={2} strokeLinejoin="round" />
          {h != null && <>
            <line x1={x(h)} x2={x(h)} y1={0} y2={H} stroke="var(--line-2)" strokeDasharray="3 3" />
            <circle cx={x(h)} cy={y(pts[h]!)} r={4} fill="var(--s1)" stroke="var(--g)" strokeWidth={2} />
          </>}
        </svg>
      )}
      {h != null && w > 0 && (
        <div className={`ac-tip ${x(h) > w * 0.7 ? 'l' : ''}`} style={{ left: x(h), top: Math.max(0, y(pts[h]!) - 56) }}>
          <span>{label(h)}</span><b className="m">{fmt(pts[h]!)}</b>
        </div>
      )}
    </div>
  );
}

export function TrendCard({ daily }: { daily: PartnerDailyPoint[] }) {
  const [m, setM] = useState<Metric>('signups');
  const pts = useMemo(() => daily.map(d => (m === 'clicks' ? d.clicks : m === 'signups' ? d.clients : d.active)), [m, daily]);
  const label = (i: number) => new Date(`${daily[i]!.date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmt = (v: number) => (m === 'clicks' ? `${n(v)} clicks` : m === 'signups' ? `${n(v)} clients` : `${n(v)} active`);
  const has = pts.some(v => v > 0);
  return (
    <section className="x-card ac-trend-card" data-testid="partner-trend">
      <div className="x-ch">
        <h2>{m === 'clicks' ? 'Clicks per day' : m === 'signups' ? 'Total clients' : 'Active traders'}</h2>
        <div className="x-r">
          <div className="x-seg x-seg--sm" role="group" aria-label="Metric">
            {([['signups', 'Clients'], ['active', 'Active'], ['clicks', 'Clicks']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={m === k} onClick={() => setM(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      {has && daily.length > 1
        ? <>
          <TrendLine pts={pts} label={label} fmt={fmt} />
          <div className="ac-axis"><span>{label(0)}</span><span>{label(Math.floor((daily.length - 1) / 2))}</span><span>{label(daily.length - 1)}</span></div>
        </>
        : has
          ? <div className="x-empty ac-trend-empty"><b>A trend needs two days</b><p>This range has one day so far. Its numbers are in the funnel above.</p></div>
          : <div className="x-empty ac-trend-empty"><b>No {m === 'clicks' ? 'clicks' : m === 'signups' ? 'clients' : 'active traders'} in this range</b><p>The line starts once the first one lands.</p></div>}
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
    <div className="ac-share">
      {shareLinks(url).map(s => <a key={s.l} href={s.href} target="_blank" rel="noopener noreferrer" className="x-btn x-btn--sm">{s.icon}{s.l}</a>)}
    </div>
  );
}

/** QR codes stay dark-on-white in both themes so every phone camera can read them. */
export function Qr({ url, size = 132, id }: { url: string; size?: number; id: string }) {
  return (
    <div className="ac-qr">
      <span className="ac-qr-box"><QRCodeCanvas id={id} value={url} size={size * 2} style={{ width: size, height: size }} fgColor="black" bgColor="white" level="M" /></span>
      <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => {
        const c = document.getElementById(id) as HTMLCanvasElement | null;
        if (!c) return;
        const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'tradelogs-referral-qr.png'; a.click();
      }}><IDownload size={14} /> Download QR</button>
    </div>
  );
}

export function LinkBox({ url, testId }: { url: string; testId?: string }) {
  return (
    <div className="ac-linkbox">
      <span className="m" title={url}>{url.replace(/^https:\/\//, '')}</span>
      <CopyButton text={url} label="Copy link" className="x-btn x-btn--hi x-btn--sm" testId={testId} />
    </div>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────
export function ChannelTable({ channels, right, withLinks = false, onArchive }: { channels: PartnerChannel[]; right?: ReactNode; withLinks?: boolean; onArchive?: (c: PartnerChannel) => void }) {
  const best = Math.max(...channels.map(c => c.signups), 1);
  return (
    <section className="x-card" data-testid="partner-channels">
      <div className="x-ch"><h2>By channel</h2><span className="x-sub">all time</span>{right && <div className="x-r">{right}</div>}</div>
      <div className="x-tblwrap ac-scroll">
        <table className={`x-tbl ac-tbl ac-cht ${withLinks ? 'lk' : ''}`}>
          <thead><tr><th>Channel</th>{withLinks && <th>Link</th>}<th className="n">Clicks</th><th className="n">Signups</th><th className="n">Click to signup</th><th className="n">MT5 connected</th><th className="n">Active</th>{onArchive && <th className="n"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{channels.map(c => (
            <tr key={c.id}>
              <td><div className="ac-chn"><b>{c.label}</b><span className="x-bar"><i style={{ width: `${(c.signups / best) * 100}%` }} /></span></div></td>
              {withLinks && <td><div className="ac-chlink"><code className="m">{c.url.replace(/^https:\/\//, '')}</code><CopyButton text={c.url} label="Copy" className="x-btn x-btn--sm" /></div></td>}
              <td className="n m">{n(c.clicks)}</td>
              <td className="n m ac-strong">{n(c.signups)}</td>
              <td className="n m x-muted">{pct(c.converted, c.clicks)}</td>
              <td className="n m">{n(c.connected)}</td>
              <td className={`n m ${c.active > 0 ? 'pos' : 'x-dim'}`}>{n(c.active)}</td>
              {onArchive && <td className="n">{c.slug ? <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => onArchive(c)}>Archive</button> : <span className="x-dim">Default</span>}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────
const EV: Record<PartnerEvent['kind'], { t: string; c: string }> = {
  signup: { t: 'signed up', c: 'x-dot--off' }, connected: { t: 'connected MT5', c: 'ac-dot-c' }, active: { t: 'became an active trader', c: '' }, inactive: { t: 'went inactive', c: 'x-dot--r' },
};
export function ActivityFeed({ events, limit = 8, empty = 'Share your link — signups and MT5 connections show up here.' }: { events: PartnerEvent[]; limit?: number; empty?: string }) {
  const list = events.filter(e => new Date(e.at).getTime() <= Date.now()).slice(0, limit);
  return (
    <section className="x-card" data-testid="partner-activity">
      <div className="x-ch"><h2>Recent activity</h2></div>
      {list.length === 0 ? <div className="x-empty"><b>Nothing yet</b><p>{empty}</p></div> : (
        <ul className="ac-feed">
          {list.map(e => (
            <li key={e.id}>
              <i className={`x-dot ${EV[e.kind].c}`} />
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
    <div className="x-tblwrap ac-scroll">
      <table className="x-tbl ac-tbl ac-clients">
        <thead><tr><th>Client</th><th>Joined via</th><th>Signed up</th><th>Status</th><th className="n">Trades, 30d</th><th className="n">Lots, 30d</th><th className="n">Last active</th>{onUnlink && <th className="n"><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{clients.map(c => (
          <tr key={c.id}>
            <td><div className="ac-who"><Avatar name={c.name} /><span><b>{c.name}</b><small>{place(c.city, c.country)}</small></span></div></td>
            <td><span className="ac-via">{c.channel}{c.via !== 'link' && <span className="x-tag">{c.via}</span>}</span></td>
            <td className="x-muted">{day(c.signedUpAt)}</td>
            <td><StatusPill s={c.status} /></td>
            <td className="n m">{c.status === 'SIGNED_UP' ? <span className="x-dim">—</span> : n(c.trades30d)}</td>
            <td className="n m">{c.status === 'SIGNED_UP' ? <span className="x-dim">—</span> : c.lots30d.toFixed(2)}</td>
            <td className="n x-muted">{c.lastActiveAt ? timeAgo(c.lastActiveAt) : '—'}</td>
            {onUnlink && <td className="n"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => onUnlink(c)}>Unlink</button></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
