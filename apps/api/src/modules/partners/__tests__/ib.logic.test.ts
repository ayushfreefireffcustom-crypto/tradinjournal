import { describe, it, expect } from 'vitest';
import {
  extendPeriod, parseEarnings, parsePostback, priceLabel, splitSale, dig,
  DEFAULT_SETTINGS, allowedPerks, decideVerification, evaluatePackage, isActiveTrader, mergeSettings, nextEntitlement,
  parseIbList, ruleText, sameState, type EntitlementState, type VerifyInput,
} from '../ib/ib.logic.js';
import { brokerKeyFor } from '../ib/brokers.js';
import { sheetCsvUrl } from '../ib/sources.js';

const DAY = 86_400_000;

describe('parseIbList', () => {
  it('reads a CSV with headers in any order', () => {
    const r = parseIbList('Email,Name,Account ID\nA@X.COM,Asha,7001001\nb@y.io,Ben,"7001002"\n,No account,\n');
    expect(r.rows).toEqual([{ accountId: '7001001', email: 'a@x.com' }, { accountId: '7001002', email: 'b@y.io' }]);
    expect(r.skipped).toBe(1);
  });
  it('reads pasted lines without a header, tabs or semicolons', () => {
    expect(parseIbList('7001001\n7001002 \n').rows.map(r => r.accountId)).toEqual(['7001001', '7001002']);
    expect(parseIbList('c@d.com\t5550001').rows).toEqual([{ accountId: '5550001', email: 'c@d.com' }]);
    expect(parseIbList('login;mail\n42001;e@f.org').rows).toEqual([{ accountId: '42001', email: 'e@f.org' }]);
  });
  it('dedupes accounts and keeps an email seen on an earlier row', () => {
    expect(parseIbList('account,email\n9001,a@b.co\n9001,\n').rows).toEqual([{ accountId: '9001', email: 'a@b.co' }]);
  });
  it('handles a BOM and blank input', () => {
    expect(parseIbList('﻿UID\n123456').rows).toEqual([{ accountId: '123456', email: null }]);
    expect(parseIbList('  \n')).toEqual({ rows: [], skipped: 0 });
  });
});

describe('decideVerification', () => {
  const base: VerifyInput = {
    partnerName: 'Honey', brokerKey: 'xellion', brokerLabel: 'Xellion', partnerBrokers: ['xellion'],
    listedHere: null, listedElsewhere: false, emailListed: false, prev: null,
  };
  it('verifies only on the account number', () => {
    expect(decideVerification({ ...base, listedHere: { id: 'ib1' } })).toMatchObject({ status: 'VERIFIED', method: 'account', ibAccountId: 'ib1' });
  });
  it('sends an email-only match to review, never to verified', () => {
    const o = decideVerification({ ...base, emailListed: true });
    expect(o.status).toBe('MANUAL_REVIEW');
    expect(o.signal).toBe('email-match');
  });
  it('explains a missing account and flags another partner’s IB', () => {
    expect(decideVerification(base)).toMatchObject({ status: 'NOT_FOUND', signal: null });
    const o = decideVerification({ ...base, listedElsewhere: true });
    expect(o).toMatchObject({ status: 'NOT_FOUND', signal: 'other-partner' });
    expect(o.reason).toMatch(/different partner/);
  });
  it('marks brokers the partner has not connected', () => {
    expect(decideVerification({ ...base, brokerKey: 'exness', brokerLabel: 'Exness' }).status).toBe('UNSUPPORTED_BROKER');
    expect(decideVerification({ ...base, brokerKey: null }).reason).toMatch(/couldn’t tell which broker/);
  });
  it('keeps admin decisions and requested reviews', () => {
    expect(decideVerification({ ...base, listedHere: { id: 'x' }, prev: { status: 'REJECTED', method: 'manual', reviewRequestedAt: null } }).status).toBe('REJECTED');
    expect(decideVerification({ ...base, prev: { status: 'VERIFIED', method: 'manual', reviewRequestedAt: null } }).status).toBe('VERIFIED');
    expect(decideVerification({ ...base, prev: { status: 'NOT_FOUND', method: null, reviewRequestedAt: new Date() } }).status).toBe('MANUAL_REVIEW');
    // An automatic match still wins over a pending review.
    expect(decideVerification({ ...base, listedHere: { id: 'x' }, prev: { status: 'MANUAL_REVIEW', method: null, reviewRequestedAt: new Date() } }).status).toBe('VERIFIED');
  });
});

