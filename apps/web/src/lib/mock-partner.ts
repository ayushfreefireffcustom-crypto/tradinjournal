// In-memory mock of the partner programme API (NEXT_PUBLIC_USE_MOCKS=true). Mirrors
// the real endpoints' shapes and rules closely enough to build the UI against.
// Seeded per partner so reloads look the same; dates are anchored to "today".
import type {
  AdminPartnerDetail, AdminPartnerRow, ClientsQuery, PartnerChannel, PartnerClick, PartnerClient, PartnerClientCounts,
  PartnerCode, PartnerDailyPoint, PartnerEvent, PartnerLinks, PartnerNote, PartnerOverview, PartnerProfile, PartnerRange,
  PartnerStatus, ReferralStatus, ReferrerLookup, ReservedCode, StatusAction,
} from '@/lib/partner-api';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const iso = (t: number) => new Date(t).toISOString();
const BASE = 'https://tradelogs.com/r/';
const RULE = { minTrades: 2, windowDays: 7 };
const COOKIE_DAYS = 30, MAX_CHANNELS = 10, MAX_CODES = 3;
const ME = 'admin@tradelogs.com';

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Arjun', 'Kabir', 'Rohit', 'Priya', 'Ananya', 'Sneha', 'Neha', 'Karan', 'Rahul', 'Vikram', 'Meera', 'Sanya', 'Aman', 'Yash', 'Dev', 'Riya', 'Tanvi', 'Harsh', 'Nikhil', 'Pooja', 'Siddharth', 'Kunal', 'Divya', 'Manav', 'Ayesha', 'Farhan', 'Imran', 'Zoya', 'Omar', 'Bilal', 'Sara', 'Hamza'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Gupta', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Mehta', 'Kapoor', 'Malhotra', 'Bose', 'Das', 'Khan', 'Shaikh', 'Agarwal', 'Chopra', 'Rao', 'Pillai', 'Siddiqui', 'Qureshi'];
const PLACES: [string, string][] = [['IN', 'Mumbai'], ['IN', 'Delhi'], ['IN', 'Bengaluru'], ['IN', 'Pune'], ['IN', 'Hyderabad'], ['IN', 'Raipur'], ['IN', 'Jaipur'], ['IN', 'Ahmedabad'], ['IN', 'Kolkata'], ['IN', 'Chennai'], ['PK', 'Lahore'], ['PK', 'Karachi'], ['BD', 'Dhaka'], ['NP', 'Kathmandu'], ['LK', 'Colombo']];

