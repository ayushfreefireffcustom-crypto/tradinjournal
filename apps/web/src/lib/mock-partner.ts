// Mock partner programme data. Seeded per partner so every reload looks the
// same; dates are anchored to "today" so the charts always end now.
import type {
  AdminPartnerDetail, AdminPartnerRow, PartnerChannel, PartnerClick, PartnerClient, PartnerEvent,
  PartnerLinks, PartnerOverview, PartnerProfile, PartnerStatus, ReferralStatus,
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
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const iso = (t: number) => new Date(t).toISOString();

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Arjun', 'Kabir', 'Rohit', 'Priya', 'Ananya', 'Sneha', 'Neha', 'Karan', 'Rahul', 'Vikram', 'Meera', 'Sanya', 'Aman', 'Yash', 'Dev', 'Riya', 'Tanvi', 'Harsh', 'Nikhil', 'Pooja', 'Siddharth', 'Kunal', 'Divya', 'Manav', 'Ayesha', 'Farhan', 'Imran', 'Zoya', 'Omar', 'Bilal', 'Sara', 'Hamza'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Gupta', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Mehta', 'Kapoor', 'Malhotra', 'Bose', 'Das', 'Khan', 'Shaikh', 'Agarwal', 'Chopra', 'Rao', 'Pillai', 'Siddiqui', 'Qureshi'];
const PLACES: [string, string][] = [['India', 'Mumbai'], ['India', 'Delhi'], ['India', 'Bengaluru'], ['India', 'Pune'], ['India', 'Hyderabad'], ['India', 'Raipur'], ['India', 'Jaipur'], ['India', 'Ahmedabad'], ['India', 'Kolkata'], ['India', 'Chennai'], ['Pakistan', 'Lahore'], ['Pakistan', 'Karachi'], ['Bangladesh', 'Dhaka'], ['Nepal', 'Kathmandu'], ['Sri Lanka', 'Colombo']];

interface Spec {
  id: string; name: string; email: string; code: string; status: PartnerStatus; sinceDays: number; audience: string;
  seed: number; clients: number; clicksPerDay: number;
  channels: { label: string; slug: string | null; w: number }[];
}

const SPECS: Spec[] = [
  { id: 'p_rohan', name: 'Rohan Mehta', email: 'rohan@rohanfx.in', code: 'ROHANFX', status: 'ACTIVE', sinceDays: 97, audience: 'Telegram · 18k members', seed: 11, clients: 96, clicksPerDay: 13,
    channels: [{ label: 'Telegram group', slug: 'telegram', w: 0.45 }, { label: 'YouTube', slug: 'youtube', w: 0.25 }, { label: 'Instagram bio', slug: 'instagram', w: 0.15 }, { label: 'Direct link', slug: null, w: 0.15 }] },
  { id: 'p_tradewithsana', name: 'Sana Qureshi', email: 'sana@tradewithsana.com', code: 'SANA', status: 'ACTIVE', sinceDays: 140, audience: 'YouTube · 42k subscribers', seed: 23, clients: 142, clicksPerDay: 22,
    channels: [{ label: 'YouTube', slug: 'youtube', w: 0.6 }, { label: 'Instagram bio', slug: 'instagram', w: 0.25 }, { label: 'Direct link', slug: null, w: 0.15 }] },
  { id: 'p_pipsquad', name: 'Pip Squad (Arjun Rao)', email: 'arjun@pipsquad.in', code: 'PIPSQUAD', status: 'ACTIVE', sinceDays: 75, audience: 'Telegram · 9k members', seed: 37, clients: 61, clicksPerDay: 9,
    channels: [{ label: 'Telegram channel', slug: 'telegram', w: 0.7 }, { label: 'Direct link', slug: null, w: 0.3 }] },
  { id: 'p_meera', name: 'Meera Iyer', email: 'meera.iyer@gmail.com', code: 'MEERA10', status: 'ACTIVE', sinceDays: 52, audience: 'Instagram · 15k followers', seed: 41, clients: 34, clicksPerDay: 7,
    channels: [{ label: 'Instagram bio', slug: 'instagram', w: 0.75 }, { label: 'Direct link', slug: null, w: 0.25 }] },
  { id: 'p_fxdesk', name: 'FX Desk Lahore', email: 'team@fxdesklhr.pk', code: 'FXDESK', status: 'PAUSED', sinceDays: 120, audience: 'Trading academy', seed: 53, clients: 28, clicksPerDay: 3,
    channels: [{ label: 'Course portal', slug: 'course', w: 0.8 }, { label: 'Direct link', slug: null, w: 0.2 }] },
  { id: 'p_kabir', name: 'Kabir Singh', email: 'kabir.trades@gmail.com', code: 'KABIR', status: 'ACTIVE', sinceDays: 31, audience: 'X · 6k followers', seed: 67, clients: 14, clicksPerDay: 5,
    channels: [{ label: 'X / Twitter', slug: 'x', w: 0.8 }, { label: 'Direct link', slug: null, w: 0.2 }] },
  { id: 'p_nisha', name: 'Nisha Bose', email: 'nisha@chartschool.in', code: 'CHARTSCHOOL', status: 'PENDING', sinceDays: 2, audience: 'YouTube · 27k subscribers', seed: 71, clients: 0, clicksPerDay: 0,
    channels: [{ label: 'Direct link', slug: null, w: 1 }] },
  { id: 'p_dhaka', name: 'Tanvir Ahmed', email: 'tanvir.fx@gmail.com', code: 'TANVIR', status: 'PENDING', sinceDays: 1, audience: 'Telegram · 4k members', seed: 79, clients: 0, clicksPerDay: 0,
    channels: [{ label: 'Direct link', slug: null, w: 1 }] },
];

const ACTIVE_RULE = { minTrades: 3, windowDays: 7 };
const BASE = 'https://tradelogs.com/r/';

function pick<T>(r: () => number, xs: T[]): T { return xs[Math.floor(r() * xs.length)]!; }
function weighted<T extends { w: number }>(r: () => number, xs: T[]): T {
  let x = r() * xs.reduce((s, c) => s + c.w, 0);
  for (const c of xs) { x -= c.w; if (x <= 0) return c; }
  return xs[xs.length - 1]!;
}

interface Built { profile: PartnerProfile; overview: PartnerOverview; links: PartnerLinks; row: AdminPartnerRow }
const cache = new Map<string, Built>();

function build(s: Spec): Built {
  const key = `${s.id}:${today()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(s.seed);
  const t0 = today();
  const since = t0 - s.sinceDays * DAY;
  const profile: PartnerProfile = { id: s.id, name: s.name, code: s.code, status: s.status, since: iso(since), activeRule: ACTIVE_RULE };

  // Daily clicks: noisy baseline that grows a little, plus a few spikes (a video drop, a pinned post).
  const daily: { date: string; clicks: number }[] = [];
  const spikes = new Set(Array.from({ length: 4 }, () => Math.floor(r() * s.sinceDays)));
  for (let d = s.sinceDays; d >= 0; d--) {
    const growth = 0.6 + 0.8 * (1 - d / Math.max(s.sinceDays, 1));
    let c = s.clicksPerDay ? Math.round(s.clicksPerDay * growth * (0.55 + r() * 0.9)) : 0;
    if (spikes.has(d) && s.clicksPerDay) c += Math.round(s.clicksPerDay * (2 + r() * 3));
    if (s.status === 'PAUSED' && d < 21) c = Math.round(c * 0.15);
    daily.push({ date: iso(t0 - d * DAY), clicks: c });
  }

  // Clients: signup day sampled proportionally to clicks so the funnel lines up with traffic.
  const totalClicks = daily.reduce((a, b) => a + b.clicks, 0) || 1;
  const clients: PartnerClient[] = [];
  const used = new Set<string>();
  for (let i = 0; i < s.clients; i++) {
    let x = r() * totalClicks, idx = 0;
    for (; idx < daily.length - 1; idx++) { x -= daily[idx]!.clicks; if (x <= 0) break; }
    const signedUp = new Date(daily[idx]!.date).getTime() + Math.floor(r() * 20 + 3) * 3_600_000;
    let name = '';
    do { name = `${pick(r, FIRST)} ${pick(r, LAST)}`; } while (used.has(name));
    used.add(name);
    const [country, city] = pick(r, PLACES);
    const ch = weighted(r, s.channels);
    const age = (t0 - signedUp) / DAY;
    const connects = r() < (age < 2 ? 0.35 : 0.62);
    let status: ReferralStatus = 'SIGNED_UP';
    let connectedAt: number | null = null;
    if (connects) {
      connectedAt = signedUp + Math.floor(r() * Math.min(age, 4) * DAY);
      const roll = r();
      status = age < 3 ? (roll < 0.45 ? 'ACTIVE' : 'CONNECTED') : roll < 0.68 ? 'ACTIVE' : roll < 0.85 ? 'INACTIVE' : 'CONNECTED';
    }
    // Trades scale with how long they've actually been connected (max 30 days).
    const span = connectedAt ? Math.min(30, Math.max(1, (t0 - connectedAt) / DAY)) / 30 : 0;
    const trades30d = status === 'ACTIVE' ? Math.max(3, Math.round((8 + r() * 52) * span)) : status === 'INACTIVE' ? Math.floor(r() * 3) : status === 'CONNECTED' ? Math.floor(r() * 3) : 0;
    const lots30d = Math.round(trades30d * (0.02 + r() * 0.45) * 100) / 100;
    const lastActive = status === 'ACTIVE' ? t0 + 12 * 3_600_000 - Math.floor(r() * 3 * DAY)
      : status === 'INACTIVE' ? t0 - Math.floor((9 + r() * 25) * DAY)
      : connectedAt;
    clients.push({
      id: `${s.id}_c${i}`, name, country, city, channel: ch.label, via: r() < 0.82 ? 'link' : 'code',
      signedUpAt: iso(signedUp), connectedAt: connectedAt ? iso(connectedAt) : null, status,
      trades30d, lots30d, lastActiveAt: lastActive ? iso(Math.min(lastActive, Date.now() - 600_000)) : null,
    });
  }
  clients.sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt));

  const channels: PartnerChannel[] = s.channels.map((c, i) => {
    const mine = clients.filter(x => x.channel === c.label);
    return {
      id: `${s.id}_ch${i}`, label: c.label, slug: c.slug, url: `${BASE}${s.code}${c.slug ? `?ch=${c.slug}` : ''}`,
      clicks: Math.round(totalClicks * c.w * (0.85 + r() * 0.3)), signups: mine.length,
      connected: mine.filter(x => x.status !== 'SIGNED_UP').length, active: mine.filter(x => x.status === 'ACTIVE').length,
      createdAt: iso(since + i * 3 * DAY),
    };
  }).sort((a, b) => b.signups - a.signups);

  const activity: PartnerEvent[] = [];
  for (const c of clients) {
    activity.push({ id: `${c.id}s`, at: c.signedUpAt, kind: 'signup', client: c.name, channel: c.channel });
    if (c.connectedAt) activity.push({ id: `${c.id}c`, at: c.connectedAt, kind: 'connected', client: c.name, channel: c.channel });
    if (c.status === 'ACTIVE' && c.connectedAt) {
      const ct = new Date(c.connectedAt).getTime();
      activity.push({ id: `${c.id}a`, at: iso(ct + Math.min(2 * DAY, (Date.now() - ct) / 2)), kind: 'active', client: c.name, channel: c.channel });
    }
    if (c.status === 'INACTIVE' && c.lastActiveAt) activity.push({ id: `${c.id}i`, at: iso(new Date(c.lastActiveAt).getTime() + ACTIVE_RULE.windowDays * DAY), kind: 'inactive', client: c.name, channel: c.channel });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const recentClicks: PartnerClick[] = Array.from({ length: s.clicksPerDay ? 14 : 0 }, (_, i) => {
    const ch = weighted(r, s.channels);
    return {
      id: `${s.id}_k${i}`, at: iso(Date.now() - Math.floor((i * 47 + r() * 40) * 60_000)), channel: ch.label,
      device: (r() < 0.78 ? 'Mobile' : r() < 0.9 ? 'Desktop' : 'Tablet') as PartnerClick['device'],
      country: pick(r, PLACES)[0], converted: r() < 0.12,
    };
  });

  const last30 = Date.now() - 30 * DAY;
  const row: AdminPartnerRow = {
    id: s.id, name: s.name, email: s.email, code: s.code, status: s.status, joinedAt: iso(since), audience: s.audience,
    clicks30d: daily.filter(d => new Date(d.date).getTime() >= last30 - DAY / 2).reduce((a, b) => a + b.clicks, 0),
    signups30d: clients.filter(c => new Date(c.signedUpAt).getTime() >= last30).length,
    clients: clients.length, connected: clients.filter(c => c.status !== 'SIGNED_UP').length,
    active: clients.filter(c => c.status === 'ACTIVE').length,
  };

  const built: Built = {
    profile, row,
    overview: { partner: profile, daily, clients, channels, activity: activity.slice(0, 40) },
    links: { partner: profile, baseUrl: `${BASE}${s.code}`, channels, recentClicks },
  };
  cache.set(key, built);
  return built;
}

/** The signed-in mock user is partner #1. */
export const mockPartnerOverview = (): PartnerOverview => build(SPECS[0]!).overview;
export const mockPartnerLinks = (): PartnerLinks => build(SPECS[0]!).links;
export const mockAdminPartners = (): AdminPartnerRow[] => SPECS.map(s => build(s).row);
export function mockAdminPartner(id: string): AdminPartnerDetail | null {
  const s = SPECS.find(x => x.id === id);
  if (!s) return null;
  const b = build(s);
  return { ...b.overview, admin: b.row };
}
