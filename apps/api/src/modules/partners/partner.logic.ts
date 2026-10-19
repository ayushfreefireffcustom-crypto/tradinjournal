// Pure rules for the partner programme — no I/O, so every decision here is unit-tested.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { ReferralStatusDto, PartnerRange } from '@tradinjournal/contracts';

const DAY_MS = 86_400_000;
export const REF_COOKIE = 'tl_ref';

// ── Codes ─────────────────────────────────────────────────────────────────────

export const CODE_RE = /^[A-Z0-9_-]{3,20}$/;

/** Upper-cases and trims; returns null when the result isn't a legal code. */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Routes a code could shadow and words that would pass a partner off as us. */
const BUILTIN_RESERVED = new Set([
  'ADMIN', 'ADMINS', 'API', 'APP', 'AUTH', 'LOGIN', 'LOGOUT', 'SIGNIN', 'SIGNUP', 'REGISTER', 'VERIFY',
  'DASHBOARD', 'SETTINGS', 'BROKERS', 'PARTNER', 'PARTNERS', 'REFERRAL', 'REFERRALS', 'AFFILIATE',
  'TERMS', 'PRIVACY', 'HELP', 'SUPPORT', 'CONTACT', 'BILLING', 'PRICING', 'STAFF', 'TEAM', 'ROOT',
  'SYSTEM', 'NULL', 'UNDEFINED', 'TEST', 'ELEFIN', 'MT5', 'METATRADER', 'SIGNALX', 'COACH',
]);
const RESERVED_FRAGMENTS = ['TRADELOG', 'TRADE-LOG', 'TRADE_LOG', 'OFFICIAL', 'ADMIN', 'SUPPORT', 'STAFF'];

export function isBuiltinReserved(code: string): boolean {
  return BUILTIN_RESERVED.has(code) || RESERVED_FRAGMENTS.some(f => code.includes(f));
}

/** Candidate primary codes for a partner, best first: NAME, NAME + 2 digits…, random. */
export function primaryCodeCandidates(name: string, rand: () => number = Math.random): string[] {
  const base = (name.normalize('NFKD').replace(/[^A-Za-z]/g, ' ').trim().split(/\s+/)[0] ?? '')
    .toUpperCase().slice(0, 14);
  const out: string[] = [];
  if (base.length >= 3 && !isBuiltinReserved(base)) {
    out.push(base);
    for (let i = 0; i < 6; i++) out.push(`${base}${10 + Math.floor(rand() * 90)}`);
  }
  for (let i = 0; i < 4; i++) out.push(`TL${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`);
  return out;
}

/** Channel slug from a human label: "YouTube — pinned" → "youtube-pinned". */
export function slugify(label: string): string {
  return label.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'channel';
}

export function referralUrl(appUrl: string, code: string, slug?: string | null): string {
  return `${appUrl.replace(/\/+$/, '')}/r/${code}${slug ? `?ch=${encodeURIComponent(slug)}` : ''}`;
}

// ── Cookie ────────────────────────────────────────────────────────────────────

export interface RefCookie { clickId: string; partnerId: string; issuedAt: number }

function sig(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 27);
}

export function signRefCookie(secret: string, c: RefCookie): string {
  const payload = `${c.clickId}.${c.partnerId}.${c.issuedAt}`;
  return `${payload}.${sig(secret, payload)}`;
}

/** Returns the cookie when the signature matches and it hasn't outlived `maxAgeDays`. */
export function verifyRefCookie(secret: string, value: string | null | undefined, maxAgeDays: number, now = Date.now()): RefCookie | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [clickId, partnerId, issued, s] = parts as [string, string, string, string];
  const expected = sig(secret, `${clickId}.${partnerId}.${issued}`);
  const a = Buffer.from(s), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeDays * DAY_MS) return null;
  return { clickId, partnerId, issuedAt };
}

/** Minimal Cookie header parser (no dependency). */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// ── Visitor fingerprinting (privacy-light) ────────────────────────────────────

export function hashIp(secret: string, ip: string): string {
  return createHash('sha256').update(`${secret}:ip:${ip}`).digest('hex').slice(0, 32);
}

/** First hop of X-Forwarded-For, else the socket address. */
export function clientIp(xff: string | string[] | undefined, socketIp: string | undefined): string {
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || socketIp || 'unknown';
}

