// Live check of an Elefin Partner API key — what "Test connection" does, plus an optional
// full read of the book and an optional single email lookup. Prints counts, abilities and
// field NAMES only: never the key, never a client's name, email or any other value.
//
//   read -rs ELEFIN_PROBE_KEY && export ELEFIN_PROBE_KEY        # paste key.secret, Enter
//   pnpm --filter api exec tsx scripts/elefin-probe.ts           # /me + one /clients row
//   pnpm --filter api exec tsx scripts/elefin-probe.ts --full    # also pages the whole book
//   pnpm --filter api exec tsx scripts/elefin-probe.ts --lookup someone@example.com
//                                                                # prints affiliated: true/false only
//   ELEFIN_PROBE_URL=https://partnersapi.elefin.com/api/v1 …     # another base URL
//   pnpm --filter api exec tsx scripts/elefin-probe.ts --fake --full --lookup client10001@mail.test
//                                                                # dry run against the bundled fake
//
// The key is read from the environment only (not argv) so it stays out of shell history
// and process lists. Requests stay under our per-key budget (ELEFIN_REQ_PER_MIN).
import { defaultBaseUrl } from '../src/modules/partners/ib/elefin/config.js';
import { ElefinClient, ElefinError } from '../src/modules/partners/ib/elefin/client.js';
import { probe } from '../src/modules/partners/ib/elefin/probe.js';
import { readBook } from '../src/modules/partners/ib/elefin/sync.js';
import { snapshotOf } from '../src/modules/partners/ib/elefin/store.js';
import { lookupEmail } from '../src/modules/partners/ib/elefin/verify.js';

const args = process.argv.slice(2);
const full = args.includes('--full');
const useFake = args.includes('--fake');
const lookupAt = args.indexOf('--lookup');
const lookup = lookupAt >= 0 ? args[lookupAt + 1]?.trim() ?? '' : null;

async function main() {
  let token = process.env.ELEFIN_PROBE_KEY?.trim() ?? '';
  let baseUrl = (process.env.ELEFIN_PROBE_URL?.trim() || defaultBaseUrl()).replace(/\/+$/, '');
  let stop: (() => Promise<void>) | null = null;
  if (useFake) {
    const { FakeElefin } = await import('../src/modules/partners/ib/elefin/__tests__/fake-elefin.js');
    const f = new FakeElefin();
    baseUrl = await f.start();
    f.seed(437);
    token = f.addKey({ name: 'TRADElogs (dry run)', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
    stop = () => f.stop();
  }
  if (!token) {
    console.error('Set ELEFIN_PROBE_KEY to the partner key (key.secret). It is read from the environment only.');
    process.exit(2);
  }
  if (!/^[^\s.]+\.\S+$/.test(token)) {
    console.error('ELEFIN_PROBE_KEY should look like key.secret (one dot between the two parts).');
    process.exit(2);
  }
  if (lookup !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookup)) {
    console.error('--lookup needs an email address after it.');
    process.exit(2);
  }
  const u = new URL(baseUrl);
  console.log(`Elefin Partner API probe → ${u.host}${u.pathname} (key ••••${token.slice(-4)})`);

  const client = new ElefinClient({ baseUrl, token });
  const r = await probe(client);
  const k = r.key;
  console.log('');
  console.log(`Result:      ${r.ok ? 'OK' : 'NOT OK'} (${r.outcome})`);
  if (k) {
    console.log(`Partner:     #${k.partnerId ?? '—'}`);
    console.log(`Abilities:   ${k.abilities.join(', ') || '(none)'}   clients.read: ${k.canReadClients ? 'yes' : 'NO'}`);
    console.log(`Rate limit:  ${k.rateLimitPerMinute ?? '—'}/min   remaining now: ${client.rate.remaining ?? '—'}`);
    console.log(`Expires:     ${k.expiresAt ?? 'never'}`);
    console.log(`Trades from: ${k.tradesFrom ?? '—'}`);
  }
  console.log(`Clients:     ${r.clients ?? '—'}   (list read: ${r.clientsRead})`);
  console.log(`Fields:      ${r.fields.join(', ') || '—'}`);
  if (r.missing.length) console.log(`Missing:     ${r.missing.join('; ')}`);
  for (const n of r.notes) console.log(`Note:        ${n}`);
  console.log(`Requests:    ${client.requests}`);

  if (full && r.ok) {
    const t0 = Date.now();
    const before = client.requests;
    const book = await readBook(client, null, { full: true, since: null });
    const s = snapshotOf(Object.values(book.clients), { now: new Date(), fullAt: new Date().toISOString(), quietDays: 30 });
    console.log('');
    console.log(`Full read:   ${s.total} clients (Elefin says ${book.total ?? '—'}), ${book.skippedRows} rows not in the documented shape`);
    console.log(`             active ${s.active}, suspended ${s.suspended}, inactive ${s.inactive}`);
    console.log(`             funded ${s.funded}, deposits $${s.depositsUsd.toLocaleString('en-US')}, lots ${s.lots.toLocaleString('en-US')}`);
    console.log(`             never traded ${s.neverTraded}, funded but quiet ${s.quiet} (${s.quietDays} d), new 7d ${s.new7d}, new 30d ${s.new30d}`);
    console.log(`             ${client.requests - before} requests in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }

  if (lookup && r.ok) {
    const fact = await lookupEmail(client, lookup);
    console.log('');
    console.log(`Lookup:      affiliated: ${fact.affiliated}`);
  }
  await stop?.();
  process.exit(r.ok ? 0 : 1);
}

main().catch(err => {
  // ElefinError messages never contain the key; anything else is reduced to its type.
  console.error(err instanceof ElefinError ? `Failed: ${err.kind} — ${err.message}` : `Failed: ${err instanceof Error ? err.name : 'error'}`);
  process.exit(1);
});
