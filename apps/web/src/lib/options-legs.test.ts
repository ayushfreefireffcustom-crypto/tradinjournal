import { describe, expect, it } from 'vitest';
import { badLegIndex, checkLegs, expiryCodeLabel, parseExpiryCode, reconcileLegs } from './options-legs';
import type { LegInput } from './options-api';

const at = (d: number, m: number) => Date.UTC(2026, m - 1, d, 12);
const EXPIRIES = [
  { code: '161126', expiry: at(16, 11) },
  { code: '201126', expiry: at(20, 11) },
  { code: '271126', expiry: at(27, 11) },
];
const call = (strike: number, expiry: string, extra: Partial<LegInput> = {}): LegInput => ({ kind: 'call', side: 1, qty: 1, strike, expiry, ...extra });

describe('expiry codes', () => {
  it('parses DDMMYY and labels it as a date, never the raw code', () => {
    expect(parseExpiryCode('131126')).toBe(at(13, 11));
    expect(parseExpiryCode('311126')).toBeNull(); // 31 Nov doesn't exist
    expect(parseExpiryCode('abc')).toBeNull();
    expect(expiryCodeLabel('131126')).toBe('13 Nov');
    expect(expiryCodeLabel('010127')).toBe('1 Jan');
    expect(expiryCodeLabel('garbage')).toBe('an old expiry');
  });
});

describe('reconcileLegs', () => {
  it('leaves valid legs untouched (same array, no notes)', () => {
    const legs = [call(2250, '161126'), { kind: 'future', side: -1, qty: 2 } as LegInput];
    const r = reconcileLegs(legs, EXPIRIES, { '161126': [2200, 2250, 2300] });
    expect(r.changed).toBe(false);
    expect(r.legs).toBe(legs);
    expect(r.notes).toEqual([]);
  });

  it('moves a passed expiry to the nearest listed one and clears the typed price', () => {
    const r = reconcileLegs([call(2250, '131126', { price: 40, iv: 0.6 })], EXPIRIES);
    expect(r.changed).toBe(true);
    expect(r.legs[0]).toMatchObject({ expiry: '161126', strike: 2250, price: undefined, iv: undefined });
    expect(r.notes).toEqual(['Leg 1: 13 Nov is no longer listed, moved to 16 Nov.']);
    expect(r.notes.join(' ')).not.toContain('131126');
  });

  it('snaps an unlisted strike to the nearest listed one', () => {
    const r = reconcileLegs([call(2250, '161126')], EXPIRIES, { '161126': [2100, 2200, 2400] });
    expect(r.legs[0]!.strike).toBe(2200);
    expect(r.notes[0]).toBe("Leg 1: strike 2250 isn't listed for 16 Nov, moved to 2200.");
  });

  it('drops a leg only when nothing is listed to move it to', () => {
    const fut = { kind: 'future', side: 1, qty: 1 } as LegInput;
    const none = reconcileLegs([call(2250, '131126'), fut], []);
    expect(none.legs).toEqual([fut]);
    expect(none.notes[0]).toMatch(/^Leg 1 removed/);
    const empty = reconcileLegs([call(2250, '161126')], EXPIRIES, { '161126': [] });
    expect(empty.legs).toEqual([]);
  });

  it('is idempotent', () => {
    const once = reconcileLegs([call(2250, '131126'), call(9999, '271126')], EXPIRIES, { '161126': [2200, 2300], '271126': [2000, 3000] });
    const twice = reconcileLegs(once.legs, EXPIRIES, { '161126': [2200, 2300], '271126': [2000, 3000] });
    expect(twice.changed).toBe(false);
    expect(once.legs.map((l) => [l.expiry, l.strike])).toEqual([['161126', 2200], ['271126', 3000]]);
  });
});

describe('checkLegs', () => {
  it('snaps the expiry, then the strike from that expiry’s chain', async () => {
    const base = { expiry: '201126', expiries: EXPIRIES, quotes: [{ strike: 2000 }] };
    const fetched: string[] = [];
    const r = await checkLegs([call(2250, '131126')], base, async (code) => { fetched.push(code); return { quotes: [{ strike: 2200 }, { strike: 2300 }, { strike: 2400 }] }; });
    expect(fetched).toEqual(['161126']);
    expect(r.legs[0]).toMatchObject({ expiry: '161126', strike: 2200 });
    expect(r.notes).toHaveLength(2);
  });

  it('uses the base chain for its own expiry and passes legs through when a chain fails', async () => {
    const base = { expiry: '161126', expiries: EXPIRIES, quotes: [{ strike: 2250 }] };
    const r = await checkLegs([call(2250, '161126'), call(5000, '271126')], base, async () => { throw new Error('down'); });
    expect(r.changed).toBe(false);
  });
});

describe('badLegIndex', () => {
  it('reads the leg number from a server message', () => {
    expect(badLegIndex('Leg 2: no ETH call at 2250 for 13 Nov.')).toBe(1);
    expect(badLegIndex('Something else')).toBeNull();
  });
});