interface Spec {
  id: string; name: string; email: string; code: string; status: PartnerStatus; sinceDays: number; audience: string;
  seed: number; clients: number; clicksPerDay: number; channels: { label: string; slug: string; w: number }[];
}
const SPECS: Spec[] = [
  { id: 'p_rohan', name: 'Rohan Mehta', email: 'rohan@rohanfx.in', code: 'ROHANFX', status: 'ACTIVE', sinceDays: 97, audience: 'Telegram · 18k members', seed: 11, clients: 96, clicksPerDay: 13,
    channels: [{ label: 'Telegram group', slug: 'telegram-group', w: 0.45 }, { label: 'YouTube', slug: 'youtube', w: 0.25 }, { label: 'Instagram bio', slug: 'instagram-bio', w: 0.15 }, { label: 'Direct link', slug: '', w: 0.15 }] },
  { id: 'p_sana', name: 'Sana Qureshi', email: 'sana@tradewithsana.com', code: 'SANA', status: 'ACTIVE', sinceDays: 140, audience: 'YouTube · 42k subscribers', seed: 23, clients: 142, clicksPerDay: 22,
    channels: [{ label: 'YouTube', slug: 'youtube', w: 0.6 }, { label: 'Instagram bio', slug: 'instagram-bio', w: 0.25 }, { label: 'Direct link', slug: '', w: 0.15 }] },
  { id: 'p_pipsquad', name: 'Arjun Rao', email: 'arjun@pipsquad.in', code: 'PIPSQUAD', status: 'ACTIVE', sinceDays: 75, audience: 'Telegram · 9k members', seed: 37, clients: 61, clicksPerDay: 9,
    channels: [{ label: 'Telegram channel', slug: 'telegram-channel', w: 0.7 }, { label: 'Direct link', slug: '', w: 0.3 }] },
  { id: 'p_meera', name: 'Meera Iyer', email: 'meera.iyer@gmail.com', code: 'MEERA10', status: 'ACTIVE', sinceDays: 52, audience: 'Instagram · 15k followers', seed: 41, clients: 34, clicksPerDay: 7,
    channels: [{ label: 'Instagram bio', slug: 'instagram-bio', w: 0.75 }, { label: 'Direct link', slug: '', w: 0.25 }] },
  { id: 'p_fxdesk', name: 'Hamza Siddiqui', email: 'team@fxdesklhr.pk', code: 'FXDESK', status: 'SUSPENDED', sinceDays: 120, audience: 'Trading academy', seed: 53, clients: 28, clicksPerDay: 3,
    channels: [{ label: 'Course portal', slug: 'course-portal', w: 0.8 }, { label: 'Direct link', slug: '', w: 0.2 }] },
  { id: 'p_kabir', name: 'Kabir Singh', email: 'kabir.trades@gmail.com', code: 'KABIR', status: 'ACTIVE', sinceDays: 31, audience: 'X · 6k followers', seed: 67, clients: 14, clicksPerDay: 5,
    channels: [{ label: 'X / Twitter', slug: 'x-twitter', w: 0.8 }, { label: 'Direct link', slug: '', w: 0.2 }] },
  { id: 'p_nisha', name: 'Nisha Bose', email: 'nisha@chartschool.in', code: 'CHARTSCHOOL', status: 'PENDING', sinceDays: 2, audience: 'YouTube · 27k subscribers', seed: 71, clients: 0, clicksPerDay: 0,
    channels: [{ label: 'Direct link', slug: '', w: 1 }] },
  { id: 'p_tanvir', name: 'Tanvir Ahmed', email: 'tanvir.fx@gmail.com', code: 'TANVIR', status: 'PENDING', sinceDays: 1, audience: 'Telegram · 4k members', seed: 79, clients: 0, clicksPerDay: 0,
    channels: [{ label: 'Direct link', slug: '', w: 1 }] },
];

interface Client extends PartnerClient { channelId: string; code: string; firstActiveAt: string | null; inactiveAt: string | null; email: string }
interface Click { id: string; at: number; channelId: string; code: string; device: PartnerClick['device']; country: string | null; converted: boolean }
interface State {
  id: string; userId: string; name: string; email: string; status: PartnerStatus; audience: string | null;
  createdAt: string; approvedAt: string | null;
  codes: { id: string; code: string; isPrimary: boolean; createdAt: string }[];
  channels: { id: string; label: string; slug: string; archived: boolean; createdAt: string }[];
  clicks: Click[]; clients: Client[]; notes: PartnerNote[];
}

function pick<T>(r: () => number, xs: T[]): T { return xs[Math.floor(r() * xs.length)]!; }
function weighted<T extends { w: number }>(r: () => number, xs: T[]): T {
  let x = r() * xs.reduce((s, c) => s + c.w, 0);
  for (const c of xs) { x -= c.w; if (x <= 0) return c; }
  return xs[xs.length - 1]!;
}

