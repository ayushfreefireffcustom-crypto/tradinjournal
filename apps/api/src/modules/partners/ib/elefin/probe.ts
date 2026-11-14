// "Test connection": /me (who the key belongs to, its abilities, expiry, client total,
// how far back trades go), then one /clients row to confirm reading works. Reports counts
// and field names only — never the key, never a client's name or any other value.
import type { ElefinKeyInfoDto, ElefinProbeDto } from '@tradinjournal/contracts';
import { CLIENTS_READ, ELEFIN_LIMITS, ELEFIN_PATHS } from './config.js';
import { ElefinClient, ElefinError } from './client.js';
import { DOCUMENTED_FIELDS, fieldNames, meData, type ElefinMe } from './schema.js';

const DAY_MS = 86_400_000;

export function keyInfo(me: ElefinMe): ElefinKeyInfoDto {
  const abilities = [...new Set(me.key.abilities)].sort();
  return {
    partnerId: me.scope.partner?.id ?? null,
    partnerName: me.scope.partner?.name?.trim().slice(0, 120) || null,
    keyName: me.key.name?.trim().slice(0, 80) || null,
    abilities, canReadClients: abilities.includes(CLIENTS_READ),
    rateLimitPerMinute: me.key.rate_limit_per_minute ?? null,
    expiresAt: me.key.expires_at ? new Date(me.key.expires_at).toISOString() : null,
    tradesFrom: me.data_availability?.trades_from ? new Date(me.data_availability.trades_from).toISOString() : null,
  };
}

/** GET /me, parsed. Throws ElefinError. */
export async function readMe(client: ElefinClient): Promise<{ key: ElefinKeyInfoDto; clients: number | null }> {
  const data = await client.get(ELEFIN_PATHS.me);
  const me = meData.safeParse(data);
  if (!me.success) throw new ElefinError('bad_response', 'Elefin’s /me answer came back in a shape we don’t recognise.', 200, null, ELEFIN_PATHS.me);
  if (me.data.scope.type !== 'partner' || !me.data.scope.partner) {
    throw new ElefinError('forbidden', 'This key isn’t a partner key. Ask Elefin for a key bound to your partner account.', 200, null, ELEFIN_PATHS.me);
  }
  return { key: keyInfo(me.data), clients: me.data.totals?.clients ?? null };
}

export function failureOf(e: ElefinError): Pick<ElefinProbeDto, 'outcome' | 'message' | 'retryAfter'> {
  if (e.kind === 'auth') return { outcome: 'invalid_key', retryAfter: null, message: 'Elefin didn’t accept this key. Check it was pasted whole (key.secret); if it worked before, it was switched off, expired or regenerated.' };
  if (e.kind === 'rate_limited') return { outcome: 'rate_limited', retryAfter: e.retryAfter, message: `Elefin asked us to slow down. Try again in ${e.retryAfter ?? 60} seconds.` };
  if (e.kind === 'network' || e.kind === 'server') return { outcome: 'unreachable', retryAfter: null, message: `${e.message} Try again in a few minutes.` };
  if (e.kind === 'forbidden') return { outcome: 'missing_permission', retryAfter: null, message: e.message };
  return { outcome: 'bad_response', retryAfter: null, message: e.message };
}

export async function probe(client: ElefinClient, now = new Date()): Promise<ElefinProbeDto> {
  const out: ElefinProbeDto = {
    ok: false, outcome: 'ok', message: '', key: null, clients: null, clientsRead: 'skipped', fields: [], missing: [], notes: [], retryAfter: null,
  };
  let me: Awaited<ReturnType<typeof readMe>>;
  try { me = await readMe(client); } catch (e) {
    if (!(e instanceof ElefinError)) throw e;
    return { ...out, ...failureOf(e) };
  }
  out.key = me.key;
  out.clients = me.clients;

  const exp = me.key.expiresAt ? new Date(me.key.expiresAt).getTime() : null;
  if (exp != null && exp <= now.getTime()) {
    return { ...out, outcome: 'invalid_key', message: 'This key has expired. Ask Elefin for a new one.' };
  }
  if (!me.key.canReadClients) {
    out.missing.push(`the “${CLIENTS_READ}” permission on this key`);
    return { ...out, outcome: 'missing_permission', clientsRead: 'forbidden', message: 'The key works but can’t read your clients. Ask Elefin to add the clients.read permission.' };
  }

  try {
    const page = await client.page(ELEFIN_PATHS.clients, { per_page: ELEFIN_LIMITS.probePerPage, page: 1 });
    out.clientsRead = 'ok';
    out.clients = page.meta.total;
    out.fields = fieldNames(page.rows[0]);
    const absent = page.rows.length ? DOCUMENTED_FIELDS.filter(f => !out.fields.includes(f)) : [];
    if (absent.length) out.notes.push(`Elefin left out ${absent.length} documented field${absent.length === 1 ? '' : 's'}: ${absent.join(', ')}.`);
  } catch (e) {
    if (!(e instanceof ElefinError)) throw e;
    if (e.kind === 'forbidden') {
      out.missing.push(`the “${CLIENTS_READ}” permission on this key`);
      return { ...out, clientsRead: 'forbidden', outcome: 'missing_permission', message: 'The key works but can’t read your clients. Ask Elefin to add the clients.read permission.' };
    }
    return { ...out, clientsRead: 'error', ...failureOf(e) };
  }

  if (exp != null && exp - now.getTime() < 14 * DAY_MS) {
    const d = Math.max(1, Math.ceil((exp - now.getTime()) / DAY_MS));
    out.notes.push(`This key expires in ${d} day${d === 1 ? '' : 's'}. Ask Elefin for a longer one.`);
  }
  if (out.clients === 0) out.notes.push('No clients in your book yet. New ones appear on the next sync.');
  out.ok = true;
  out.message = `Key works${me.key.partnerName ? ` for ${me.key.partnerName}` : ''}. ${out.clients?.toLocaleString('en-US') ?? 'Your'} client${out.clients === 1 ? '' : 's'} in your book.`;
  return out;
}
