import { describe, it, expect } from 'vitest';
import { readPage, readRecord, toAccount, toClient, fieldNames, detect, loginOf, emailOf, dateOf } from '../fields.js';
import { baseUrlAllowed } from '../config.js';
import { parseRetryAfter } from '../client.js';

describe('readPage', () => {
  it('reads Elefin’s envelope with a Laravel paginator', () => {
    const p = readPage({ success: true, data: { data: [{ login: 1 }, { login: 2 }], meta: { current_page: 1, per_page: 2, last_page: 3, total: 5 } } });
    expect(p.items).toHaveLength(2);
    expect(p.total).toBe(5);
    expect(p.next).toEqual({ kind: 'page', page: 2 });
  });
  it('stops on the last page', () => {
    expect(readPage({ success: true, data: { data: [{}], meta: { current_page: 3, last_page: 3, total: 5 } } }).next).toBeNull();
  });
  it('follows links.next and flat next_page_url', () => {
    expect(readPage({ data: [{}], links: { next: 'https://x/api?page=2' }, meta: { total: 9 } }).next).toEqual({ kind: 'url', url: 'https://x/api?page=2' });
    expect(readPage({ data: [{}], current_page: 1, next_page_url: 'https://x/?page=2', total: 3 }).next).toEqual({ kind: 'url', url: 'https://x/?page=2' });
  });
  it('reads cursors', () => {
    expect(readPage({ success: true, data: { data: [{}], meta: { next_cursor: 'abc' } } }).next).toEqual({ kind: 'cursor', cursor: 'abc' });
  });
  it('reads plain arrays and other list keys', () => {
    expect(readPage([{ a: 1 }]).items).toHaveLength(1);
    expect(readPage({ results: [{ a: 1 }, { a: 2 }] }).items).toHaveLength(2);
  });
  it('works out more pages from total and per_page when last_page is missing', () => {
    expect(readPage({ data: [{}, {}], meta: { current_page: 1, per_page: 2, total: 3 } }).next).toEqual({ kind: 'page', page: 2 });
  });
  it('never asks for more after an empty page', () => {
    expect(readPage({ data: [], meta: { current_page: 1, last_page: 4 } }).next).toBeNull();
  });
  it('throws when there is no list', () => {
    expect(() => readPage({ success: true, data: { id: 1 } })).toThrow();
  });
});

describe('records and fields', () => {
  it('unwraps single records', () => {
    expect(readRecord({ success: true, data: { id: 7, name: 'X' } })).toEqual({ id: 7, name: 'X' });
    expect(readRecord({ data: { id: 7 } })).toEqual({ id: 7 });
  });
  it('lists field names, never values', () => {
    expect(fieldNames({ login: 1, client: { email: 'a@b.c', id: 'C1' } })).toEqual(['login', 'client.email', 'client.id']);
  });
  it('detects logins under any of the usual names', () => {
    for (const k of ['login', 'mt5_login', 'account_number', 'trading_account', 'account']) {
      expect(toAccount({ [k]: 100009 })?.login).toBe('100009');
    }
    expect(toAccount({ login: '  100009 ' })?.login).toBe('100009');
    expect(toAccount({ id: 5, name: 'x' })).toBeNull();
    expect(toAccount({ login: 'bad login!' })).toBeNull();
  });
  it('reads activity, tolerant of strings', () => {
    const a = toAccount({ login: 1001, client_id: 'C1', total_deposits: '250.5', volume_lots: 3, last_trade_at: '2026-11-01T10:00:00Z', platform: 'mt5', client: { email: 'X@Y.io' } })!;
    expect(a).toMatchObject({ login: '1001', clientId: 'C1', depositTotal: 250.5, lotsTotal: 3, platform: 'MT5', email: 'x@y.io' });
    expect(a.lastTradeAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });
  it('reads accounts nested in client rows, or a login on the client itself', () => {
    const c = toClient({ id: 'C9', email: 'c9@mail.test', accounts: [{ login: 501 }, 502, { nothing: 1 }] })!;
    expect(c.accounts.map(a => [a.login, a.clientId, a.email])).toEqual([['501', 'C9', 'c9@mail.test'], ['502', 'C9', 'c9@mail.test']]);
    expect(toClient({ id: 'C1', mt5_login: 777 })!.accounts.map(a => a.login)).toEqual(['777']);
    expect(toClient({ id: 'C1', name: 'no accounts' })!.accounts).toEqual([]);
  });
  it('detect() reports login and email presence', () => {
    expect(detect([{ login: 1 }], 'accounts')).toEqual({ hasLogin: true, hasEmail: false });
    expect(detect([{ id: 'C1', email: 'a@b.co' }], 'clients')).toEqual({ hasLogin: false, hasEmail: true });
  });
  it('validates values', () => {
    expect(loginOf(0)).toBeNull();
    expect(loginOf(12.5)).toBeNull();
    expect(emailOf('nope')).toBeNull();
    expect(dateOf('1990-01-01')).toBeNull();
    expect(dateOf(1_762_000_000)?.getUTCFullYear()).toBe(2025);
  });
});

describe('base URL allow-list', () => {
  it('allows the default and elefin.com over https only', () => {
    expect(baseUrlAllowed('https://my.elefin.com/api/v1')).toBe(true);
    expect(baseUrlAllowed('https://partners.elefin.com/api/v1')).toBe(true);
    expect(baseUrlAllowed('http://my.elefin.com/api/v1')).toBe(false);
    expect(baseUrlAllowed('https://elefin.com.evil.io/api')).toBe(false);
    expect(baseUrlAllowed('https://evil.io/api')).toBe(false);
    expect(baseUrlAllowed('https://user:pw@my.elefin.com/api')).toBe(false);
    expect(baseUrlAllowed('not a url')).toBe(false);
  });
  it('allows hosts an admin approved', () => {
    expect(baseUrlAllowed('https://api.elefin-partners.net/v1', ['elefin-partners.net'])).toBe(true);
  });
});

describe('Retry-After', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('17')).toBe(17);
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThanOrEqual(4);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('connect input', async () => {
  const { elefinConnectSchema, elefinTestSchema } = await import('@tradinjournal/contracts');
  it('accepts key.secret and trims it', () => {
    expect(elefinConnectSchema.parse({ key: '  elk_7Hq2mN4p.x9TzQw3LkV5b  ' }).key).toBe('elk_7Hq2mN4p.x9TzQw3LkV5b');
  });
  it('rejects a key without the secret, with spaces, or too short', () => {
    for (const key of ['elk_7Hq2mN4pR8x9TzQw', 'elk_7Hq2 mN4p.x9TzQw3', 'a.b', '.secretsecretsecret']) {
      expect(elefinConnectSchema.safeParse({ key }).success).toBe(false);
    }
  });
  it('test input may omit the key (tests the saved one)', () => {
    expect(elefinTestSchema.parse({})).toEqual({});
  });
});
