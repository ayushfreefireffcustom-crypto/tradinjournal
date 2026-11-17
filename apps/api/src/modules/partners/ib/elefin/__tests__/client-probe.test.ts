// The Elefin client and probe against a local fake of the published Partner API.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { redactText } from '@tradinjournal/logger';
import { ElefinClient, ElefinError, parseRetryAfter, resetElefinBudgets } from '../client.js';
import { abilitiesCoverClients, baseUrlAllowed } from '../config.js';
import { probe } from '../probe.js';
import { DOCUMENTED_FIELDS } from '../schema.js';
import { FakeElefin } from './fake-elefin.js';

const slept: number[] = [];
const sleep = async (ms: number) => { slept.push(ms); };

describe('Elefin client', () => {
  const fake = new FakeElefin();
  let base = '';
  let full = '';
  beforeAll(async () => {
    base = await fake.start();
    fake.seed(450);
    full = fake.addKey();
  });
  afterAll(() => fake.stop());
  beforeEach(() => { resetElefinBudgets(); slept.length = 0; fake.log.length = 0; fake.throttleNext = 0; fake.failNext = 0; });

  it('sends Bearer key.secret, unwraps the envelope and walks pages of 200', async () => {
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    const me = await c.get('/me') as { scope: { partner: { id: number } } };
    expect(me.scope.partner.id).toBe(1);
    const rows: unknown[] = [];
    for await (const p of c.pages('/clients')) rows.push(...p.rows);
    expect(rows).toHaveLength(450);
    expect(fake.log.slice(1).map(l => l.query)).toEqual(['?per_page=200&page=1', '?per_page=200&page=2', '?per_page=200&page=3']);
    expect(fake.log.every(l => l.auth === 'bearer' && l.status === 200)).toBe(true);
    expect(c.rate).toMatchObject({ limit: 60 });
    expect(c.rate.remaining).toBeLessThan(60);
  });

  it('401, 403 and 404 are terminal: one request each, mapped to kinds', async () => {
    const cases: [string, string, string][] = [
      ['fxcrm_pk_nope.fxcrm_sk_wrongsecret', '/me', 'auth'],
      [fake.addKey({ active: false }), '/me', 'auth'],
      [fake.addKey({ expiresAt: '2026-01-01T00:00:00Z' }), '/me', 'auth'],
      [fake.addKey({ abilities: [] }), '/clients', 'forbidden'],
      [fake.addKey({ partnerId: null }), '/me', 'forbidden'],
      [full, '/clients/999999', 'not_found'],
    ];
    for (const [tok, path, kind] of cases) {
      fake.log.length = 0;
      const e = await new ElefinClient({ baseUrl: base, token: tok, sleep }).get(path).catch(x => x) as ElefinError;
      expect(e).toBeInstanceOf(ElefinError);
      expect(e.kind).toBe(kind);
      expect(fake.log).toHaveLength(1);
    }
    expect(slept).toEqual([]);
  });

  it('a client in another partner’s book is 404, like one that doesn’t exist', async () => {
    const other = fake.add({ partnerId: 2 });
    fake.partners.set(2, 'Other Partner');
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    await expect(c.get(`/clients/${other.client_id}`)).rejects.toMatchObject({ kind: 'not_found' });
    const mine = fake.clients.find(x => x.partnerId === 1)!;
    expect(await c.get(`/clients/${mine.client_id}`)).toMatchObject({ client_id: mine.client_id });
  });

  it('either half of the key alone is refused', async () => {
    const [key, secret] = full.split('.');
    for (const tok of [`${key}.`, `.${secret}`]) {
      const e = await new ElefinClient({ baseUrl: base, token: tok!, sleep }).get('/me').catch(x => x) as ElefinError;
      expect(e.kind).toBe('auth');
    }
  });

  it('waits Retry-After on 429 and then succeeds', async () => {
    fake.throttleNext = 2; fake.retryAfter = 7;
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    await c.get('/me');
    expect(slept).toEqual([7000, 7000]);
    expect(fake.log.map(l => l.status)).toEqual([429, 429, 200]);
  });

  it('gives up when Retry-After is too long, and reports the wait', async () => {
    fake.throttleNext = 1; fake.retryAfter = 600;
    const e = await new ElefinClient({ baseUrl: base, token: full, sleep }).get('/me').catch(x => x) as ElefinError;
    expect(e).toMatchObject({ kind: 'rate_limited', retryAfter: 600 });
    expect(slept).toEqual([]);
  });

  it('backs off exponentially on 5xx, then gives up', async () => {
    fake.failNext = 3;
    await new ElefinClient({ baseUrl: base, token: full, sleep }).get('/me');
    expect(slept).toEqual([1000, 2000, 4000]);
    slept.length = 0; fake.failNext = 10;
    await expect(new ElefinClient({ baseUrl: base, token: full, sleep }).get('/me')).rejects.toMatchObject({ kind: 'server', status: 500 });
    expect(slept).toEqual([1000, 2000, 4000]);
    fake.failNext = 0;
  });

  it('success:false or a broken envelope in a 200 is a bad response', async () => {
    const answer = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });
    const mk = (body: unknown) => new ElefinClient({ baseUrl: base, token: full, sleep, fetchImpl: answer(body) });
    await expect(mk({ success: false, message: 'nope' }).get('/me')).rejects.toMatchObject({ kind: 'bad_response' });
    await expect(mk({ data: [] }).get('/me')).rejects.toMatchObject({ kind: 'bad_response' });
    await expect(mk({ success: true, data: { data: [], meta: {} } }).page('/clients')).rejects.toMatchObject({ kind: 'bad_response' });
    // Extra keys are fine.
    expect(await mk({ success: true, message: 'Success', data: { x: 1 }, trace_id: 'abc' }).get('/me')).toEqual({ x: 1 });
  });

  it('keeps under its own per-key budget, shared by every client on the key', async () => {
    let t = 1_000_000;
    const waits: number[] = [];
    const opts = { baseUrl: base, token: full, perMinute: 3, now: () => t, sleep: async (ms: number) => { waits.push(ms); t += ms; } };
    const c = new ElefinClient(opts);
    for (let i = 0; i < 4; i++) { await c.get('/me'); t += 1000; }
    expect(waits).toEqual([57_000]);
    const c2 = new ElefinClient(opts);
    await c2.get('/me');
    expect(waits.length).toBe(1);
    await c2.get('/me');
    expect(waits.length).toBe(2);
  });

  it('refuses URLs outside the configured base', () => {
    const c = new ElefinClient({ baseUrl: base, token: full, sleep });
    expect(() => c.url('https://evil.example.com/steal')).toThrow(ElefinError);
    expect(() => c.url('//evil.example.com/steal')).toThrow(ElefinError);
  });

  it('never puts the key or a looked-up email in an error, and the logger masks the key', async () => {
    const tok = fake.addKey({ abilities: [] });
    const e = await new ElefinClient({ baseUrl: base, token: tok, sleep }).get('/clients/lookup', { email: 'secret.person@mail.test' }).catch(x => x) as ElefinError;
    expect(e.message).not.toContain(tok.split('.')[1]);
    expect(`${e.message} ${e.path}`).not.toContain('secret.person');
    expect(redactText(`failed with ${tok}`)).not.toContain(tok.split('.')[1]);
    expect(redactText(`Authorization: Bearer ${tok}`)).not.toContain(tok);
  });

  it('parses Retry-After and approves only Elefin’s API host', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(null)).toBeNull();
    expect(baseUrlAllowed('https://partnersapi.elefin.com/api/v1')).toBe(true);
    expect(baseUrlAllowed('http://partnersapi.elefin.com/api/v1')).toBe(false);
    expect(baseUrlAllowed('https://my.elefin.com/api/v1')).toBe(false);
    expect(baseUrlAllowed('https://evil.com/api')).toBe(false);
    expect(baseUrlAllowed('https://user:pw@partnersapi.elefin.com/api/v1')).toBe(false);
    expect(baseUrlAllowed('https://api.broker.test/v1', ['broker.test'])).toBe(true);
  });
});

