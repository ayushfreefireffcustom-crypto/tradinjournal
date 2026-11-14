// HTTP client for Elefin's Partner API: Bearer {key}.{secret}, timeouts, a per-key request
// budget under Elefin's 60/min, Retry-After on 429, exponential backoff on 5xx, and the
// { success, message, data } envelope. 401/403/404 are terminal. Errors carry a kind the
// sync and the UI turn into plain words; the key never appears in an error.
import { createHash } from 'crypto';
import { registerSecret, redactText } from '@tradinjournal/logger';
import { ELEFIN_LIMITS } from './config.js';
import { envelope, listData, type ElefinMeta } from './schema.js';

export type ElefinErrorKind = 'auth' | 'forbidden' | 'not_found' | 'rate_limited' | 'network' | 'server' | 'bad_response';

export class ElefinError extends Error {
  constructor(
    readonly kind: ElefinErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly retryAfter: number | null = null,
    readonly path: string | null = null,
  ) {
    super(message);
    this.name = 'ElefinError';
  }
}

export interface ElefinClientOptions {
  baseUrl: string;
  /** "{key}.{secret}". */
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  perMinute?: number;
  timeoutMs?: number;
  maxRetryAfterS?: number;
}

export type Query = Record<string, string | number | undefined>;

// Request timestamps per key (fingerprint), shared by every client in this process so a
// sync, a lookup and a "Test connection" on the same key share one budget.
const budgets = new Map<string, number[]>();
export function resetElefinBudgets(): void { budgets.clear(); }

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 16);