describe('evaluatePackage', () => {
  const pkg = { status: 'LIVE', brokers: [] as string[], requireActive: true };
  const base = { partnerName: 'Honey', partnerActive: true, pkg, verifiedBrokers: ['xellion'], activeTrader: true, rule: DEFAULT_SETTINGS };
  it('qualifies a verified active trader', () => {
    expect(evaluatePackage(base)).toEqual({ qualifies: true, reasons: [], partnerPaused: false, canSubscribe: true });
  });
  it('lists every reason it is locked', () => {
    const e = evaluatePackage({ ...base, partnerActive: false, verifiedBrokers: [], activeTrader: false });
    expect(e.qualifies).toBe(false);
    expect(e.partnerPaused).toBe(true);
    expect(e.reasons).toHaveLength(3);
    expect(e.reasons[2]).toBe('Trade at least 1 closed trade in the last 30 days.');
  });
  it('honours the package’s broker list and the activity switch', () => {
    expect(evaluatePackage({ ...base, pkg: { ...pkg, brokers: ['elefin'] } }).qualifies).toBe(false);
    expect(evaluatePackage({ ...base, pkg: { ...pkg, requireActive: false }, activeTrader: false }).qualifies).toBe(true);
    expect(evaluatePackage({ ...base, pkg: { ...pkg, status: 'ARCHIVED' } }).qualifies).toBe(false);
  });
});

describe('nextEntitlement', () => {
  const now = new Date('2026-11-03T00:00:00Z');
  const yes = { qualifies: true, reasons: [], partnerPaused: false };
  const no = { qualifies: false, reasons: ['Verify a broker account.'], partnerPaused: false };
  const rule = { ...DEFAULT_SETTINGS, graceDays: 7, partnerGraceDays: 3 };
  const active: EntitlementState = { status: 'ACTIVE', grantedAt: new Date(now.getTime() - 10 * DAY), expiresAt: null, graceUntil: null, suspendedAt: null, reason: null };

  it('grants on first qualify, with an expiry when the package has access days', () => {
    expect(nextEntitlement(null, no, null, rule, now)).toBeNull();
    expect(nextEntitlement(null, yes, null, rule, now)).toMatchObject({ status: 'ACTIVE', expiresAt: null });
    expect(nextEntitlement(null, yes, 30, rule, now)!.expiresAt).toEqual(new Date(now.getTime() + 30 * DAY));
  });
  it('goes through grace before suspending, and restores on requalify', () => {
    const g = nextEntitlement(active, no, null, rule, now)!;
    expect(g).toMatchObject({ status: 'GRACE', graceUntil: new Date(now.getTime() + 7 * DAY), reason: 'Verify a broker account.' });
    expect(nextEntitlement(g, no, null, rule, new Date(now.getTime() + 3 * DAY))!.status).toBe('GRACE');
    const s = nextEntitlement(g, no, null, rule, new Date(now.getTime() + 8 * DAY))!;
    expect(s.status).toBe('SUSPENDED');
    expect(nextEntitlement(s, yes, null, rule, new Date(now.getTime() + 9 * DAY))).toMatchObject({ status: 'ACTIVE', suspendedAt: null, reason: null });
  });
  it('uses the partner grace period when the partner is paused, and none when it is 0', () => {
    expect(nextEntitlement(active, { ...no, partnerPaused: true }, null, rule, now)!.graceUntil).toEqual(new Date(now.getTime() + 3 * DAY));
    expect(nextEntitlement(active, no, null, { ...rule, graceDays: 0 }, now)!.status).toBe('SUSPENDED');
  });
  it('expires at the end of the access period and stays expired', () => {
    const e = nextEntitlement({ ...active, expiresAt: now }, yes, 30, rule, now)!;
    expect(e.status).toBe('EXPIRED');
    expect(nextEntitlement(e, yes, 30, rule, new Date(now.getTime() + DAY))).toBe(e);
  });
  it('detects no-op transitions', () => {
    expect(sameState(active, nextEntitlement(active, yes, null, rule, now)!)).toBe(true);
  });
});

