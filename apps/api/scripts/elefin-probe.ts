// Live check of an Elefin Partner API key — what "Test connection" does, plus an
// optional full read. Prints only counts, field names and which endpoints answered:
// never the key, never client names, emails or logins.
//
//   ELEFIN_PROBE_KEY='key.secret' pnpm --filter api exec tsx scripts/elefin-probe.ts
//   ELEFIN_PROBE_KEY='key.secret' pnpm --filter api exec tsx scripts/elefin-probe.ts --full
//   ELEFIN_PROBE_KEY='key.secret' ELEFIN_PROBE_URL=https://my.elefin.com/api/v1 … --paths accounts=/trading-accounts
//   pnpm --filter api exec tsx scripts/elefin-probe.ts --fake      (dry run against the local fake server)
//
// Reads the key from the environment only (not argv) so it stays out of shell history
// and process lists. Uses at most ~30 requests a minute, like the sync.
import { ELEFIN_PATHS, defaultBaseUrl, type ElefinPaths } from '../src/modules/partners/ib/elefin/config.js';
import { ElefinClient, ElefinError } from '../src/modules/partners/ib/elefin/client.js';
import { probe } from '../src/modules/partners/ib/elefin/probe.js';
import { fetchElefinAccounts } from '../src/modules/partners/ib/elefin/sync.js';
import type { ElefinConfig } from '../src/modules/partners/ib/elefin/store.js';

const args = process.argv.slice(2);
const full = args.includes('--full');
const useFake = args.includes('--fake');
const pathArg = args[args.indexOf('--paths') + 1];

function pathsFrom(arg: string | undefined): ElefinPaths {
  const out: ElefinPaths = { ...ELEFIN_PATHS };
  if (!arg || !args.includes('--paths')) return out;
  for (const part of arg.split(',')) {
    const [k, v] = part.split('=');
    if ((k === 'profile' || k === 'clients' || k === 'accounts') && v?.startsWith('/')) out[k] = [v];
  }
  return out;
}

async function main() {
  let token = process.env.ELEFIN_PROBE_KEY?.trim() ?? '';
  let baseUrl = (process.env.ELEFIN_PROBE_URL?.trim() || defaultBaseUrl()).replace(/\/+$/, '');
  let stop: (() => Promise<void>) | null = null;
  if (useFake) {
    const { FakeElefin } = await import('../src/modules/partners/ib/elefin/__tests__/fake-elefin.js');
    const f = new FakeElefin();
    baseUrl = await f.start();
    f.seed(137);
    token = f.addKey({ abilities: ['profile', 'clients', 'accounts'] });
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
  const host = new URL(baseUrl).host;
  console.log(`Elefin Partner API probe → ${host}${new URL(baseUrl).pathname} (key ••••${token.slice(-4)})`);

  const paths = pathsFrom(pathArg);
  const client = new ElefinClient({ baseUrl, token });
  const r = await probe(client, paths);
  console.log('');
  console.log(`Result:     ${r.ok ? 'OK' : 'NOT OK'} (${r.outcome}) — ${r.message}`);
  console.log(`Abilities:  profile=${r.abilities.profile}  clients=${r.abilities.clients}  accounts=${r.abilities.accounts}`);
  console.log(`Paths:      ${Object.entries(r.paths).map(([k, v]) => `${k}=${v}`).join('  ') || '(none answered)'}`);
  console.log(`Counts:     clients=${r.counts.clients ?? '—'}  accounts=${r.counts.accounts ?? '—'}`);
  console.log(`Login seen: ${r.hasLogin ? 'yes' : 'no'}    Email seen: ${r.hasEmail ? 'yes' : 'no'}`);
  console.log(`Client fields:  ${r.fields.clients.join(', ') || '—'}`);
  console.log(`Account fields: ${r.fields.accounts.join(', ') || '—'}`);
  if (r.missing.length) console.log(`Missing:    ${r.missing.join('; ')}`);
  for (const n of r.notes) console.log(`Note:       ${n}`);
  console.log(`Requests:   ${client.requests}`);

  if (full && r.ok) {
    const cfg = { paths: r.paths, abilities: r.abilities } as ElefinConfig;
    const t0 = Date.now();
    const before = client.requests;
    const { accounts, clients, skipped } = await fetchElefinAccounts(client, cfg);
    const list = [...accounts.values()];
    console.log('');
    console.log(`Full read:  ${clients ?? '—'} clients, ${accounts.size} distinct MT5 logins, ${skipped} account rows without a usable login`);
    console.log(`            with email ${list.filter(a => a.email).length}, deposits ${list.filter(a => a.depositTotal != null).length}, lots ${list.filter(a => a.lotsTotal != null).length}, last trade ${list.filter(a => a.lastTradeAt).length}, platform ${list.filter(a => a.platform).length}`);
    console.log(`            ${client.requests - before} requests in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await stop?.();
  process.exit(r.ok ? 0 : 1);
}

main().catch(err => {
  // ElefinError messages never contain the key; anything else is reduced to its type.
  console.error(err instanceof ElefinError ? `Failed: ${err.kind} — ${err.message}` : `Failed: ${err instanceof Error ? err.name : 'error'}`);
  process.exit(1);
});
