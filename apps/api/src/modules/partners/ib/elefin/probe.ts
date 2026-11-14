// "Test connection": reads the first page of the profile, clients and accounts endpoints
// and reports what the key can see — abilities, field names and totals. Never values.
import type { ElefinAbilityState, ElefinProbeDto, ElefinResource } from '@tradinjournal/contracts';
import { ELEFIN_LIMITS, ELEFIN_PATHS, ELEFIN_PROFILE_FIELDS, type ElefinPaths } from './config.js';
import { ElefinClient, ElefinError } from './client.js';
import { detect, fieldNames, pick, readPage, readRecord } from './fields.js';

export interface ProbeResult extends ElefinProbeDto {
  /** The path that answered for each resource (stored on the connection). */
  paths: Partial<Record<ElefinResource, string>>;
  /** The partner's id at Elefin, when the profile endpoint shares it. */
  partnerRef: string | null;
}

interface Attempt { state: ElefinAbilityState; path: string | null; body: unknown; error: ElefinError | null }

/** Tries each candidate path; the first one that isn't a 404 decides. */
async function tryPaths(client: ElefinClient, paths: string[], list: boolean): Promise<Attempt> {
  let last: ElefinError | null = null;
  for (const p of paths) {
    try {
      const body = await client.get(p, list ? { per_page: ELEFIN_LIMITS.probePerPage } : {});
      return { state: 'ok', path: p, body, error: null };
    } catch (err) {
      if (!(err instanceof ElefinError)) throw err;
      if (err.kind === 'not_found') { last = err; continue; }
      if (err.kind === 'forbidden') return { state: 'forbidden', path: p, body: null, error: err };
      return { state: 'error', path: p, body: null, error: err };
    }
  }
  return { state: 'missing', path: null, body: null, error: last };
}

const uniq = (a: string[]) => [...new Set(a)].sort();

export async function probe(client: ElefinClient, paths: ElefinPaths = ELEFIN_PATHS): Promise<ProbeResult> {
  const out: ProbeResult = {
    ok: false, outcome: 'ok', message: '', abilities: { profile: 'skipped', clients: 'skipped', accounts: 'skipped' },
    fields: { clients: [], accounts: [] }, counts: { clients: null, accounts: null }, hasLogin: false, hasEmail: false,
    missing: [], notes: [], retryAfter: null, paths: {}, partnerRef: null,
  };
  const fail = (e: ElefinError): ProbeResult => {
    if (e.kind === 'auth') return { ...out, outcome: 'invalid_key', message: 'Elefin didn’t accept this key. It may be mistyped, switched off or expired.' };
    if (e.kind === 'rate_limited') return { ...out, outcome: 'rate_limited', retryAfter: e.retryAfter, message: `Elefin asked us to slow down. Try again in ${e.retryAfter ?? 60} seconds.` };
    if (e.kind === 'network' || e.kind === 'server') return { ...out, outcome: 'unreachable', message: `${e.message} Try again in a few minutes.` };
    return { ...out, outcome: 'bad_response', message: e.message };
  };

  // Clients first: a wrong key fails here and we stop.
  const clients = await tryPaths(client, paths.clients, true);
  if (clients.error && clients.state === 'error') return fail(clients.error);
  out.abilities.clients = clients.state;
  if (clients.state === 'ok') {
    out.paths.clients = clients.path!;
    try {
      const page = readPage(clients.body);
      out.counts.clients = page.total ?? (page.next ? null : page.items.length);
      out.fields.clients = uniq(page.items.slice(0, 25).flatMap(fieldNames));
      const d = detect(page.items, 'clients');
      out.hasLogin ||= d.hasLogin; out.hasEmail ||= d.hasEmail;
      if (out.counts.clients == null) out.notes.push(`At least ${page.items.length} clients; the full count comes with the first sync.`);
    } catch { return { ...out, outcome: 'bad_response', message: 'Elefin’s client list came back in a shape we don’t recognise.' }; }
  }

  const accounts = await tryPaths(client, paths.accounts, true);
  if (accounts.error && accounts.state === 'error') return fail(accounts.error);
  out.abilities.accounts = accounts.state;
  if (accounts.state === 'ok') {
    out.paths.accounts = accounts.path!;
    try {
      const page = readPage(accounts.body);
      out.counts.accounts = page.total ?? (page.next ? null : page.items.length);
      out.fields.accounts = uniq(page.items.slice(0, 25).flatMap(fieldNames));
      const d = detect(page.items, 'accounts');
      out.hasLogin ||= d.hasLogin; out.hasEmail ||= d.hasEmail;
    } catch { return { ...out, outcome: 'bad_response', message: 'Elefin’s account list came back in a shape we don’t recognise.' }; }
  }

  // Profile last and optional: it only labels the connection.
  const profile = await tryPaths(client, paths.profile, false);
  out.abilities.profile = profile.state;
  if (profile.state === 'ok') {
    out.paths.profile = profile.path!;
    const rec = readRecord(profile.body);
    const ref = rec ? pick(rec, ELEFIN_PROFILE_FIELDS.id)?.value : null;
    out.partnerRef = typeof ref === 'string' || typeof ref === 'number' ? String(ref).slice(0, 60) : null;
  } else if (profile.error?.kind === 'auth') return fail(profile.error);

  // What's missing, in plain words.
  const canClients = out.abilities.clients === 'ok', canAccounts = out.abilities.accounts === 'ok';
  if (!canClients && !canAccounts) {
    out.missing.push('read access to clients', 'read access to client trading accounts');
    return { ...out, outcome: 'missing_permission', message: 'The key works but can’t read your clients or their trading accounts.' };
  }
  if (!canAccounts && out.abilities.accounts === 'forbidden') out.missing.push('read access to client trading accounts');
  if (!canClients && out.abilities.clients === 'forbidden') out.notes.push('The key can’t read client profiles, so emails won’t be matched. Accounts are enough to verify.');
  const emptyLists = (out.counts.clients ?? 1) === 0 && (out.counts.accounts ?? 0) === 0;
  if (!out.hasLogin && !emptyLists) {
    if (!canAccounts) {
      return { ...out, outcome: 'missing_permission', message: 'The key can read clients but not their trading accounts, so we can’t see MT5 logins.' };
    }
    out.missing.push('the “login” (MT5 account number) field on trading accounts');
    return { ...out, outcome: 'no_logins', message: 'The key can read accounts, but the MT5 login field isn’t shared with it.' };
  }
  if (!out.hasEmail && !emptyLists) out.notes.push('Emails aren’t shared with this key. That’s fine: we verify by MT5 login.');
  if (emptyLists) out.notes.push('No clients under you yet. New ones appear on the next sync.');
  out.ok = true;
  out.outcome = 'ok';
  const c = out.counts;
  out.message = c.accounts != null
    ? `Key works. ${c.clients != null ? `${c.clients} client${c.clients === 1 ? '' : 's'}, ` : ''}${c.accounts} trading account${c.accounts === 1 ? '' : 's'} found.`
    : `Key works. ${c.clients ?? 'Your'} client${c.clients === 1 ? '' : 's'} found.`;
  return out;
}