describe('probe', () => {
  const fake = new FakeElefin();
  let base = '';
  beforeAll(async () => { base = await fake.start(); fake.seed(42); });
  afterAll(() => fake.stop());
  beforeEach(() => { resetElefinBudgets(); fake.throttleNext = 0; fake.log.length = 0; });
  const run = (tok: string, b = base) => probe(new ElefinClient({ baseUrl: b, token: tok, sleep }));

  it('reports who the key belongs to, its abilities and the book size — never a value', async () => {
    const r = await run(fake.addKey({ name: 'TRADElogs', expiresAt: '2027-06-01T00:00:00Z' }));
    expect(r).toMatchObject({
      ok: true, outcome: 'ok', clients: 42, clientsRead: 'ok', missing: [],
      key: { partnerId: 1, partnerName: 'Test Partner', keyName: 'TRADElogs', abilities: ['clients.read'], canReadClients: true, rateLimitPerMinute: 60, expiresAt: '2027-06-01T00:00:00.000Z', tradesFrom: '2026-01-01T00:00:00.000Z' },
    });
    expect(r.fields).toEqual([...DOCUMENTED_FIELDS]);
    expect(r.notes).toEqual([]);
    expect(r.message).toBe('Key works for Test Partner. 42 clients in your book.');
    // /me, then a single row of /clients.
    expect(fake.log.map(l => `${l.path}${l.query}`)).toEqual(['/me', '/clients?per_page=1&page=1']);
    const out = JSON.stringify(r);
    for (const c of fake.clients) { expect(out).not.toContain(c.name); expect(out).not.toContain(c.email); }
  });

  it('no clients.read → still tries the list, and Elefin’s refusal decides', async () => {
    const r = await run(fake.addKey({ abilities: [] }));
    expect(r).toMatchObject({ ok: false, outcome: 'missing_permission', clientsRead: 'forbidden', key: { canReadClients: false } });
    expect(r.missing[0]).toMatch(/clients\.read/);
    expect(r.message).toMatch(/Elefin says/);
    expect(fake.log.map(l => l.path)).toEqual(['/me', '/clients']);
  });

  it('a key whose /me lists no abilities but can read clients is OK (the live Elefin answer)', async () => {
    const r = await run(fake.addKey({ hideAbilities: true }));
    expect(r).toMatchObject({ ok: true, outcome: 'ok', clientsRead: 'ok', key: { abilities: [], canReadClients: true } });
  });

  it('reads the abilities however Elefin spells them', () => {
    for (const a of [['clients.read'], ['clients:read'], ['read:clients'], ['clients.*'], ['*'], ['clients'], ['Clients.List']]) expect(abilitiesCoverClients(a)).toBe(true);
    for (const a of [[], ['trades.read'], ['clientsread'], ['me']]) expect(abilitiesCoverClients(a)).toBe(false);
  });

  it('wrong, switched-off or expired key → invalid_key', async () => {
    for (const tok of ['fxcrm_pk_x.fxcrm_sk_nope', fake.addKey({ active: false }), fake.addKey({ expiresAt: '2026-01-01T00:00:00Z' })]) {
      expect(await run(tok)).toMatchObject({ ok: false, outcome: 'invalid_key', key: null });
    }
  });

  it('partner gone → refused in plain words', async () => {
    const r = await run(fake.addKey({ partnerId: null }));
    expect(r).toMatchObject({ ok: false, outcome: 'missing_permission' });
    expect(r.message).toMatch(/no longer exists/);
  });

  it('warns about a key that expires soon', async () => {
    const r = await run(fake.addKey({ expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }));
    expect(r.ok).toBe(true);
    expect(r.notes.join(' ')).toMatch(/expires in 3 days/);
  });

  it('rate limited → tells the partner how long to wait', async () => {
    fake.throttleNext = 10; fake.retryAfter = 300;
    expect(await run(fake.addKey())).toMatchObject({ ok: false, outcome: 'rate_limited', retryAfter: 300 });
  });

  it('a partner with no clients yet still connects', async () => {
    const f = new FakeElefin();
    const b = await f.start();
    const r = await run(f.addKey(), b);
    expect(r).toMatchObject({ ok: true, clients: 0, fields: [] });
    expect(r.notes.join(' ')).toMatch(/No clients in your book yet/);
    await f.stop();
  });

  it('a malformed /me is a bad response, not a crash', async () => {
    const c = new ElefinClient({ baseUrl: base, token: fake.addKey(), sleep, fetchImpl: async () => new Response(JSON.stringify({ success: true, data: { key: {} } }), { status: 200 }) });
    expect(await probe(c)).toMatchObject({ ok: false, outcome: 'bad_response' });
  });
});