describe('settings and perks', () => {
  it('merges stored settings with defaults and clamps them', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ activeMinTrades: 5, activeWindowDays: 9999, graceDays: -3, lockedPerks: ['signalx', 4] }))
      .toEqual({ ...DEFAULT_SETTINGS, activeMinTrades: 5, activeWindowDays: 365, graceDays: 0, lockedPerks: ['signalx'] });
  });
  it('applies the active-trader rule', () => {
    const rule = { ...DEFAULT_SETTINGS, activeMinTrades: 2, activeMinLots: 1 };
    expect(isActiveTrader({ tradesInWindow: 2, lotsInWindow: 1 }, rule)).toBe(true);
    expect(isActiveTrader({ tradesInWindow: 2, lotsInWindow: 0.5 }, rule)).toBe(false);
    expect(ruleText(rule)).toBe('2 closed trades and 1 lots in the last 30 days');
  });
  it('unlocks locked perks only through live packages', () => {
    const all = ['signalx', 'options', 'macro'];
    expect(allowedPerks([], [], all)).toEqual(all);
    expect(allowedPerks(['signalx', 'options'], [{ status: 'GRACE', perks: ['signalx'] }, { status: 'SUSPENDED', perks: ['options'] }], all)).toEqual(['signalx', 'macro']);
  });
});

describe('broker matching and sheet links', () => {
  it('maps MT5 broker names and servers to catalog keys', () => {
    expect(brokerKeyFor({ broker: 'Xellion Markets Ltd', server: 'Xellion-Live' })).toBe('xellion');
    expect(brokerKeyFor({ broker: 'ElefinMarkets', server: 'ElefinMarkets-Server' })).toBe('elefin');
    expect(brokerKeyFor({ broker: 'Exness Technologies', server: 'Exness-MT5Real8' })).toBe('exness');
    expect(brokerKeyFor({ broker: 'Acme', server: 'AcmeFX-Live2' })).toBeNull();
    expect(brokerKeyFor({ broker: 'Acme', server: 'AcmeFX-Live2' }, [{ serverMatch: 'acmefx' }])).toBe('other');
  });
  it('accepts only Google Sheets links and builds the CSV export URL', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=42')).toBe('https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=42');
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml')).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv');
    expect(sheetCsvUrl('http://docs.google.com/spreadsheets/d/abc/edit')).toBeNull();
    expect(sheetCsvUrl('https://169.254.169.254/latest')).toBeNull();
    expect(sheetCsvUrl('https://docs.google.com.evil.io/spreadsheets/d/abc')).toBeNull();
  });
});

