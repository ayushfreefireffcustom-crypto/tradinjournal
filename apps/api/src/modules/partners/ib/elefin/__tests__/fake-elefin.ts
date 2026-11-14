// A local stand-in for Elefin's Partner API v1, for tests and the probe script's dry run.
// Bearer {key}.{secret} (or X-API-Key / X-API-Secret), per-key abilities and field
// permissions (PII off unless ticked), Laravel-style pagination (or cursor / links),
// 401 / 403 / 404 / 429 + Retry-After exactly as Elefin documents them.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

export type Ability = 'profile' | 'clients' | 'accounts';
export interface FakeKey {
  key: string;
  secret: string;
  abilities: Ability[];
  /** Field allow-list per resource; unset = every non-PII field. */
  fields?: Partial<Record<'clients' | 'accounts', string[]>>;
  /** Tick PII fields (email). */
  pii?: boolean;
  expired?: boolean;
  /** Partner gone (403 on everything). */
  partnerGone?: boolean;
  rateLimitPerMinute?: number;
  partnerId?: number;
}
export interface FakeClient { id: string; name: string; email: string; created_at: string; country?: string }
export interface FakeAccount { login: number; client_id: string; platform: string; total_deposits: number; volume_lots: number; last_trade_at: string | null; currency: string }

export interface FakeElefinOptions {
  pagination?: 'laravel' | 'cursor' | 'links';
  /** Paths (under /api/v1). */
  paths?: { profile?: string; clients?: string; accounts?: string };
}

const PII = new Set(['email', 'name', 'phone']);

export class FakeElefin {
  keys = new Map<string, FakeKey>();
  clients: FakeClient[] = [];
  accounts: FakeAccount[] = [];
  /** Every request: path, auth header kind, status. */
  log: { path: string; query: string; status: number; auth: string }[] = [];
  /** Answer the next N requests with 429. */
  throttleNext = 0;
  retryAfter = 1;
  /** Answer the next N requests with 500. */
  failNext = 0;
  private hits = new Map<string, number[]>();
  private server: Server | null = null;
  base = '';

  constructor(readonly opts: FakeElefinOptions = {}) {}

  addKey(k: Omit<FakeKey, 'key' | 'secret'> & { key?: string; secret?: string }): string {
    const key = k.key ?? `elk_${Math.random().toString(36).slice(2, 12)}`;
    const secret = k.secret ?? `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    this.keys.set(key, { ...k, key, secret });
    return `${key}.${secret}`;
  }

  seed(n: number, start = 100001): void {
    for (let i = 0; i < n; i++) {
      const id = `C${1000 + this.clients.length}`;
      this.clients.push({ id, name: `Client ${i}`, email: `client${this.clients.length}@mail.test`, created_at: '2026-09-01T10:00:00Z', country: 'IN' });
      this.accounts.push({ login: start + i, client_id: id, platform: 'MT5', total_deposits: 100 * (i + 1), volume_lots: 1.5 * i, last_trade_at: i % 2 ? '2026-11-10T09:00:00Z' : null, currency: 'USD' });
    }
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

  private send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }

  private auth(req: IncomingMessage): { k: FakeKey | null; kind: string } {
    const h = req.headers.authorization;
    let key = '', secret = '', kind = 'none';
    if (h?.startsWith('Bearer ')) {
      kind = 'bearer';
      const tok = h.slice(7).trim();
      const dot = tok.indexOf('.');
      if (dot > 0) { key = tok.slice(0, dot); secret = tok.slice(dot + 1); }
    } else if (req.headers['x-api-key']) {
      kind = 'pair'; key = String(req.headers['x-api-key']); secret = String(req.headers['x-api-secret'] ?? '');
    }
    const k = this.keys.get(key);
    return { k: k && k.secret === secret && !k.expired ? k : null, kind };
  }

  private shape(row: Record<string, unknown>, k: FakeKey, resource: 'clients' | 'accounts'): Record<string, unknown> {
    const allow = k.fields?.[resource];
    return Object.fromEntries(Object.entries(row).filter(([f]) => (allow ? allow.includes(f) : true) && (!PII.has(f) || k.pii)));
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const { k, kind } = this.auth(req);
    const done = (status: number, body: unknown, headers?: Record<string, string>) => {
      this.log.push({ path, query: url.search, status, auth: kind });
      this.send(res, status, body, headers);
    };
    if (this.failNext > 0) { this.failNext--; done(500, { success: false, message: 'Server Error' }); return; }
    if (this.throttleNext > 0) { this.throttleNext--; done(429, { success: false, message: 'Too Many Attempts.' }, { 'Retry-After': String(this.retryAfter) }); return; }
    if (!k) { done(401, { success: false, message: 'Unauthenticated.' }); return; }
    const now = Date.now();
    const win = (this.hits.get(k.key) ?? []).filter(t => t > now - 60_000);
    if (win.length >= (k.rateLimitPerMinute ?? 60)) { done(429, { success: false, message: 'Too Many Attempts.' }, { 'Retry-After': String(Math.ceil((win[0]! + 60_000 - now) / 1000)) }); return; }
    win.push(now); this.hits.set(k.key, win);
    if (k.partnerGone) { done(403, { success: false, message: 'Partner no longer exists.' }); return; }

    const p = { profile: '/me', clients: '/clients', accounts: '/accounts', ...this.opts.paths };
    const need = (a: Ability) => { if (!k.abilities.includes(a)) { done(403, { success: false, message: `This key lacks the ${a} ability.` }); return false; } return true; };
    if (path === p.profile) {
      if (!need('profile')) return;
      done(200, { success: true, data: { id: k.partnerId ?? 77, name: 'Fake Partner Ltd', type: 'ib' } });
      return;
    }
    const list = path === p.clients ? 'clients' : path === p.accounts ? 'accounts' : null;
    const one = path.match(/^\/accounts\/(\d+)$/);
    if (one) {
      if (!need('accounts')) return;
      const a = this.accounts.find(x => String(x.login) === one[1]);
      if (!a) { done(404, { success: false, message: 'Not found.' }); return; }
      done(200, { success: true, data: this.shape(a as never, k, 'accounts') });
      return;
    }
    if (!list) { done(404, { success: false, message: 'Not found.' }); return; }
    if (!need(list)) return;
    const rows = (list === 'clients' ? this.clients : this.accounts).map(r => this.shape(r as never, k, list));
    const per = Math.min(Number(url.searchParams.get('per_page') ?? 50) || 50, 100);
    const style = this.opts.pagination ?? 'laravel';
    if (style === 'cursor') {
      const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
      const items = rows.slice(start, start + per);
      const next = start + per < rows.length ? String(start + per) : null;
      done(200, { success: true, data: { data: items, meta: { per_page: per, next_cursor: next } } });
      return;
    }
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const last = Math.max(1, Math.ceil(rows.length / per));
    const items = rows.slice((page - 1) * per, page * per);
    if (style === 'links') {
      const next = page < last ? `${this.base}${path}?page=${page + 1}&per_page=${per}` : null;
      done(200, { data: items, links: { next }, meta: { current_page: page, total: rows.length } });
      return;
    }
    done(200, { success: true, data: { data: items, meta: { current_page: page, per_page: per, last_page: last, total: rows.length } } });
  }
}
