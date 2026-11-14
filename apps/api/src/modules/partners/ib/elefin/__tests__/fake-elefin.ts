// A local stand-in for Elefin's Partner API v1, built from the published integration guide
// (document v2), for tests and the probe script's dry run:
//  - auth: `Authorization: Bearer {key}.{secret}` or the X-API-Key / X-API-Secret pair;
//    either half alone, a wrong secret, a deactivated or expired key → 401;
//  - every key is bound to one partner; every list is filtered to that partner's book;
//    a client outside the book is 404, exactly like one that doesn't exist;
//  - envelope { success, message, data }; lists nest { data, meta } with page / per_page
//    (1–200, `limit` alias), past last_page → empty data;
//  - /me (no ability), /clients (filters, sort, updated_from), /clients/lookup?email=
//    (exact match; a miss is { affiliated: false } and nothing else), /clients/{id};
//  - 403 without clients.read or when the partner no longer exists;
//  - 60/min per key with X-RateLimit-Limit / -Remaining on every answer, 429 + Retry-After.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

export interface FakeKey {
  key: string;
  secret: string;
  name: string;
  abilities: string[];
  /** The partner the key is bound to; null = the partner no longer exists (403). */
  partnerId: number | null;
  expiresAt: string | null;
  active: boolean;
  rateLimitPerMinute: number;
}

export interface FakeClient {
  client_id: number;
  name: string;
  country: string;
  status: 'active' | 'suspended' | 'inactive';
  registered_at: string;
  referred_at: string | null;
  referral_code: string | null;
  funding: { currency: 'USD'; deposits: number; first_deposit_at: string | null; is_funded: boolean };
  trading: { lots: number; last_trade_at: string | null };
  /** Private to the fake: never returned (the real API has no email field). */
  email: string;
  partnerId: number;
  /** When the record or its activity last changed (drives updated_from). */
  updatedAt: string;
}

export interface FakeLogLine { path: string; query: string; status: number; auth: string }

const PUBLIC: (keyof FakeClient)[] = ['client_id', 'name', 'country', 'status', 'registered_at', 'referred_at', 'referral_code', 'funding', 'trading'];
const DAY = 86_400_000;

export class FakeElefin {
  keys = new Map<string, FakeKey>();
  partners = new Map<number, string>([[1, 'Test Partner']]);
  clients: FakeClient[] = [];
  log: FakeLogLine[] = [];
  /** Answer the next N requests with 429. */
  throttleNext = 0;
  retryAfter = 1;
  /** Answer the next N requests with 500. */
  failNext = 0;
  /** Data availability reported by /me. */
  tradesFrom = '2026-01-01T00:00:00Z';
  private hits = new Map<string, number[]>();
  private server: Server | null = null;
  private nextId = 10001;
  base = '';

  addKey(k: Partial<Omit<FakeKey, 'key' | 'secret'>> & { key?: string; secret?: string } = {}): string {
    const key = k.key ?? `fxcrm_pk_${Math.random().toString(36).slice(2, 12)}`;
    const secret = k.secret ?? `fxcrm_sk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    this.keys.set(key, {
      name: k.name ?? 'Test integration', abilities: k.abilities ?? ['clients.read'], partnerId: k.partnerId === undefined ? 1 : k.partnerId,
      expiresAt: k.expiresAt ?? null, active: k.active ?? true, rateLimitPerMinute: k.rateLimitPerMinute ?? 60, key, secret,
    });
    return `${key}.${secret}`;
  }

  keyOf(token: string): FakeKey { return this.keys.get(token.split('.')[0]!)!; }

  /** Forgets every key's request window (tests that run many syncs back to back). */
  resetRateWindows(): void { this.hits.clear(); }

  /** Adds a client to a partner's book. */
  add(c: Partial<FakeClient> & { email?: string } = {}): FakeClient {
    const id = c.client_id ?? this.nextId++;
    const at = c.registered_at ?? '2026-09-01T10:00:00Z';
    const deposits = c.funding?.deposits ?? 0;
    const row: FakeClient = {
      client_id: id, name: c.name ?? `Client ${id}`, country: c.country ?? 'India', status: c.status ?? 'active',
      registered_at: at, referred_at: c.referred_at === undefined ? at : c.referred_at, referral_code: c.referral_code === undefined ? 'ELEFIN-1' : c.referral_code,
      funding: { currency: 'USD', deposits, first_deposit_at: deposits > 0 ? at : null, is_funded: deposits > 0, ...c.funding },
      trading: { lots: 0, last_trade_at: null, ...c.trading },
      email: c.email ?? `client${id}@mail.test`, partnerId: c.partnerId ?? 1, updatedAt: c.updatedAt ?? at,
    };
    this.clients.push(row);
    return row;
  }

  /** n clients in partner 1's book: every other one funded and trading. */
  seed(n: number, partnerId = 1): FakeClient[] {
    const out: FakeClient[] = [];
    for (let i = 0; i < n; i++) {
      const funded = i % 2 === 0;
      out.push(this.add({
        partnerId, registered_at: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString().replace('.000', ''),
        funding: { currency: 'USD', deposits: funded ? 100 * (i + 1) : 0, first_deposit_at: funded ? '2026-09-02T00:00:00Z' : null, is_funded: funded },
        trading: { lots: funded ? Math.round(i * 0.37 * 100) / 100 : 0, last_trade_at: funded ? '2026-11-10T09:00:00Z' : null },
      }));
    }
    return out;
  }

  /** Changes a client "now" so updated_from picks it up. */
  touch(c: FakeClient, change: (c: FakeClient) => void, at = new Date()): void {
    change(c);
    c.updatedAt = at.toISOString();
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>(r => this.server!.listen(0, '127.0.0.1', () => r()));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/v1`;
    return this.base;
  }

