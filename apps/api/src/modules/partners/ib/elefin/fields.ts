// Tolerant reading of Elefin responses: the envelope, pagination and field names are
// detected rather than hard-coded, so small differences in the real API don't break sync.
import { ELEFIN_FIELDS, LOGIN_RE } from './config.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export type PageNext =
  | { kind: 'url'; url: string }
  | { kind: 'cursor'; cursor: string }
  | { kind: 'page'; page: number }
  | null;

export interface Page {
  items: unknown[];
  /** Total rows Elefin reports, when it does. */
  total: number | null;
  next: PageNext;
}

const LIST_KEYS = ['data', 'items', 'results', 'records', 'rows', 'clients', 'accounts'];

/** Strips `{ success, data }` (Elefin) and returns the inner payload. */
function unwrap(body: unknown): unknown {
  if (isObj(body) && 'success' in body && 'data' in body) return body.data;
  return body;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/**
 * One page of a list response. Handles Laravel paginators (`data` + `meta` + `links`,
 * or flat `current_page` / `last_page` / `next_page_url`), cursor paginators
 * (`next_cursor`, `meta.next_cursor`) and plain arrays.
 */
export function readPage(body: unknown, currentPage = 1): Page {
  const outer = isObj(body) ? body : {};
  const inner = unwrap(body);
  let items: unknown[] | null = null;
  let holder: Obj = {};
  if (Array.isArray(inner)) { items = inner; holder = outer; }
  else if (isObj(inner)) {
    holder = inner;
    for (const k of LIST_KEYS) if (Array.isArray(inner[k])) { items = inner[k] as unknown[]; break; }
  }
  if (!items) throw new Error('not a list');
  const meta = (isObj(holder.meta) ? holder.meta : isObj(outer.meta) ? outer.meta : holder) as Obj;
  const links = (isObj(holder.links) ? holder.links : isObj(outer.links) ? outer.links : {}) as Obj;
  const total = num(meta.total) ?? num(holder.total);

  let next: PageNext = null;
  const cursor = meta.next_cursor ?? holder.next_cursor ?? (isObj(meta.cursor) ? (meta.cursor as Obj).next : undefined);
  const nextUrl = links.next ?? holder.next_page_url ?? meta.next_page_url ?? (typeof holder.next === 'string' ? holder.next : undefined);
  const cur = num(meta.current_page) ?? num(holder.current_page) ?? currentPage;
  const last = num(meta.last_page) ?? num(holder.last_page);
  if (typeof cursor === 'string' && cursor) next = { kind: 'cursor', cursor };
  else if (typeof nextUrl === 'string' && nextUrl) next = { kind: 'url', url: nextUrl };
  else if (last != null && cur < last) next = { kind: 'page', page: cur + 1 };
  else if (last == null && total != null && items.length > 0) {
    const per = num(meta.per_page) ?? num(holder.per_page);
    if (per && cur * per < total) next = { kind: 'page', page: cur + 1 };
  }
  if (items.length === 0) next = null;
  return { items, total, next };
}

/** A single-record response (`{ success, data: {...} }` or the object itself). */
export function readRecord(body: unknown): Obj | null {
  const inner = unwrap(body);
  if (isObj(inner)) return isObj(inner.data) && Object.keys(inner).length <= 3 ? inner.data as Obj : inner;
  return null;
}

/** Value at "a" or "a.b". */
export function getPath(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** The first candidate path with a usable value. */
export function pick(row: unknown, candidates: readonly string[]): { path: string; value: unknown } | null {
  for (const p of candidates) {
    const v = getPath(row, p);
    if (v !== undefined && v !== null && v !== '') return { path: p, value: v };
  }
  return null;
}

/** Field names present in a row, one level deep ("client.email"). Values are never kept. */
export function fieldNames(row: unknown): string[] {
  if (!isObj(row)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (isObj(v)) for (const k2 of Object.keys(v)) out.push(`${k}.${k2}`);
    else out.push(k);
  }
  return out;
}

export function loginOf(v: unknown): string | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return String(v);
  if (typeof v === 'string' && LOGIN_RE.test(v.trim())) return v.trim();
  return null;
}

export function emailOf(v: unknown): string | null {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null;
}

export function numberOf(v: unknown): number | null {
  const n = num(v);
  return n != null && n >= 0 && n < 1e12 ? n : null;
}

export function dateOf(v: unknown): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) && t < Date.now() + 86_400_000 ? d : null;
}

function platformOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.toUpperCase().match(/MT[45]|CTRADER/);
  return m ? m[0] : null;
}

/** A trading account as we keep it (IbAccount activity columns). */
export interface ElefinAccount {
  login: string;
  clientId: string | null;
  email: string | null;
  platform: string | null;
  depositTotal: number | null;
  lotsTotal: number | null;
  lastTradeAt: Date | null;
}

export interface ElefinClientRow {
  id: string | null;
  email: string | null;
  /** Accounts listed inside the client row, if any. */
  accounts: ElefinAccount[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/** Reads an account row. Null when it has no usable MT5 login. */
export function toAccount(row: unknown, parent?: { id: string | null; email: string | null }): ElefinAccount | null {
  // A nested account may be just the login.
  if (!isObj(row)) {
    const login = loginOf(row);
    return login ? { login, clientId: parent?.id ?? null, email: parent?.email ?? null, platform: null, depositTotal: null, lotsTotal: null, lastTradeAt: null } : null;
  }
  const loginHit = pick(row, ELEFIN_FIELDS.login);
  const login = loginHit ? loginOf(loginHit.value) : null;
  if (!login) return null;
  return {
    login,
    clientId: str(pick(row, ELEFIN_FIELDS.accountClientId)?.value) ?? parent?.id ?? null,
    email: emailOf(pick(row, ELEFIN_FIELDS.email)?.value) ?? parent?.email ?? null,
    platform: platformOf(pick(row, ELEFIN_FIELDS.platform)?.value),
    depositTotal: numberOf(pick(row, ELEFIN_FIELDS.deposits)?.value),
    lotsTotal: numberOf(pick(row, ELEFIN_FIELDS.lots)?.value),
    lastTradeAt: dateOf(pick(row, ELEFIN_FIELDS.lastTradeAt)?.value),
  };
}

export function toClient(row: unknown): ElefinClientRow | null {
  if (!isObj(row)) return null;
  const id = str(pick(row, ELEFIN_FIELDS.clientId)?.value);
  const email = emailOf(pick(row, ELEFIN_FIELDS.email)?.value);
  const nested = pick(row, ELEFIN_FIELDS.nestedAccounts)?.value;
  const accounts: ElefinAccount[] = [];
  if (Array.isArray(nested)) for (const a of nested) { const acc = toAccount(a, { id, email }); if (acc) accounts.push(acc); }
  // Some CRMs put the login on the client row itself.
  if (!accounts.length) {
    const own = pick(row, ELEFIN_FIELDS.login.filter(f => f !== 'account_id' && f !== 'number'));
    const login = own ? loginOf(own.value) : null;
    if (login && own!.path !== 'id') accounts.push({ login, clientId: id, email, platform: null, depositTotal: numberOf(pick(row, ELEFIN_FIELDS.deposits)?.value), lotsTotal: numberOf(pick(row, ELEFIN_FIELDS.lots)?.value), lastTradeAt: dateOf(pick(row, ELEFIN_FIELDS.lastTradeAt)?.value) });
  }
  return { id, email, accounts };
}

/** Does any row carry a field we read as a login / an email? */
export function detect(rows: unknown[], kind: 'accounts' | 'clients'): { hasLogin: boolean; hasEmail: boolean } {
  let hasLogin = false, hasEmail = false;
  for (const r of rows.slice(0, 50)) {
    if (kind === 'accounts') { if (toAccount(r)) hasLogin = true; }
    else if (toClient(r)?.accounts.length) hasLogin = true;
    if (pick(r, ELEFIN_FIELDS.email)) hasEmail = true;
  }
  return { hasLogin, hasEmail };
}
