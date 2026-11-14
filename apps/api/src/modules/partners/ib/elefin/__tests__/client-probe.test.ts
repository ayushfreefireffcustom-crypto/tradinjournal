// The Elefin client and probe against a local fake of the Partner API.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { redactText } from '@tradinjournal/logger';
import { ElefinClient, ElefinError, resetElefinBudgets } from '../client.js';
import { probe } from '../probe.js';
import { FakeElefin } from './fake-elefin.js';

const noSleep: number[] = [];
const sleep = async (ms: number) => { noSleep.push(ms); };

describe('Elefin client', () => {
  const fake = new FakeElefin();
  let base = '';
  let full = '';
  beforeAll(async () => {
    base = await fake.start();
    fake.seed(230);
    full = fake.addKey({ abilities: ['profile', 'clients', 'accounts'], pii: true });
  });
  afterAll(() => fake.stop());
  beforeEach(() => { resetElefinBudgets(); noSleep.length = 0; fake.log.length = 0; fake.throttleNext = 0; fake.failNext = 0; });

  it('sends Bearer key.secret and walks every Laravel page', async () => {
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    const rows: unknown[] = [];
    for await (const p of c.pages('/accounts')) rows.push(...p.items);
    expect(rows).toHaveLength(230);
    expect(fake.log.map(l => l.query)).toEqual(['?per_page=100', '?per_page=100&page=2', '?per_page=100&page=3']);
    expect(fake.log.every(l => l.auth === 'bearer' && l.status === 200)).toBe(true);
  });

  it('maps 401, 403 and 404 to kinds', async () => {
    const bad = new ElefinClient({ baseUrl: base, token: 'elk_nope.wrongsecret', sleep });
    await expect(bad.get('/clients')).rejects.toMatchObject({ kind: 'auth', status: 401 });
    const noAcc = new ElefinClient({ baseUrl: base, token: fake.addKey({ abilities: ['clients'] }), sleep });
    await expect(noAcc.get('/accounts')).rejects.toMatchObject({ kind: 'forbidden', status: 403 });
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    await expect(c.get('/accounts/999999999')).rejects.toMatchObject({ kind: 'not_found', status: 404 });
    const expired = new ElefinClient({ baseUrl: base, token: fake.addKey({ abilities: ['clients'], expired: true }), sleep });
    await expect(expired.get('/clients')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('waits Retry-After on 429 and then succeeds', async () => {
    fake.throttleNext = 2; fake.retryAfter = 7;
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    await c.get('/clients');
    expect(noSleep).toEqual([7000, 7000]);
    expect(fake.log.map(l => l.status)).toEqual([429, 429, 200]);
  });

  it('gives up when Retry-After is too long, and reports the wait', async () => {
    fake.throttleNext = 1; fake.retryAfter = 600;
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    const e = await c.get('/clients').catch(x => x) as ElefinError;
    expect(e).toBeInstanceOf(ElefinError);
    expect(e).toMatchObject({ kind: 'rate_limited', retryAfter: 600 });
    expect(noSleep).toEqual([]);
  });

  it('retries a 500 then succeeds', async () => {
    fake.failNext = 1;
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    await c.get('/clients');
    expect(fake.log.map(l => l.status)).toEqual([500, 200]);
  });

  it('keeps under its own per-key budget', async () => {
    let t = 1_000_000;
    const waits: number[] = [];
    const c = new ElefinClient({ baseUrl: base, token: full, perMinute: 3, now: () => t, sleep: async ms => { waits.push(ms); t += ms; } });
    for (let i = 0; i < 4; i++) { await c.get('/clients'); t += 1000; }
    expect(waits).toEqual([57_000]);
    // A second client with the same key shares the budget.
    const c2 = new ElefinClient({ baseUrl: base, token: full, perMinute: 3, now: () => t, sleep: async ms => { waits.push(ms); t += ms; } });
    await c2.get('/clients');
    expect(waits.length).toBe(1);
    await c2.get('/clients');
    expect(waits.length).toBe(2);
  });

  it('refuses next links to another server', async () => {
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    expect(() => c.url('https://evil.example.com/steal')).toThrow(ElefinError);
  });

  it('never puts the key in an error, and the logger masks it', async () => {
    const tok = fake.addKey({ abilities: [] });
    const c = new ElefinClient({ baseUrl: base, token: tok, sleep });
    const e = await c.get('/clients').catch(x => x) as Error;
    expect(e.message).not.toContain(tok.split('.')[1]);
    expect(redactText(`failed with ${tok}`)).not.toContain(tok.split('.')[1]);
    expect(redactText(`Authorization: Bearer ${tok}`)).not.toContain(tok);
    expect(redactText('X-API-Key: elk_abcdef12 X-API-Secret: s3cr3tValue99')).not.toMatch(/s3cr3tValue99|elk_abcdef12/);
  });

  it('accepts cursor and links pagination', async () => {
    for (const pagination of ['cursor', 'links'] as const) {
      const f = new FakeElefin({ pagination });
      const b = await f.start();
      f.seed(120);
      const c = new ElefinClient({ baseUrl: b, token: f.addKey({ abilities: ['accounts'] }), sleep });
      let n = 0;
      for await (const p of c.pages('/accounts')) n += p.items.length;
      expect(n).toBe(120);
      await f.stop();
    }
  });
});

describe('probe', () => {
  const fake = new FakeElefin();
  let base = '';
  beforeAll(async () => { base = await fake.start(); fake.seed(42); });
  afterAll(() => fake.stop());
  beforeEach(() => { resetElefinBudgets(); fake.throttleNext = 0; });
  const run = (tok: string) => probe(new ElefinClient({ baseUrl: base, token: tok, sleep }));

  it('reports counts, abilities and field names for a full key', async () => {
    const r = await run(fake.addKey({ abilities: ['profile', 'clients', 'accounts'], pii: true, partnerId: 31 }));
    expect(r).toMatchObject({
      ok: true, outcome: 'ok', counts: { clients: 42, accounts: 42 }, hasLogin: true, hasEmail: true, missing: [],
      abilities: { profile: 'ok', clients: 'ok', accounts: 'ok' }, partnerRef: '31', paths: { clients: '/clients', accounts: '/accounts', profile: '/me' },
    });
    expect(r.fields.accounts).toContain('login');
    expect(r.message).toBe('Key works. 42 clients, 42 trading accounts found.');
    // Field names only: no values anywhere in the result.
    expect(JSON.stringify(r)).not.toContain('@mail.test');
    expect(JSON.stringify(r)).not.toContain('100001');
  });

  it('notes missing emails without failing (PII not ticked)', async () => {
    const r = await run(fake.addKey({ abilities: ['clients', 'accounts'] }));
    expect(r.ok).toBe(true);
    expect(r.hasEmail).toBe(false);
    expect(r.notes.join(' ')).toMatch(/Emails aren’t shared/);
    expect(r.abilities.profile).toBe('forbidden');
  });

  it('wrong key → invalid_key', async () => {
    const r = await run('elk_x.nope-nope-nope');
    expect(r).toMatchObject({ ok: false, outcome: 'invalid_key' });
  });

  it('no accounts ability → missing_permission, in plain words', async () => {
    const r = await run(fake.addKey({ abilities: ['clients'], pii: true }));
    expect(r).toMatchObject({ ok: false, outcome: 'missing_permission', abilities: { clients: 'ok', accounts: 'forbidden' } });
    expect(r.missing).toContain('read access to client trading accounts');
  });

  it('nothing readable → missing_permission for both', async () => {
    const r = await run(fake.addKey({ abilities: ['profile'] }));
    expect(r.outcome).toBe('missing_permission');
    expect(r.missing).toEqual(['read access to clients', 'read access to client trading accounts']);
  });

  it('login field withheld → no_logins', async () => {
    const r = await run(fake.addKey({ abilities: ['clients', 'accounts'], fields: { accounts: ['client_id', 'platform', 'volume_lots'] } }));
    expect(r).toMatchObject({ ok: false, outcome: 'no_logins' });
    expect(r.missing[0]).toMatch(/login/);
  });

  it('accounts only is enough', async () => {
    const r = await run(fake.addKey({ abilities: ['accounts'] }));
    expect(r).toMatchObject({ ok: true, counts: { clients: null, accounts: 42 } });
  });

  it('rate limited → tells the partner how long to wait', async () => {
    fake.throttleNext = 10; fake.retryAfter = 300;
    const r = await run(fake.addKey({ abilities: ['clients', 'accounts'] }));
    expect(r).toMatchObject({ ok: false, outcome: 'rate_limited', retryAfter: 300 });
  });

  it('finds an alternative accounts path', async () => {
    const f = new FakeElefin({ paths: { accounts: '/trading-accounts' } });
    const b = await f.start(); f.seed(3);
    const r = await probe(new ElefinClient({ baseUrl: b, token: f.addKey({ abilities: ['clients', 'accounts'] }), sleep }));
    expect(r).toMatchObject({ ok: true, paths: { accounts: '/trading-accounts' }, counts: { accounts: 3 } });
    await f.stop();
  });

  it('a partner with no clients yet still connects', async () => {
    const f = new FakeElefin();
    const b = await f.start();
    const r = await probe(new ElefinClient({ baseUrl: b, token: f.addKey({ abilities: ['clients', 'accounts'] }), sleep }));
    expect(r).toMatchObject({ ok: true, counts: { clients: 0, accounts: 0 } });
    expect(r.notes.join(' ')).toMatch(/No clients under you yet/);
    await f.stop();
  });
});
