import { describe, it, expect } from 'vitest';
import {
  normalizeCode, isBuiltinReserved, primaryCodeCandidates, slugify, referralUrl,
  signRefCookie, verifyRefCookie, readCookie, hashIp, clientIp, deviceFromUa, countryFromHeaders,
  chooseAttribution, referralStatus, snapshotFromTrades, nextActivity, rangeStart, dayKeys, firstName,
  resolveWindow, windowDays, within,
} from '../partner.logic.js';
import { partnerRangeQuerySchema, programExportQuerySchema } from '@tradinjournal/contracts';

const SECRET = 'test-secret';
const DAY = 86_400_000;

describe('codes', () => {
  it('normalizes to upper-case and enforces 3–20 of A-Z 0-9 _ -', () => {
    expect(normalizeCode(' rohan-fx ')).toBe('ROHAN-FX');
    expect(normalizeCode('ab')).toBeNull();
    expect(normalizeCode('a'.repeat(21))).toBeNull();
    expect(normalizeCode('no spaces')).toBeNull();
    expect(normalizeCode('emoji😀')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });

  it('blocks route names and brand-impersonating words', () => {
    for (const c of ['ADMIN', 'LOGIN', 'SIGNUP', 'TRADELOGS', 'TRADELOGS_VIP', 'OFFICIALFX', 'MYSUPPORT', 'ELEFIN']) {
      expect(isBuiltinReserved(c)).toBe(true);
    }
    expect(isBuiltinReserved('ROHANFX')).toBe(false);
  });

  it('builds primary-code candidates from the first name, then random fallbacks', () => {
    const c = primaryCodeCandidates('Rohan Mehta', () => 0.5);
    expect(c[0]).toBe('ROHAN');
    expect(c[1]).toBe('ROHAN55');
    expect(c.at(-1)).toMatch(/^TL[0-9A-F]{6}$/);
    expect(c.every(x => normalizeCode(x) === x)).toBe(true);
  });

  it('skips the name when it is too short or reserved', () => {
    expect(primaryCodeCandidates('Al')[0]).toMatch(/^TL/);
    expect(primaryCodeCandidates('Admin Person')[0]).toMatch(/^TL/);
    expect(primaryCodeCandidates('Zoë Ünal')[0]).toBe('ZOE');
  });

  it('slugs and builds links', () => {
    expect(slugify('YouTube — pinned comment!')).toBe('youtube-pinned-comment');
    expect(slugify('!!!')).toBe('channel');
    expect(referralUrl('https://tradelogs.com/', 'ROHAN')).toBe('https://tradelogs.com/r/ROHAN');
    expect(referralUrl('https://tradelogs.com', 'ROHAN', 'telegram')).toBe('https://tradelogs.com/r/ROHAN?ch=telegram');
  });
});

describe('referral cookie', () => {
  const now = 1_800_000_000_000;
  const c = { clickId: 'clk1', partnerId: 'p1', issuedAt: now };

  it('round-trips', () => {
    expect(verifyRefCookie(SECRET, signRefCookie(SECRET, c), 30, now + DAY)).toEqual(c);
  });

  it('rejects tampering, wrong secret, expiry and future stamps', () => {
    const v = signRefCookie(SECRET, c);
    expect(verifyRefCookie(SECRET, v.replace('p1', 'p2'), 30, now)).toBeNull();
    expect(verifyRefCookie('other', v, 30, now)).toBeNull();
    expect(verifyRefCookie(SECRET, v, 30, now + 31 * DAY)).toBeNull();
    expect(verifyRefCookie(SECRET, signRefCookie(SECRET, { ...c, issuedAt: now + DAY }), 30, now)).toBeNull();
    expect(verifyRefCookie(SECRET, 'garbage', 30, now)).toBeNull();
    expect(verifyRefCookie(SECRET, undefined, 30, now)).toBeNull();
  });

  it('reads a cookie out of a header', () => {
    expect(readCookie('a=1; tl_ref=x.y.z.s; b=2', 'tl_ref')).toBe('x.y.z.s');
    expect(readCookie('a=1', 'tl_ref')).toBeNull();
    expect(readCookie(undefined, 'tl_ref')).toBeNull();
  });
});

describe('visitor details', () => {
  it('hashes IPs deterministically without storing them', () => {
    expect(hashIp(SECRET, '1.2.3.4')).toBe(hashIp(SECRET, '1.2.3.4'));
    expect(hashIp(SECRET, '1.2.3.4')).not.toContain('1.2.3.4');
    expect(hashIp(SECRET, '1.2.3.4')).toHaveLength(32);
  });

  it('takes the first forwarded hop', () => {
    expect(clientIp('9.9.9.9, 10.0.0.1', '127.0.0.1')).toBe('9.9.9.9');
    expect(clientIp(undefined, '127.0.0.1')).toBe('127.0.0.1');
  });

  it('classifies devices', () => {
    expect(deviceFromUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('Mobile');
    expect(deviceFromUa('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('Mobile');
    expect(deviceFromUa('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('Tablet');
    expect(deviceFromUa('Mozilla/5.0 (Linux; Android 13; SM-X700) Safari')).toBe('Tablet');
    expect(deviceFromUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('Desktop');
  });

  it('reads country from CDN headers', () => {
    const h = (m: Record<string, string>) => (k: string) => m[k];
    expect(countryFromHeaders(h({ 'cf-ipcountry': 'in' }))).toBe('IN');
    expect(countryFromHeaders(h({ 'cf-ipcountry': 'XX' }))).toBeNull();
    expect(countryFromHeaders(h({}))).toBeNull();
  });
});

describe('attribution', () => {
  const cookie = { clickId: 'c', partnerId: 'p', issuedAt: 1 };
  it('typed code beats cookie, cookie beats nothing', () => {
    expect(chooseAttribution('SANA', cookie)).toEqual({ kind: 'code', code: 'SANA' });
    expect(chooseAttribution(null, cookie)).toEqual({ kind: 'cookie', cookie });
    expect(chooseAttribution(null, null)).toEqual({ kind: 'none' });
  });
});

describe('status + stats', () => {
  const t = (d: Date) => d;
  it('derives the four statuses', () => {
    expect(referralStatus({ connectedAt: null, isActive: false, firstActiveAt: null })).toBe('SIGNED_UP');
    expect(referralStatus({ connectedAt: t(new Date()), isActive: false, firstActiveAt: null })).toBe('CONNECTED');
    expect(referralStatus({ connectedAt: t(new Date()), isActive: true, firstActiveAt: new Date() })).toBe('ACTIVE');
    expect(referralStatus({ connectedAt: t(new Date()), isActive: false, firstActiveAt: new Date() })).toBe('INACTIVE');
  });

  it('counts closed trades in the window, 30-day trades, lots and P&L', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
    const s = snapshotFromTrades([
      { status: 'CLOSED', openTime: iso(2), closeTime: iso(1), volume: 0.5, netPnl: 120 },
      { status: 'CLOSED', openTime: iso(6), closeTime: iso(6), volume: 1, netPnl: -40.5 },
      { status: 'CLOSED', openTime: iso(20), closeTime: iso(20), volume: 0.25, netPnl: 10 },
      { status: 'CLOSED', openTime: iso(40), closeTime: iso(40), volume: 3, netPnl: -500 },
      { status: 'OPEN', openTime: iso(0.5), closeTime: null, volume: 2, netPnl: 999 },
    ], 7, now, new Date(now - 10 * DAY));
    expect(s).toEqual({ tradeCount7d: 2, trades30d: 3, lots30d: 1.75, lotsWindow: 1.5, lastTradeAt: new Date(now - 0.5 * DAY), pnl30d: 89.5, pnlTotal: 79.5 });
    expect(snapshotFromTrades([], 7, now)).toEqual({ tradeCount7d: 0, trades30d: 0, lots30d: 0, lotsWindow: 0, lastTradeAt: null, pnl30d: 0, pnlTotal: 0 });
  });

  it('keeps firstActiveAt sticky and stamps inactiveAt on the drop', () => {
    const now = new Date('2026-10-19T00:00:00Z'), earlier = new Date('2026-10-01T00:00:00Z');
    expect(nextActivity({ isActive: false, firstActiveAt: null, inactiveAt: null }, true, now)).toEqual({ isActive: true, firstActiveAt: now, inactiveAt: null });
    expect(nextActivity({ isActive: true, firstActiveAt: earlier, inactiveAt: null }, true, now)).toEqual({ isActive: true, firstActiveAt: earlier, inactiveAt: null });
    expect(nextActivity({ isActive: true, firstActiveAt: earlier, inactiveAt: null }, false, now)).toEqual({ isActive: false, firstActiveAt: earlier, inactiveAt: now });
    expect(nextActivity({ isActive: false, firstActiveAt: earlier, inactiveAt: earlier }, false, now)).toEqual({ isActive: false, firstActiveAt: earlier, inactiveAt: earlier });
    expect(nextActivity({ isActive: false, firstActiveAt: null, inactiveAt: null }, false, now)).toEqual({ isActive: false, firstActiveAt: null, inactiveAt: null });
  });
});

describe('ranges', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  it('clamps the range start to when the partner joined', () => {
    expect(rangeStart('ALL', new Date(0), now)).toBeNull();
    expect(rangeStart('7D', new Date(0), now)?.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    const joined = new Date('2026-10-15T00:00:00Z');
    expect(rangeStart('30D', joined, now)).toEqual(joined);
  });

  it('lists UTC days inclusive and caps the length', () => {
    expect(dayKeys(new Date('2026-10-17T23:00:00Z'), new Date('2026-10-19T01:00:00Z'))).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    const capped = dayKeys(new Date('2020-01-01T00:00:00Z'), new Date('2026-10-19T00:00:00Z'), 10);
    expect(capped).toHaveLength(10);
    expect(capped.at(-1)).toBe('2026-10-19');
  });

  it('shows strangers only a first name', () => {
    expect(firstName('  Rohan  Mehta ')).toBe('Rohan');
  });
});

describe('custom date ranges', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const joined = new Date('2026-10-15T08:00:00Z');

  it('covers whole UTC days, both ends inclusive', () => {
    const w = resolveWindow({ range: 'CUSTOM', from: '2026-10-01', to: '2026-10-31' }, joined, now);
    expect(w.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(w.to?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(within(w)).toEqual({ gte: w.from, lt: w.to });
  });

  it('presets end now and open ranges filter nothing', () => {
    expect(resolveWindow({ range: '7D' }, new Date(0), now)).toEqual({ from: new Date(now - 7 * 86_400_000), to: null });
    expect(resolveWindow({ range: 'ALL' }, joined, now)).toEqual({ from: null, to: null });
    expect(within({ from: null, to: null })).toBeUndefined();
    // A preset ignores stray from/to.
    expect(resolveWindow({ range: '30D', from: '2020-01-01', to: '2020-01-02' }, joined, now).to).toBeNull();
  });

  it('daily series run from the first to the last day, never past today', () => {
    expect(windowDays(resolveWindow({ range: 'CUSTOM', from: '2026-10-30', to: '2026-11-02' }, joined, now), joined, now))
      .toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    const toFuture = windowDays(resolveWindow({ range: 'CUSTOM', from: '2026-11-04', to: '2026-11-30' }, joined, now), joined, now);
    expect(toFuture).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(windowDays(resolveWindow({ range: 'CUSTOM', from: '2026-12-01', to: '2026-12-05' }, joined, now), joined, now)).toEqual([]);
    expect(windowDays(resolveWindow({ range: 'ALL' }, joined, now), joined, now)[0]).toBe('2026-10-15');
    expect(windowDays(resolveWindow({ range: 'CUSTOM', from: '2026-11-06', to: '2026-11-06' }, joined, now), joined, now)).toEqual(['2026-11-06']);
  });

  it('validates custom ranges', () => {
    const ok = (q: object) => partnerRangeQuerySchema.safeParse(q).success;
    expect(ok({})).toBe(true);
    expect(partnerRangeQuerySchema.parse({}).range).toBe('30D');
    expect(ok({ range: 'CUSTOM', from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(ok({ range: 'CUSTOM', from: '2026-10-01', to: '2026-10-01' })).toBe(true);
    expect(ok({ range: 'CUSTOM', from: '2026-10-01' })).toBe(false);
    expect(ok({ range: 'CUSTOM', to: '2026-10-01' })).toBe(false);
    expect(ok({ range: 'CUSTOM', from: '2026-10-31', to: '2026-10-01' })).toBe(false);
    expect(ok({ range: 'CUSTOM', from: '2026-02-30', to: '2026-03-01' })).toBe(false);
    expect(ok({ range: 'CUSTOM', from: '01-10-2026', to: '2026-10-31' })).toBe(false);
    expect(ok({ range: 'CUSTOM', from: '2025-01-01', to: '2026-01-01' })).toBe(true); // 366 days
    expect(ok({ range: 'CUSTOM', from: '2025-01-01', to: '2026-01-02' })).toBe(false); // 367
    expect(ok({ range: 'YTD' })).toBe(false);
    expect(programExportQuerySchema.parse({}).range).toBe('ALL');
    expect(programExportQuerySchema.safeParse({ type: 'partners', range: 'CUSTOM', from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
  });
});

