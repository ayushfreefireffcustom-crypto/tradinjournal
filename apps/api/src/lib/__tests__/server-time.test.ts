import { describe, it, expect } from 'vitest';
import {
  candidateZones, observeOffset, parseTz, formatTz, serverOffsetAt, serverWallOffset, serverWallToUtc,
  updateServerTz, utcToServerWall, zoneOffsetMin, type ServerTz,
} from '../server-time.js';

const NY_CLOSE: ServerTz = { zone: 'America/New_York', shiftMin: 420 };
const EET: ServerTz = { zone: 'Europe/Athens', shiftMin: 0 };
const ms = (iso: string) => Date.parse(iso);
const s = (iso: string) => ms(iso) / 1000;
/** A server wall-clock reading written the way the bridge sends it (as if it were UTC). */
const wall = (local: string) => ms(`${local}Z`);

describe('server clock model', () => {
  it('reads zone offsets including DST', () => {
    expect(zoneOffsetMin('UTC', ms('2026-07-01T00:00:00Z'))).toBe(0);
    expect(zoneOffsetMin('America/New_York', ms('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(zoneOffsetMin('America/New_York', ms('2026-07-15T12:00:00Z'))).toBe(-240);
  });

  it('New York close = GMT+2 in winter, GMT+3 in summer, switching on US dates', () => {
    expect(serverOffsetAt(NY_CLOSE, ms('2026-01-15T12:00:00Z'))).toBe(120);
    expect(serverOffsetAt(NY_CLOSE, ms('2026-07-15T12:00:00Z'))).toBe(180);
    // US DST began 8 Mar 2026; EU only on 29 Mar — the two models disagree in between.
    expect(serverOffsetAt(NY_CLOSE, ms('2026-03-16T12:00:00Z'))).toBe(180);
    expect(serverOffsetAt(EET, ms('2026-03-16T12:00:00Z'))).toBe(120);
    // EU DST ended 25 Oct, US on 1 Nov.
    expect(serverOffsetAt(NY_CLOSE, ms('2026-10-28T12:00:00Z'))).toBe(180);
    expect(serverOffsetAt(EET, ms('2026-10-28T12:00:00Z'))).toBe(120);
    expect(serverOffsetAt(NY_CLOSE, ms('2026-11-14T12:00:00Z'))).toBe(120);
  });

  it('converts a server wall-clock deal time to real UTC per date', () => {
    expect(new Date(serverWallToUtc(NY_CLOSE, wall('2026-07-15T12:00:00'))).toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(new Date(serverWallToUtc(NY_CLOSE, wall('2026-01-15T12:00:00'))).toISOString()).toBe('2026-01-15T10:00:00.000Z');
    // Server midnight is New York 17:00 all year round.
    expect(new Date(serverWallToUtc(NY_CLOSE, wall('2026-07-16T00:00:00'))).toISOString()).toBe('2026-07-15T21:00:00.000Z');
    expect(new Date(serverWallToUtc(NY_CLOSE, wall('2026-12-16T00:00:00'))).toISOString()).toBe('2026-12-15T22:00:00.000Z');
    expect(serverWallToUtc({ zone: 'UTC', shiftMin: 180 }, wall('2026-07-15T12:00:00'))).toBe(ms('2026-07-15T09:00:00Z'));
    expect(serverWallToUtc({ zone: 'UTC', shiftMin: 0 }, wall('2026-07-15T12:00:00'))).toBe(ms('2026-07-15T12:00:00Z'));
  });

  it('round-trips UTC ⇄ wall clock away from transitions', () => {
    for (const iso of ['2026-02-02T03:04:05Z', '2026-06-30T23:59:59Z', '2026-10-28T08:00:00Z', '2026-11-14T12:00:00Z']) {
      for (const tz of [NY_CLOSE, EET, { zone: 'UTC', shiftMin: -300 }]) {
        expect(serverWallToUtc(tz, utcToServerWall(tz, ms(iso)))).toBe(ms(iso));
      }
    }
  });

  it('handles the fall-back hour (repeated wall time → earlier instant) and the spring-forward gap', () => {
    // 1 Nov 2026 06:00Z: NY 02:00 EDT → 01:00 EST, so server wall 09:00 → 08:00. 08:30 happens twice.
    expect(serverWallOffset(NY_CLOSE, wall('2026-11-01T08:30:00'))).toBe(180);
    expect(serverWallOffset(NY_CLOSE, wall('2026-11-01T10:00:00'))).toBe(120);
    // 8 Mar 2026 07:00Z: server wall jumps 09:00 → 10:00; 09:30 never existed. Still a sane offset.
    expect([120, 180]).toContain(serverWallOffset(NY_CLOSE, wall('2026-03-08T09:30:00')));
    expect(serverWallOffset(NY_CLOSE, wall('2026-03-08T11:00:00'))).toBe(180);
  });
});

describe('observeOffset (bridge clock reading)', () => {
  const now = s('2026-11-14T12:00:00Z');
  it('reads the offset from a live quote', () => {
    expect(observeOffset({ serverTime: now + 7200 - 2, utcNow: now })).toBe(120);
    expect(observeOffset({ serverTime: now + 10800 - 90, utcNow: now })).toBe(180);
    expect(observeOffset({ serverTime: now - 3, utcNow: now })).toBe(0);
    expect(observeOffset({ serverTime: now - 5 * 3600, utcNow: now })).toBe(-300);
    expect(observeOffset({ serverTime: now + 7200 + 30, utcNow: now })).toBe(120); // bridge clock slightly behind
  });
  it('refuses readings it cannot trust', () => {
    expect(observeOffset(null)).toBeNull();
    expect(observeOffset({ serverTime: null, utcNow: now })).toBeNull(); // quotes not moving (weekend)
    expect(observeOffset({ serverTime: now + 7200 - 400, utcNow: now })).toBeNull(); // stale quote
    expect(observeOffset({ serverTime: now + 20 * 3600, utcNow: now })).toBeNull(); // impossible offset
  });
});

describe('updateServerTz', () => {
  const nov = ms('2026-11-14T12:00:00Z');
  const lateOct = ms('2026-10-28T12:00:00Z');

  it('a first observation picks the most likely model', () => {
    expect(updateServerTz({ tz: null, lastObservedMin: null }, 120, nov)).toEqual({ tz: NY_CLOSE, lastObservedMin: 120, changed: true });
    expect(candidateZones(180, nov)).toEqual([{ zone: 'UTC', shiftMin: 180 }]); // +3 in November: fixed GMT+3
    expect(updateServerTz({ tz: null, lastObservedMin: null }, 0, nov).tz).toEqual({ zone: 'UTC', shiftMin: 0 });
  });

  it('keeps the model when the observation agrees, or when there is none', () => {
    expect(updateServerTz({ tz: NY_CLOSE, lastObservedMin: 120 }, 120, nov)).toMatchObject({ tz: NY_CLOSE, changed: false });
    expect(updateServerTz({ tz: NY_CLOSE, lastObservedMin: 120 }, null, nov)).toEqual({ tz: NY_CLOSE, lastObservedMin: 120, changed: false });
  });

  it('switches only after the same contradiction is seen twice', () => {
    // Between the EU and US switch-back an EET server shows +2 while New York close predicts +3.
    const once = updateServerTz({ tz: NY_CLOSE, lastObservedMin: 180 }, 120, lateOct);
    expect(once).toEqual({ tz: NY_CLOSE, lastObservedMin: 120, changed: false });
    const twice = updateServerTz(once, 120, lateOct);
    expect(twice).toEqual({ tz: EET, lastObservedMin: 120, changed: true });
  });

  it('parses and formats CLI specs', () => {
    expect(parseTz('America/New_York+420')).toEqual(NY_CLOSE);
    expect(parseTz('UTC+120')).toEqual({ zone: 'UTC', shiftMin: 120 });
    expect(parseTz('Europe/Athens')).toEqual(EET);
    expect(formatTz(NY_CLOSE)).toBe('America/New_York+420');
    expect(formatTz({ zone: 'UTC', shiftMin: -300 })).toBe('UTC-300');
    expect(() => parseTz('Not/AZone+1')).toThrow();
  });
});
