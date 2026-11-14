// Pure pieces: the compact per-client tuple, the overview snapshot, reading old (v1)
// configs, and what Elefin's answer means for a trader.
import { describe, it, expect } from 'vitest';
import { elefinConfigOf, snapshotOf, toEntry, type RosterEntry } from '../store.js';
import { decideElefin, clientIdOfRef, clientRef } from '../verify.js';
import { elefinClient, lookupData } from '../schema.js';

const NOW = new Date('2026-11-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const row = (over: Record<string, unknown> = {}) => elefinClient.parse({
  client_id: 10001, name: 'Test Client', country: 'India', status: 'active', registered_at: daysAgo(40), referred_at: daysAgo(3), referral_code: 'ELEFIN-1',
  funding: { currency: 'USD', deposits: 1000.1, first_deposit_at: daysAgo(2), is_funded: true }, trading: { lots: 0.64, last_trade_at: daysAgo(1) }, ...over,
});

describe('roster tuples and snapshot', () => {
  it('keeps only numbers, dates and status — no name, country or code', () => {
    const e = toEntry(row());
    expect(e).toEqual([1000.1, 0.64, Math.floor(Date.parse(daysAgo(1)) / 1000), 1, 'a', Math.floor(Date.parse(daysAgo(3)) / 1000)]);
    expect(JSON.stringify(e)).not.toMatch(/Test Client|India|ELEFIN/);
    // No referred_at: the registration date stands in.
    expect(toEntry(row({ referred_at: null }))[5]).toBe(Math.floor(Date.parse(daysAgo(40)) / 1000));
  });

  it('sums money in cents and counts quiet, never-traded and new clients', () => {
    const entries: RosterEntry[] = [
      toEntry(row()),
      toEntry(row({ client_id: 2, funding: { deposits: 0.2, first_deposit_at: null, is_funded: false }, trading: { lots: 0, last_trade_at: null }, referred_at: daysAgo(10) })),
      toEntry(row({ client_id: 3, funding: { deposits: 0.1, first_deposit_at: daysAgo(90), is_funded: true }, trading: { lots: 1.11, last_trade_at: daysAgo(45) }, referred_at: daysAgo(100) })),
      toEntry(row({ client_id: 4, status: 'suspended', trading: { lots: 2, last_trade_at: null }, referred_at: daysAgo(50) })),
    ];
    const s = snapshotOf(entries, { now: NOW, fullAt: NOW.toISOString(), quietDays: 30 });
    expect(s).toMatchObject({ total: 4, active: 3, suspended: 1, inactive: 0, funded: 3, neverTraded: 2, new7d: 1, new30d: 2, quiet: 1 });
    expect(s.depositsUsd).toBe(2000.5); // summed in cents: no 2000.4999…
    expect(s.lots).toBe(3.75);
    expect(s.weekly).toEqual([1, 0, 0, 0, 0, 0, 1, 1]); // 50, 10 and 3 days ago; 100 is out of range
    expect(s.newestAt).toBe(new Date(Math.floor(Date.parse(daysAgo(3)) / 1000) * 1000).toISOString());
  });
});

describe('config', () => {
  it('reads a pre-spec (v1) connection: keeps the key, forgets the guessed data', () => {
    const c = elefinConfigOf({ apiConfig: { provider: 'elefin', baseUrl: 'https://my.elefin.com/api/v1', keyHint: '••••ab12', paths: { clients: '/clients' }, counts: { clients: 3 }, dropGuard: null, authFailures: 1 } });
    expect(c).toMatchObject({ v: 2, keyHint: '••••ab12', key: null, snapshot: null, authFailures: 1, roster: { syncStartedAt: null, fullAt: null, clients: {} } });
    expect(elefinConfigOf({ apiConfig: { provider: 'other', baseUrl: 'x' } })).toBeNull();
  });
});

describe('what Elefin’s answer means', () => {
  it('active → verified, suspended / inactive → held, miss → not found', () => {
    expect(decideElefin({ affiliated: true, clientId: 7, status: 'active' }, 'Riya')).toMatchObject({ status: 'VERIFIED', signal: 'elefin-active', ibAccountId: 'elefin-client:7', reason: null });
    expect(decideElefin({ affiliated: true, clientId: 7, status: 'inactive' }, 'Riya')).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-inactive', ibAccountId: 'elefin-client:7' });
    const miss = decideElefin({ affiliated: false }, 'Riya');
    expect(miss).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-none', ibAccountId: null });
    expect(miss.reason).toMatch(/Riya/);
    expect(clientIdOfRef(clientRef(10001))).toBe('10001');
    expect(clientIdOfRef('abc')).toBeNull();
  });

  it('parses the documented lookup answers and rejects anything else', () => {
    expect(lookupData.parse({ affiliated: false })).toEqual({ affiliated: false });
    expect(lookupData.parse({ affiliated: true, ...row(), extra: 1 })).toMatchObject({ affiliated: true, client_id: 10001, status: 'active' });
    expect(lookupData.safeParse({ affiliated: true }).success).toBe(false);
    expect(lookupData.safeParse({ affiliated: 'yes' }).success).toBe(false);
    expect(elefinClient.safeParse({ ...row(), status: 'deleted' }).success).toBe(false);
  });
});