/** Seconds from a Retry-After header (seconds, as Elefin sends it, or an HTTP date). */
export function parseRetryAfter(v: string | null, now = Date.now()): number | null {
  if (!v) return null;
  const s = Number(v.trim());
  if (Number.isFinite(s) && s >= 0) return Math.ceil(s);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : null;
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface ElefinPage { rows: unknown[]; meta: ElefinMeta }

export class ElefinClient {
  readonly base: URL;
  private readonly token: string;
  private readonly fp: string;
  private readonly fetchImpl: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly perMinute: number;
  private readonly timeoutMs: number;
  private readonly maxRetryAfterS: number;
  /** Requests sent by this client (for logs and tests). */
  requests = 0;
  /** X-RateLimit-Limit / X-RateLimit-Remaining from the last answer. */
  rate: { limit: number | null; remaining: number | null } = { limit: null, remaining: null };

  constructor(o: ElefinClientOptions) {
    this.base = new URL(o.baseUrl.replace(/\/+$/, '') + '/');
    this.token = o.token.trim();
    registerSecret(this.token, this.token.split('.').slice(1).join('.'));
    this.fp = fingerprint(this.token);
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? realSleep;
    this.now = o.now ?? Date.now;
    this.perMinute = Math.max(1, o.perMinute ?? ELEFIN_LIMITS.perMinute);
    this.timeoutMs = o.timeoutMs ?? ELEFIN_LIMITS.timeoutMs;
    this.maxRetryAfterS = o.maxRetryAfterS ?? ELEFIN_LIMITS.maxRetryAfterS;
  }

  /** Absolute URL for a path under the base. */
  url(path: string, query: Query = {}): URL {
    if (/^[a-z]+:\/\//i.test(path) || path.startsWith('//')) throw new ElefinError('bad_response', 'Refusing to call a URL outside the Elefin API.', null, null, null);
    const u = new URL(path.replace(/^\/+/, ''), this.base);
    if (u.origin !== this.base.origin) throw new ElefinError('bad_response', 'Refusing to call a URL outside the Elefin API.', null, null, u.pathname);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
    return u;
  }

  private async throttle(): Promise<void> {
    const win = (budgets.get(this.fp) ?? []).filter(t => t > this.now() - 60_000);
    if (win.length >= this.perMinute) {
      const wait = win[0]! + 60_000 - this.now();
      if (wait > this.maxRetryAfterS * 1000) throw new ElefinError('rate_limited', 'Too many requests for this key right now.', null, Math.ceil(wait / 1000));
      await this.sleep(Math.max(0, wait));
      win.splice(0, win.filter(t => t <= this.now() - 60_000).length);
    }
    win.push(this.now());
    budgets.set(this.fp, win);
  }

  private noteRate(res: Response): void {
    const n = (h: string) => { const v = Number(res.headers.get(h)); return res.headers.has(h) && Number.isFinite(v) ? v : null; };
    this.rate = { limit: n('x-ratelimit-limit'), remaining: n('x-ratelimit-remaining') };
  }

  /**
   * GET a path and return the envelope's `data`. Retries 429 (after Retry-After, within
   * limits), 5xx (exponential backoff) and network errors; 401/403/404 are terminal.
   */
  async get(path: string, query: Query = {}): Promise<unknown> {
    const u = this.url(path, query);
    const where = u.pathname.replace(this.base.pathname.replace(/\/$/, ''), '') || '/';
    let rate = 0, server = 0, net = 0;
    for (;;) {
      await this.throttle();
      this.requests++;
      let res: Response;
      try {
        res = await this.fetchImpl(u, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'User-Agent': 'TRADElogs-Partner-Sync/2' },
        });
      } catch (err) {
        if (net++ < ELEFIN_LIMITS.retriesNetwork) { await this.sleep(1000 * 2 ** (net - 1)); continue; }
        const why = err instanceof Error && err.name === 'TimeoutError' ? 'Elefin took too long to answer.' : 'We couldn’t reach Elefin.';
        throw new ElefinError('network', why, null, null, where);
      }
      this.noteRate(res);
      if (res.status === 429) {
        const after = parseRetryAfter(res.headers.get('retry-after'), this.now()) ?? 60;
        await res.text().catch(() => '');
        if (rate++ < ELEFIN_LIMITS.retries429 && after <= this.maxRetryAfterS) { await this.sleep(after * 1000); continue; }
        throw new ElefinError('rate_limited', 'Elefin asked us to slow down.', 429, after, where);
      }
      if (res.status >= 500) {
        await res.text().catch(() => '');
        if (server++ < ELEFIN_LIMITS.retries5xx) { await this.sleep(1000 * 2 ** (server - 1)); continue; }
        throw new ElefinError('server', `Elefin had a problem (${res.status}).`, res.status, null, where);
      }
      const text = await res.text().catch(() => '');
      if (res.status === 401) throw new ElefinError('auth', 'Elefin didn’t accept the key. It may be mistyped, switched off or expired.', 401, null, where);
      if (res.status === 403) throw new ElefinError('forbidden', `The key isn’t allowed to read this.${serverMessage(text)}`, 403, null, where);
      if (res.status === 404) throw new ElefinError('not_found', 'Not found (or not in your book).', 404, null, where);
      if (!res.ok) throw new ElefinError('bad_response', `Elefin answered ${res.status}.`, res.status, null, where);
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new ElefinError('bad_response', 'Elefin didn’t answer with JSON.', res.status, null, where); }
      const env = envelope.safeParse(body);
      if (!env.success) throw new ElefinError('bad_response', 'Elefin’s answer isn’t in its usual { success, data } form.', res.status, null, where);
      if (!env.data.success) throw new ElefinError('bad_response', `Elefin returned an error.${serverMessage(text)}`, res.status, null, where);
      return env.data.data;
    }
  }

  /** One page of a list endpoint. */
  async page(path: string, query: Query = {}): Promise<ElefinPage> {
    const data = await this.get(path, query);
    const p = listData.safeParse(data);
    if (!p.success) throw new ElefinError('bad_response', 'Elefin’s list came back in a shape we don’t recognise.', 200, null, path);
    return { rows: p.data.data, meta: p.data.meta };
  }

  /** Every page of a list endpoint, by page number, until last_page (or an empty page). */
  async *pages(path: string, query: Query = {}, opts: { perPage?: number; maxPages?: number } = {}): AsyncGenerator<ElefinPage & { page: number }> {
    const perPage = Math.min(200, Math.max(1, opts.perPage ?? ELEFIN_LIMITS.perPage));
    const maxPages = opts.maxPages ?? ELEFIN_LIMITS.maxPages;
    for (let page = 1; page <= maxPages; page++) {
      const p = await this.page(path, { ...query, per_page: perPage, page });
      yield { ...p, page };
      if (!p.rows.length || page >= p.meta.last_page) return;
    }
    throw new ElefinError('bad_response', `More than ${maxPages} pages at ${path}; stopped to be safe.`, null, null, path);
  }
}

/** Elefin's own error message, short and scrubbed, for 403s and failures. */
function serverMessage(text: string): string {
  try {
    const m = (JSON.parse(text) as { message?: unknown }).message;
    return typeof m === 'string' && m.trim() ? ` Elefin says: “${redactText(m.trim()).slice(0, 160)}”` : '';
  } catch { return ''; }
}