describe('phase 2 rules', () => {
  const base: VerifyInput = {
    partnerName: 'Honey', brokerKey: 'xellion', brokerLabel: 'Xellion', partnerBrokers: ['xellion'],
    listedHere: { id: 'ib1' }, listedElsewhere: false, emailListed: false, prev: null,
  };
  it('never auto-verifies an account we could not log into', () => {
    const o = decideVerification({ ...base, ownershipProven: false });
    expect(o).toMatchObject({ status: 'MANUAL_REVIEW', signal: 'listed-unproven', ibAccountId: 'ib1' });
    expect(decideVerification({ ...base, ownershipProven: true }).status).toBe('VERIFIED');
  });

  it('asks for payment last, and only once everything else is met', () => {
    const pkg = { status: 'LIVE', brokers: [] as string[], requireActive: false, priceCents: 1900 };
    const ok = { partnerName: 'Honey', partnerActive: true, pkg, verifiedBrokers: ['xellion'], activeTrader: true, rule: DEFAULT_SETTINGS, priceLabel: '$19 / month' };
    expect(evaluatePackage(ok)).toEqual({ qualifies: false, reasons: ['Subscribe ($19 / month) to unlock.'], partnerPaused: false, canSubscribe: true });
    expect(evaluatePackage({ ...ok, paid: true }).qualifies).toBe(true);
    const notVerified = evaluatePackage({ ...ok, verifiedBrokers: [] });
    expect(notVerified.canSubscribe).toBe(false);
    expect(evaluatePackage({ ...ok, paid: true, pkg: { ...pkg, adminHold: true } }).reasons).toContain('TRADElogs has paused this package.');
  });

  it('splits sales in the partner’s favour and extends paid periods', () => {
    expect(splitSale(1999, 80)).toEqual({ partnerCents: 1600, platformCents: 399 });
    expect(splitSale(1000, 100)).toEqual({ partnerCents: 1000, platformCents: 0 });
    const now = new Date('2026-11-04T00:00:00Z');
    expect(extendPeriod(null, 30, now)).toEqual(new Date('2026-12-04T00:00:00Z'));
    expect(extendPeriod(new Date('2026-11-10T00:00:00Z'), 30, now)).toEqual(new Date('2026-12-10T00:00:00Z'));
    expect(extendPeriod(new Date('2026-10-01T00:00:00Z'), 30, now)).toEqual(new Date('2026-12-04T00:00:00Z'));
    expect(priceLabel(1900, 'USD', 30)).toBe('$19 / month');
    expect(priceLabel(149950, 'INR', 365)).toBe('₹1,499.50 / year');
  });

  it('reads postbacks with different brokers’ parameter names', () => {
    expect(parsePostback({ event: 'registration', login: '7001001', email: 'A@B.CO' })).toMatchObject({ kind: 'registration', accountId: '7001001', email: 'a@b.co' });
    expect(parsePostback({ type: 'FTD', account_id: '55', amount: '250.5' })).toMatchObject({ kind: 'deposit', accountId: null, amount: 250.5 });
    expect(parsePostback({ action: 'trade', uid: 'X9912', lots: '1.25', date: '1793750400' })).toMatchObject({ kind: 'trade', accountId: 'X9912', lots: 1.25, at: new Date(1793750400 * 1000) });
    expect(parsePostback({ goal: 'commission', trader_id: '7001001', payout: '12.40', currency: 'usd', txn_id: 'T-1' })).toMatchObject({ kind: 'commission', amount: 12.4, currency: 'USD', eventId: 'T-1' });
    expect(parsePostback({ foo: 'bar' }).kind).toBe('unknown');
  });

  it('reads commission reports and makes stable ids without one', () => {
    const r = parseEarnings('Date,Client Account,Commission,Currency\n2026-10-01,7001001,"12.50",USD\n2026-10-02,7001002,-3,USD\nbad,1,x,USD\n', 'USD');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ accountId: '7001001', amount: 12.5, currency: 'USD', externalId: '2026-10-01:7001001:12.5' });
    expect(r.rows[1]!.amount).toBe(-3);
    expect(r.skipped).toBe(1);
    expect(parseEarnings('account,amount\n1,2', 'USD').rows).toEqual([]);
  });

  it('reads nested API fields', () => {
    expect(dig({ data: { items: [1] } }, 'data.items')).toEqual([1]);
    expect(dig({ a: 1 }, '')).toEqual({ a: 1 });
    expect(dig({ a: 1 }, 'b.c')).toBeUndefined();
  });
});