  async stop(): Promise<void> {
    await new Promise<void>(r => (this.server ? this.server.close(() => r()) : r()));
  }

  private auth(req: IncomingMessage): { k: FakeKey | null; kind: string } {
    const h = req.headers.authorization;
    let key = '', secret = '', kind = 'none';
    if (h?.startsWith('Bearer ')) {
      kind = 'bearer';
      const tok = h.slice(7);
      const dot = tok.indexOf('.');
      if (dot > 0 && tok.trim() === tok) { key = tok.slice(0, dot); secret = tok.slice(dot + 1); }
    } else if (req.headers['x-api-key'] || req.headers['x-api-secret']) {
      kind = 'pair'; key = String(req.headers['x-api-key'] ?? ''); secret = String(req.headers['x-api-secret'] ?? '');
    }
    const k = this.keys.get(key);
    const live = k && k.secret === secret && k.active && (!k.expiresAt || Date.parse(k.expiresAt) > Date.now());
    return { k: live ? k! : null, kind };
  }

  private book(k: FakeKey): FakeClient[] { return this.clients.filter(c => c.partnerId === k.partnerId); }
  private shape(c: FakeClient): Record<string, unknown> { return Object.fromEntries(PUBLIC.map(f => [f, c[f]])); }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const { k, kind } = this.auth(req);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const done = (status: number, body: unknown) => {
      this.log.push({ path, query: url.search, status, auth: kind });
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };
    const ok = (data: unknown) => done(200, { success: true, message: 'Success', data });
    const fail = (status: number, message: string) => done(status, { success: false, message });

    if (this.failNext > 0) { this.failNext--; fail(500, 'Server Error'); return; }
    if (this.throttleNext > 0) { this.throttleNext--; headers['Retry-After'] = String(this.retryAfter); fail(429, 'Too Many Attempts.'); return; }
    if (!k) { fail(401, 'Unauthenticated.'); return; }
    const now = Date.now();
    const win = (this.hits.get(k.key) ?? []).filter(t => t > now - 60_000);
    headers['X-RateLimit-Limit'] = String(k.rateLimitPerMinute);
    if (win.length >= k.rateLimitPerMinute) {
      headers['X-RateLimit-Remaining'] = '0';
      headers['Retry-After'] = String(Math.ceil((win[0]! + 60_000 - now) / 1000));
      fail(429, 'Too Many Attempts.');
      return;
    }
    win.push(now); this.hits.set(k.key, win);
    headers['X-RateLimit-Remaining'] = String(k.rateLimitPerMinute - win.length);
    if (k.partnerId == null || !this.partners.has(k.partnerId)) { fail(403, 'The partner this key belongs to no longer exists.'); return; }
    if (req.method !== 'GET') { fail(405, 'Method not allowed.'); return; }

    if (path === '/me') {
      ok({
        key: { name: k.name, abilities: k.abilities, rate_limit_per_minute: k.rateLimitPerMinute, expires_at: k.expiresAt },
        scope: { type: 'partner', partner: { id: k.partnerId, name: this.partners.get(k.partnerId) } },
        totals: { clients: this.book(k).length },
        data_availability: { trades_from: this.tradesFrom },
        conventions: { currency: 'USD', timezone: 'UTC', volume_unit: 'lots' },
      });
      return;
    }
    if (!/^\/clients(\/|$)/.test(path)) { fail(404, 'Not found.'); return; }
    if (!k.abilities.includes('clients.read')) { fail(403, 'This API key does not have the \'clients.read\' permission.'); return; }

    if (path === '/clients/lookup') {
      const email = url.searchParams.get('email');
      if (!email) { fail(422, 'The email field is required.'); return; }
      const c = this.book(k).find(x => x.email === email);
      ok(c ? { affiliated: true, ...this.shape(c) } : { affiliated: false });
      return;
    }
    const one = path.match(/^\/clients\/(\d+)$/);
    if (one) {
      const c = this.book(k).find(x => String(x.client_id) === one[1]);
      if (!c) { fail(404, 'Not found.'); return; }
      ok(this.shape(c));
      return;
    }
    if (path !== '/clients') { fail(404, 'Not found.'); return; }

    const q = url.searchParams;
    let rows = this.book(k);
    const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
    if (q.get('registered_from')) rows = rows.filter(c => Date.parse(c.registered_at) >= day(q.get('registered_from')!));
    if (q.get('registered_to')) rows = rows.filter(c => Date.parse(c.registered_at) < day(q.get('registered_to')!) + DAY);
    if (q.get('country')) rows = rows.filter(c => c.country === q.get('country'));
    if (q.get('status')) rows = rows.filter(c => c.status === q.get('status'));
    if (q.get('funded_only') === '1') rows = rows.filter(c => c.funding.is_funded);
    if (q.get('updated_from')) {
      const t = Date.parse(q.get('updated_from')!);
      if (!Number.isFinite(t)) { fail(422, 'The updated from is not a valid date.'); return; }
      rows = rows.filter(c => Date.parse(c.updatedAt) >= t);
    }
    const sort = q.get('sort') ?? 'registered_at';
    const dir = q.get('direction') === 'asc' ? 1 : -1;
    const key = (c: FakeClient): string | number => (sort === 'client_id' ? c.client_id : sort === 'name' ? c.name : c.registered_at);
    rows = [...rows].sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0));
    const per = Math.min(200, Math.max(1, Number(q.get('per_page') ?? q.get('limit') ?? 50) || 50));
    const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
    const last = Math.max(1, Math.ceil(rows.length / per));
    ok({ data: rows.slice((page - 1) * per, page * per).map(c => this.shape(c)), meta: { current_page: page, per_page: per, last_page: last, total: rows.length } });
  }
}