function build(s: Spec): State {
  const r = rng(s.seed);
  const t0 = today();
  const since = t0 - s.sinceDays * DAY;
  const channels = s.channels.map((c, i) => ({ id: `${s.id}_ch${i}`, label: c.label, slug: c.slug, archived: false, createdAt: iso(since + i * 3 * DAY) }));
  const chOf = (label: string) => channels.find(c => c.label === label)!;
  const clicks: Click[] = [];
  const spikes = new Set(Array.from({ length: 4 }, () => Math.floor(r() * s.sinceDays)));
  for (let d = s.sinceDays; d >= 0; d--) {
    const growth = 0.6 + 0.8 * (1 - d / Math.max(s.sinceDays, 1));
    let n = s.clicksPerDay ? Math.round(s.clicksPerDay * growth * (0.55 + r() * 0.9)) : 0;
    if (spikes.has(d) && s.clicksPerDay) n += Math.round(s.clicksPerDay * (2 + r() * 3));
    if (s.status === 'SUSPENDED' && d < 21) n = 0;
    for (let i = 0; i < n; i++) {
      const at = Math.min(Date.now() - 60_000, t0 - d * DAY + Math.floor(r() * DAY));
      const ch = chOf(weighted(r, s.channels).label);
      clicks.push({ id: `${s.id}_k${clicks.length}`, at, channelId: ch.id, code: s.code, device: r() < 0.78 ? 'Mobile' : r() < 0.85 ? 'Desktop' : 'Tablet', country: pick(r, PLACES)[0], converted: false });
    }
  }
  clicks.sort((a, b) => a.at - b.at);
  const used = new Set<string>();
  const clients: Client[] = [];
  const target = Math.min(s.clients, clicks.length);
  while (clients.length < target) {
    const click = clicks[Math.floor(r() * clicks.length)]!;
    if (click.converted) continue;
    click.converted = true;
    const signedUp = Math.min(Date.now() - 30_000, click.at + Math.floor(r() * 3_600_000));
    let name = '';
    do { name = `${pick(r, FIRST)} ${pick(r, LAST)}`; } while (used.has(name));
    used.add(name);
    const [country, city] = pick(r, PLACES);
    const age = (Date.now() - signedUp) / DAY;
    let status: ReferralStatus = 'SIGNED_UP', connectedAt: number | null = null, firstActiveAt: number | null = null, inactiveAt: number | null = null;
    if (r() < (age < 2 ? 0.35 : 0.62)) {
      connectedAt = Math.min(Date.now() - 120_000, signedUp + Math.floor(r() * Math.min(age, 4) * DAY));
      const roll = r();
      status = age < 3 ? (roll < 0.45 ? 'ACTIVE' : 'CONNECTED') : roll < 0.68 ? 'ACTIVE' : roll < 0.85 ? 'INACTIVE' : 'CONNECTED';
      if (status !== 'CONNECTED') firstActiveAt = connectedAt + Math.min(2 * DAY, (Date.now() - connectedAt) / 2);
      if (status === 'INACTIVE') inactiveAt = Math.max(firstActiveAt! + DAY, Date.now() - Math.floor((2 + r() * 20) * DAY));
    }
    const span = connectedAt ? Math.min(30, Math.max(1, (Date.now() - connectedAt) / DAY)) / 30 : 0;
    const trades30d = status === 'ACTIVE' ? Math.max(3, Math.round((8 + r() * 52) * span)) : status === 'SIGNED_UP' ? 0 : Math.floor(r() * 3);
    const lastActive = status === 'ACTIVE' ? Date.now() - Math.floor(r() * 3 * DAY) : status === 'INACTIVE' ? inactiveAt! - 7 * DAY : connectedAt;
    clients.push({
      id: `${s.id}_c${clients.length}`, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`, city, country,
      channelId: click.channelId, channel: '', via: r() < 0.82 ? 'link' : 'code', code: s.code,
      signedUpAt: iso(signedUp), connectedAt: connectedAt ? iso(connectedAt) : null, status,
      trades30d, lots30d: Math.round(trades30d * (0.02 + r() * 0.45) * 100) / 100,
      lastActiveAt: lastActive ? iso(Math.min(lastActive, Date.now() - 60_000)) : null, firstActiveAt: firstActiveAt ? iso(firstActiveAt) : null, inactiveAt: inactiveAt ? iso(inactiveAt) : null,
    });
  }
  const createdAt = iso(since);
  return {
    id: s.id, userId: `u_${s.id}`, name: s.name, email: s.email, status: s.status, audience: s.audience,
    createdAt, approvedAt: s.status === 'PENDING' ? null : createdAt,
    codes: [{ id: `${s.id}_code0`, code: s.code, isPrimary: true, createdAt }], channels, clicks, clients,
    notes: s.status === 'PENDING' ? [] : [{ id: `${s.id}_n0`, body: 'Partner created by admin.', authorEmail: ME, createdAt }],
  };
}

// ── State (per server process, rebuilt each day) ─────────────────────────────

let STATE: { day: number; partners: State[]; reserved: ReservedCode[] } | null = null;
function db() {
  if (!STATE || STATE.day !== today()) STATE = { day: today(), partners: SPECS.map(build), reserved: [] };
  return STATE;
}
const me = () => db().partners[0]!; // the signed-in mock user is Rohan

// ── Read models (same maths as the API) ──────────────────────────────────────

const chLabel = (p: State, id: string) => p.channels.find(c => c.id === id)?.label ?? 'Direct link';
const primary = (p: State) => p.codes.find(c => c.isPrimary)?.code ?? '';
const url = (code: string, slug?: string) => `${BASE}${code}${slug ? `?ch=${slug}` : ''}`;
const toClient = (p: State, c: Client): PartnerClient => ({
  id: c.id, name: c.name, city: c.city, country: c.country, channel: chLabel(p, c.channelId), via: c.via,
  signedUpAt: c.signedUpAt, connectedAt: c.connectedAt, status: c.status, trades30d: c.trades30d, lots30d: c.lots30d, lastActiveAt: c.lastActiveAt,
});
const profile = (p: State): PartnerProfile => ({ id: p.id, name: p.name, status: p.status, code: primary(p), since: p.approvedAt ?? p.createdAt, activeRule: RULE, cookieDays: COOKIE_DAYS });
function rangeFrom(range: PartnerRange, p: State): number | null {
  const days = { '7D': 7, '30D': 30, '90D': 90, ALL: 0 }[range];
  if (!days) return null;
  return Math.max(Date.now() - days * DAY, Date.parse(p.approvedAt ?? p.createdAt));
}
function channels(p: State): PartnerChannel[] {
  const code = primary(p);
  return p.channels.filter(c => !c.archived).map(c => {
    const mine = p.clients.filter(x => x.channelId === c.id);
    return {
      id: c.id, label: c.label, slug: c.slug || null, url: url(code, c.slug), clicks: p.clicks.filter(k => k.channelId === c.id).length,
      converted: p.clicks.filter(k => k.channelId === c.id && k.converted).length,
      signups: mine.length, connected: mine.filter(x => x.connectedAt).length, active: mine.filter(x => x.status === 'ACTIVE').length, createdAt: c.createdAt,
    };
  }).sort((a, b) => b.signups - a.signups || b.clicks - a.clicks);
}
function overviewOf(p: State, range: PartnerRange): PartnerOverview {
  const from = rangeFrom(range, p);
  const inRange = (t: number) => from === null || t >= from;
  const cl = p.clients.filter(c => inRange(Date.parse(c.signedUpAt)));
  const start = new Date(from ?? Date.parse(p.approvedAt ?? p.createdAt));
  const keys: string[] = [];
  for (let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); t <= today(); t += DAY) keys.push(iso(t).slice(0, 10));
  let clients = p.clients.filter(c => c.signedUpAt.slice(0, 10) < keys[0]!).length;
  let active = p.clients.filter(c => c.status === 'ACTIVE' && c.firstActiveAt && c.firstActiveAt.slice(0, 10) < keys[0]!).length;
  const daily: PartnerDailyPoint[] = keys.map(date => {
    const signups = p.clients.filter(c => c.signedUpAt.startsWith(date)).length;
    clients += signups;
    active += p.clients.filter(c => c.status === 'ACTIVE' && c.firstActiveAt?.startsWith(date)).length;
    return { date, clicks: p.clicks.filter(k => iso(k.at).startsWith(date)).length, signups, clients, active };
  });
  const now = iso(Date.now());
  const events: PartnerEvent[] = p.clients.flatMap(c => {
    const channel = chLabel(p, c.channelId);
    const out: PartnerEvent[] = [{ id: `${c.id}:signup`, at: c.signedUpAt, kind: 'signup', client: c.name, channel }];
    if (c.connectedAt) out.push({ id: `${c.id}:connected`, at: c.connectedAt, kind: 'connected', client: c.name, channel });
    if (c.status === 'ACTIVE' && c.firstActiveAt) out.push({ id: `${c.id}:active`, at: c.firstActiveAt, kind: 'active', client: c.name, channel });
    if (c.status === 'INACTIVE' && c.inactiveAt) out.push({ id: `${c.id}:inactive`, at: c.inactiveAt, kind: 'inactive', client: c.name, channel });
    return out;
  }).filter(e => e.at <= now).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  const sorted = [...p.clients].sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt));
  return {
    partner: profile(p),
    funnel: { range, from: from ? iso(from) : null, clicks: p.clicks.filter(k => inRange(k.at)).length, converted: p.clicks.filter(k => inRange(k.at) && k.converted).length, signups: cl.length, connected: cl.filter(c => c.connectedAt).length, active: cl.filter(c => c.status === 'ACTIVE').length },
    daily, channels: channels(p), activity: events, recentClients: sorted.slice(0, 6).map(c => toClient(p, c)), totalClients: p.clients.length,
  };
}
function counts(p: State): PartnerClientCounts {
  const n = (s: ReferralStatus) => p.clients.filter(c => c.status === s).length;
  return { all: p.clients.length, SIGNED_UP: n('SIGNED_UP'), CONNECTED: n('CONNECTED'), ACTIVE: n('ACTIVE'), INACTIVE: n('INACTIVE') };
}
function clientsOf(p: State, q: ClientsQuery) {
  const term = q.q?.trim().toLowerCase();
  let list = p.clients.filter(c => (!q.status || c.status === q.status) && (!q.channel || c.channelId === q.channel)
    && (!term || `${c.name} ${c.city} ${c.country}`.toLowerCase().includes(term)));
  list = q.sort === 'trades' ? list.sort((a, b) => b.trades30d - a.trades30d) : q.sort === 'name' ? list.sort((a, b) => a.name.localeCompare(b.name)) : list.sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt));
  const page = Math.max(1, Number(q.page) || 1), pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 12));
  return { data: { items: list.slice((page - 1) * pageSize, page * pageSize).map(c => toClient(p, c)), counts: counts(p) }, meta: { page, pageSize, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / pageSize)) } };
}
function codesOf(p: State): PartnerCode[] {
  return p.codes.map(c => ({ id: c.id, code: c.code, isPrimary: c.isPrimary, url: url(c.code), clicks: p.clicks.filter(k => k.code === c.code).length, signups: p.clients.filter(x => x.code === c.code).length, createdAt: c.createdAt }));
}
function linksOf(p: State): PartnerLinks {
  return {
    partner: profile(p), baseUrl: url(primary(p)), codes: codesOf(p), channels: channels(p),
    recentClicks: [...p.clicks].sort((a, b) => b.at - a.at).slice(0, 15).map(k => ({ id: k.id, at: iso(k.at), channel: chLabel(p, k.channelId), device: k.device, country: k.country, converted: k.converted })),
    totals: { clicks: p.clicks.length, converted: p.clicks.filter(k => k.converted).length, signups: p.clients.length },
    limits: { maxChannels: MAX_CHANNELS, maxCodes: MAX_CODES },
  };
}
function row(p: State): AdminPartnerRow {
  const since = Date.now() - 30 * DAY;
  return {
    id: p.id, userId: p.userId, name: p.name, email: p.email, code: primary(p) || null, status: p.status, joinedAt: p.createdAt, approvedAt: p.approvedAt, audience: p.audience,
    clicks30d: p.clicks.filter(k => k.at >= since).length, converted30d: p.clicks.filter(k => k.at >= since && k.converted).length, signups30d: p.clients.filter(c => Date.parse(c.signedUpAt) >= since).length,
    clients: p.clients.length, connected: p.clients.filter(c => c.connectedAt).length, active: p.clients.filter(c => c.status === 'ACTIVE').length,
  };
}

// ── Router ───────────────────────────────────────────────────────────────────

class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const conflict = (m: string) => new HttpError(409, 'CONFLICT', m);
const notFound = (m = 'Not found') => new HttpError(404, 'NOT_FOUND', m);
const invalid = (m: string) => new HttpError(422, 'VALIDATION_ERROR', m);
const CODE_RE = /^[A-Z0-9_-]{3,20}$/;
const RESERVED = /^(ADMIN|API|LOGIN|SIGNUP|PARTNER|SUPPORT|TERMS|PRIVACY|ELEFIN)$|TRADELOG|OFFICIAL/;
function codeOrThrow(raw: unknown): string {
  const c = String(raw ?? '').trim().toUpperCase();
  if (!CODE_RE.test(c)) throw invalid('Codes are 3–20 letters, numbers, hyphens or underscores.');
  if (RESERVED.test(c) || db().reserved.some(r => r.code === c)) throw conflict('That code is reserved.');
  if (db().partners.some(p => p.codes.some(x => x.code === c))) throw conflict('That code is already taken.');
  return c;
}
function partnerById(id: string): State {
  const p = db().partners.find(x => x.id === id);
  if (!p) throw notFound('Partner not found');
  return p;
}
const note = (p: State, body: string) => p.notes.unshift({ id: `n${Date.now()}${Math.random()}`, body, authorEmail: ME, createdAt: iso(Date.now()) });
const slugify = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'channel';

type Res = { status: number; body?: unknown };
const okR = (data: unknown, meta?: unknown): Res => ({ status: 200, body: meta ? { data, meta } : { data } });
const created = (data: unknown): Res => ({ status: 201, body: { data } });
const none: Res = { status: 204 };

const TRANSITIONS: Record<StatusAction, [PartnerStatus[], PartnerStatus, string]> = {
  approve: [['PENDING'], 'ACTIVE', 'Approved'], decline: [['PENDING'], 'REVOKED', 'Application declined'],
  suspend: [['ACTIVE'], 'SUSPENDED', 'Suspended'], reinstate: [['SUSPENDED', 'REVOKED'], 'ACTIVE', 'Reinstated'],
  revoke: [['ACTIVE', 'SUSPENDED', 'PENDING'], 'REVOKED', 'Partner status revoked'],
};

export function handlePartnerMock(method: string, seg: string[], q: URLSearchParams, body: Record<string, unknown>): Res {
  try {
    const [a, b, c, d, e] = seg;
    const range = (q.get('range') ?? '30D') as PartnerRange;
    const cq = Object.fromEntries(q.entries()) as unknown as ClientsQuery;

    if (a === 'referrals' && b === 'check') {
      const code = (q.get('code') ?? '').trim().toUpperCase();
      const hit = db().partners.find(x => x.status === 'ACTIVE' && x.codes.some(k => k.code === code));
      return okR(hit ? { valid: true, partnerName: hit.name.split(' ')[0] } : { valid: false, partnerName: null });
    }

    if (a === 'partner') {
      const p = me();
      if (b === 'me') return okR(profile(p));
      if (b === 'apply') throw conflict('You are already a partner.');
      if (b === 'overview') return okR(overviewOf(p, range));
      if (b === 'clients') { const r = clientsOf(p, cq); return okR(r.data, r.meta); }
      if (b === 'links') return okR(linksOf(p));
      if (b === 'channels' && method === 'POST') {
        const label = String(body.label ?? '').trim().slice(0, 40);
        if (!label) throw invalid('Give the link a name.');
        const dup = p.channels.find(x => !x.archived && x.label.toLowerCase() === label.toLowerCase());
        if (dup) throw conflict(`You already have a link called “${dup.label}”. Pick another name.`);
        if (p.channels.filter(x => !x.archived && x.slug).length >= MAX_CHANNELS) throw conflict(`You can have up to ${MAX_CHANNELS} channel links. Archive one first.`);
        let slug = slugify(label);
        for (let i = 2; p.channels.some(x => x.slug === slug && !x.archived); i++) slug = `${slugify(label).slice(0, 28)}-${i}`;
        const ch = { id: `ch${Date.now()}`, label, slug, archived: false, createdAt: iso(Date.now()) };
        p.channels.push(ch);
        return created({ id: ch.id, label, slug, url: url(primary(p), slug), clicks: 0, converted: 0, signups: 0, connected: 0, active: 0, createdAt: ch.createdAt });
      }
      if (b === 'channels' && method === 'DELETE' && c) {
        const ch = p.channels.find(x => x.id === c && !x.archived);
        if (!ch) throw notFound('Channel not found');
        if (!ch.slug) throw conflict('The default link can’t be archived.');
        ch.archived = true;
        return none;
      }
      if (b === 'codes' && method === 'POST') {
        if (p.codes.length >= MAX_CODES) throw conflict(`You can hold up to ${MAX_CODES} codes. Release one first.`);
        const code = codeOrThrow(body.code);
        const k = { id: `code${Date.now()}`, code, isPrimary: false, createdAt: iso(Date.now()) };
        p.codes.push(k);
        return created({ ...k, url: url(code), clicks: 0, signups: 0 });
      }
      if (b === 'codes' && method === 'DELETE' && c) {
        const k = p.codes.find(x => x.id === c);
        if (!k) throw notFound('Code not found');
        if (k.isPrimary) throw conflict('Your primary code can’t be released.');
        p.codes = p.codes.filter(x => x !== k);
        return none;
      }
    }

    if (a === 'admin' && b === 'partner-codes' && c === 'reserved') {
      if (method === 'GET') return okR(db().reserved);
      if (method === 'POST') {
        const code = codeOrThrow(body.code);
        const r: ReservedCode = { id: `rs${Date.now()}`, code, reason: (body.reason as string) || null, createdByEmail: ME, createdAt: iso(Date.now()) };
        db().reserved.unshift(r);
        return created(r);
      }
      if (method === 'DELETE' && d) {
        if (!db().reserved.some(r => r.id === d)) throw notFound('Reserved name not found');
        db().reserved = db().reserved.filter(r => r.id !== d);
        return none;
      }
    }

    if (a === 'admin' && b === 'partners') {
      if (!c) {
        if (method === 'POST') {
          const email = String(body.email ?? '').trim().toLowerCase();
          if (!/\S+@\S+\.\S+/.test(email)) throw invalid('Enter a valid email.');
          if (db().partners.some(x => x.email === email)) throw conflict('This user is already a partner.');
          const code = body.code ? codeOrThrow(body.code) : codeOrThrow(email.split('@')[0]!.replace(/[^a-z0-9]/gi, '').slice(0, 12).padEnd(3, 'X'));
          const now = iso(Date.now()), id = `p_${Date.now()}`;
          const np: State = {
            id, userId: `u_${id}`, name: email.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()), email,
            status: 'ACTIVE', audience: (body.audience as string) || null, createdAt: now, approvedAt: now,
            codes: [{ id: `${id}_code0`, code, isPrimary: true, createdAt: now }], channels: [{ id: `${id}_ch0`, label: 'Direct link', slug: '', archived: false, createdAt: now }],
            clicks: [], clients: [], notes: [{ id: `${id}_n0`, body: 'Partner created by admin.', authorEmail: ME, createdAt: now }],
          };
          db().partners.unshift(np);
          return created(row(np));
        }
        const st = q.get('status') as PartnerStatus | null;
        return okR(db().partners.filter(x => (st ? x.status === st : x.status !== 'REVOKED')).map(row));
      }
      if (c === 'lookup') {
        const term = (q.get('q') ?? '').trim().toLowerCase();
        const out: ReferrerLookup = { query: term, user: null, referredBy: null, codeOwner: null };
        for (const x of db().partners) {
          const cl = x.clients.find(k => k.email === term);
          if (cl) { out.user = { id: cl.id, name: cl.name, email: cl.email }; out.referredBy = { partner: row(x), client: toClient(x, cl) }; }
          if (x.codes.some(k => k.code === term.toUpperCase())) out.codeOwner = row(x);
          if (x.email === term) out.user = { id: x.userId, name: x.name, email: x.email };
        }
        return okR(out);
      }
      const t = partnerById(c);
      if (!d && method === 'GET') {
        const detail: AdminPartnerDetail = { ...overviewOf(t, range), admin: row(t), codes: codesOf(t), notes: t.notes };
        return okR(detail);
      }
      if (d === 'clients' && method === 'GET') { const r = clientsOf(t, cq); return okR(r.data, r.meta); }
      if (d === 'status' && method === 'POST') {
        const tr = TRANSITIONS[body.action as StatusAction];
        if (!tr) throw invalid('Unknown action');
        if (!tr[0].includes(t.status)) throw conflict(`Can’t ${String(body.action)} a partner who is ${t.status.toLowerCase()}.`);
        t.status = tr[1];
        if (tr[1] === 'ACTIVE') t.approvedAt = t.approvedAt ?? iso(Date.now());
        note(t, `${tr[2]}.${body.reason ? ` Reason: ${String(body.reason)}` : ''}`);
        return okR(row(t));
      }
      if (d === 'notes' && method === 'POST') {
        const text = String(body.body ?? '').trim();
        if (!text) throw invalid('Write a note first.');
        note(t, text);
        return created(t.notes[0]);
      }
      if (d === 'clients' && method === 'POST') {
        const email = String(body.email ?? '').trim().toLowerCase();
        let owner: State | undefined, cl: Client | undefined;
        for (const x of db().partners) { const k = x.clients.find(y => y.email === email); if (k) { owner = x; cl = k; } }
        if (!owner || !cl) throw notFound('No TRADElogs account uses that email.');
        if (owner === t) throw conflict('This user is already this partner’s client.');
        if (!body.force) throw conflict(`This user is already referred by ${owner.name}. Send force to move them.`);
        owner.clients = owner.clients.filter(y => y !== cl);
        const moved: Client = { ...cl, via: 'admin', channelId: t.channels.find(y => !y.slug)!.id, code: primary(t) };
        t.clients.unshift(moved);
        note(t, `Client assigned: ${cl.name} (moved from ${owner.name}).${body.reason ? ` Reason: ${String(body.reason)}` : ''}`);
        note(owner, `Client moved to ${t.name}: ${cl.name}.`);
        return created(toClient(t, moved));
      }
      if (d === 'clients' && method === 'DELETE' && e) {
        const cl = t.clients.find(y => y.id === e);
        if (!cl) throw notFound('Client not found for this partner');
        t.clients = t.clients.filter(y => y !== cl);
        note(t, `Client unlinked: ${cl.name}.${q.get('reason') ? ` Reason: ${q.get('reason')}` : ''}`);
        return none;
      }
      if (d === 'move-clients' && method === 'POST') {
        const to = partnerById(String(body.toPartnerId));
        if (to === t) throw conflict('Pick two different partners.');
        if (to.status !== 'ACTIVE') throw conflict('Clients can only move to an active partner.');
        const def = to.channels.find(y => !y.slug)!.id;
        const n = t.clients.length;
        to.clients.unshift(...t.clients.map(y => ({ ...y, via: 'admin' as const, channelId: def, code: primary(to) })));
        t.clients = [];
        note(t, `${n} client${n === 1 ? '' : 's'} moved to ${to.name}.`);
        note(to, `${n} client${n === 1 ? '' : 's'} moved in from ${t.name}.`);
        return okR({ moved: n });
      }
      if (d === 'codes' && method === 'DELETE' && e) {
        const k = t.codes.find(y => y.id === e);
        if (!k) throw notFound('Code not found');
        if (k.isPrimary) throw conflict('Primary codes can’t be revoked.');
        t.codes = t.codes.filter(y => y !== k);
        note(t, `Custom code ${k.code} revoked.`);
        return none;
      }
    }
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: `No mock for ${method} /${seg.join('/')}` } } };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
    throw err;
  }
}