export function deviceFromUa(ua: string | null | undefined): 'Mobile' | 'Desktop' | 'Tablet' {
  if (!ua) return 'Desktop';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

/** Country from a CDN header (Cloudflare / Vercel / Railway edge), upper-case ISO-2. */
export function countryFromHeaders(get: (h: string) => string | undefined): string | null {
  const v = get('cf-ipcountry') ?? get('x-vercel-ip-country') ?? get('x-country-code');
  return v && /^[A-Za-z]{2}$/.test(v) && v.toUpperCase() !== 'XX' ? v.toUpperCase() : null;
}

// ── Attribution precedence ────────────────────────────────────────────────────

export type AttributionChoice =
  | { kind: 'code'; code: string }
  | { kind: 'cookie'; cookie: RefCookie }
  | { kind: 'none' };

/** A code typed at signup beats an earlier link click. */
export function chooseAttribution(typedCode: string | null, cookie: RefCookie | null): AttributionChoice {
  if (typedCode) return { kind: 'code', code: typedCode };
  if (cookie) return { kind: 'cookie', cookie };
  return { kind: 'none' };
}

// ── Status + stats ────────────────────────────────────────────────────────────

export function referralStatus(r: { connectedAt: Date | null; isActive: boolean; firstActiveAt: Date | null }): ReferralStatusDto {
  if (!r.connectedAt) return 'SIGNED_UP';
  if (r.isActive) return 'ACTIVE';
  if (r.firstActiveAt) return 'INACTIVE';
  return 'CONNECTED';
}

export interface TradeLite { status: string; openTime: string; closeTime: string | null; volume: number }
export interface ActivitySnapshot { tradeCount7d: number; trades30d: number; lots30d: number; lastTradeAt: Date | null }

/** Activity numbers from reconstructed trades. Window counts closed trades only. */
export function snapshotFromTrades(trades: TradeLite[], windowDays: number, now = Date.now()): ActivitySnapshot {
  const win = now - windowDays * DAY_MS, d30 = now - 30 * DAY_MS;
  let tradeCount7d = 0, trades30d = 0, lots30d = 0, last = 0;
  for (const t of trades) {
    const open = Date.parse(t.openTime);
    const close = t.closeTime ? Date.parse(t.closeTime) : NaN;
    const touched = Math.max(Number.isFinite(open) ? open : 0, Number.isFinite(close) ? close : 0);
    if (touched > last) last = touched;
    if (t.status !== 'CLOSED' || !Number.isFinite(close)) continue;
    if (close >= win) tradeCount7d++;
    if (close >= d30) { trades30d++; lots30d += Number.isFinite(t.volume) ? t.volume : 0; }
  }
  return { tradeCount7d, trades30d, lots30d: Math.round(lots30d * 100) / 100, lastTradeAt: last ? new Date(last) : null };
}

/**
 * Next activity flags after a refresh. `firstActiveAt` is sticky (it powers the
 * INACTIVE state); `inactiveAt` is set when an active client drops below the rule.
 */
export function nextActivity(
  prev: { isActive: boolean; firstActiveAt: Date | null; inactiveAt: Date | null },
  tradeCount7d: number, minTrades: number, now: Date,
): { isActive: boolean; firstActiveAt: Date | null; inactiveAt: Date | null } {
  const active = tradeCount7d >= minTrades;
  if (active) return { isActive: true, firstActiveAt: prev.firstActiveAt ?? now, inactiveAt: null };
  return { isActive: false, firstActiveAt: prev.firstActiveAt, inactiveAt: prev.isActive ? now : prev.inactiveAt };
}

export function rangeStart(range: PartnerRange, partnerSince: Date, now = Date.now()): Date | null {
  const days = { '7D': 7, '30D': 30, '90D': 90, ALL: 0 }[range];
  if (!days) return null;
  const d = new Date(now - days * DAY_MS);
  return d < partnerSince ? partnerSince : d;
}

/** UTC day keys from `from` to `to` inclusive, capped at `max` days (most recent kept). */
export function dayKeys(from: Date, to: Date, max = 366): string[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const keys: string[] = [];
  for (let t = Math.max(start, end - (max - 1) * DAY_MS); t <= end; t += DAY_MS) keys.push(new Date(t).toISOString().slice(0, 10));
  return keys;
}

/** "Rohan Mehta" → "Rohan" — the only part of a partner's name a stranger sees. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
