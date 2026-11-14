// Backfill: convert stored MT5 deal times from trade-server wall clock to UTC.
//
// Read-only by default — prints, per account, the server clock model, how many
// rows are still raw, the shifts that would be applied, and a sanity check: a
// converted deal must never be later than the moment we stored it (createdAt).
//
//   pnpm --filter api exec tsx scripts/normalize-mt5-times.ts                    # report every account
//   pnpm --filter api exec tsx scripts/normalize-mt5-times.ts --server Elefin-Trade
//   pnpm --filter api exec tsx scripts/normalize-mt5-times.ts --server Elefin-Trade --tz America/New_York+420
//   pnpm --filter api exec tsx scripts/normalize-mt5-times.ts --apply [--server X] [--tz SPEC] [--all]
//
// --tz     use this clock model instead of the detected one (needs --server); with
//          --apply it is also stored on the accounts, so later syncs keep using it.
// --all    re-check every row, not only raw ones (after a model correction).
// --apply  write. Only once the API runs with MT5_SERVER_TIME_TO_UTC=true —
//          otherwise syncs keep storing raw deals next to converted ones.
//
// Safe to stop and re-run: each row records the offset applied to it and every
// update is guarded on that value, so nothing is shifted twice. Takes each
// account's sync lease, so it can run while the API is live.
import { prisma } from '@tradinjournal/db';
import { formatTz, parseTz, tzOf, serverWallOffset, type ServerTz } from '../src/lib/server-time.js';
import { normalizeExecutionTimes, planNormalization } from '../src/modules/sync/server-time.sync.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');
const server = arg('--server');
const tzOverride = arg('--tz') ? parseTz(arg('--tz')!) : null;
if (tzOverride && !server) throw new Error('--tz needs --server: a clock model belongs to one trade server');

const LEASE_MS = 4 * 60_000;
const MIN_MS = 60_000;
/** createdAt is stamped after the bridge call returns; allow for clock skew. */
const AHEAD_TOLERANCE_MS = 2 * MIN_MS;
const hours = (min: number) => `${min >= 0 ? '+' : ''}${(min / 60).toFixed(2)}h`;

async function report(accountId: string, tz: ServerTz | null) {
  const rows = await prisma.execution.findMany({
    where: { brokerAccountId: accountId },
    select: { id: true, dealTime: true, serverOffsetMin: true, createdAt: true },
  });
  const raw = rows.filter(r => r.serverOffsetMin == null);
  // A raw deal stored "ahead" of its own insert time proves the stored value isn't UTC.
  const aheadNow = raw.filter(r => r.dealTime.getTime() > r.createdAt.getTime() + AHEAD_TOLERANCE_MS);
  const maxAheadMin = Math.max(0, ...raw.map(r => (r.dealTime.getTime() - r.createdAt.getTime()) / MIN_MS));
  const out = { rows: rows.length, raw: raw.length, aheadNow: aheadNow.length, maxAheadMin, groups: [] as string[], aheadAfter: 0 };
  if (!tz) return out;
  const scope = all ? rows : raw;
  const groups = planNormalization(scope, tz);
  out.groups = groups.map(g => `${g.ids.length} × ${g.from == null ? 'raw' : hours(g.from)} → ${hours(g.to)}`);
  // After conversion, nothing may sit in the future of its insert time.
  out.aheadAfter = scope.filter(r => {
    const wall = r.dealTime.getTime() + (r.serverOffsetMin ?? 0) * MIN_MS;
    return wall - serverWallOffset(tz, wall) * MIN_MS > r.createdAt.getTime() + AHEAD_TOLERANCE_MS;
  }).length;
  return out;
}

async function main() {
  const accounts = await prisma.brokerAccount.findMany({
    where: server ? { server } : {},
    orderBy: [{ server: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, broker: true, server: true, mt5Login: true, serverTimeZone: true, serverTimeShiftMin: true, serverOffsetMin: true, serverOffsetAt: true },
  });
  console.log(`${accounts.length} account(s)${apply ? '' : ' — dry run, nothing written'}${tzOverride ? `, model override ${formatTz(tzOverride)}` : ''}`);

  let changed = 0, skipped = 0, unsafe = 0;
  for (const a of accounts) {
    const tz = tzOverride ?? tzOf(a);
    const r = await report(a.id, tz);
    const seen = a.serverOffsetMin != null ? `last seen ${hours(a.serverOffsetMin)} at ${a.serverOffsetAt?.toISOString()}` : 'never observed';
    console.log(`\n${a.server} #${a.mt5Login} (${a.id})`);
    console.log(`  model: ${tz ? formatTz(tz) : 'none'} (${seen})`);
    console.log(`  rows: ${r.rows}, raw: ${r.raw}, raw rows stored ahead of insert time: ${r.aheadNow} (max ${hours(r.maxAheadMin)})`);
    if (!tz) { if (r.raw) { skipped++; console.log('  skip: no clock model yet — wait for a weekday sync on the updated bridge, or pass --server/--tz'); } continue; }
    console.log(`  shifts: ${r.groups.length ? r.groups.join(', ') : 'none needed'}`);
    if (r.aheadAfter) {
      unsafe++;
      console.log(`  UNSAFE: ${r.aheadAfter} row(s) would still be later than their insert time — model too small, not applying`);
      continue;
    }
    if (!apply || (!r.groups.length && !tzOverride)) continue;

    const now = new Date();
    const { count } = await prisma.brokerAccount.updateMany({
      where: { id: a.id, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
      data: { syncLockedUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (count !== 1) { skipped++; console.log('  skip: a sync holds this account right now — re-run later'); continue; }
    try {
      const n = await normalizeExecutionTimes(a.id, tz, { all });
      const newest = (await prisma.execution.aggregate({ where: { brokerAccountId: a.id }, _max: { dealTime: true } }))._max.dealTime;
      await prisma.brokerAccount.update({
        where: { id: a.id },
        data: {
          lastDealAt: newest,
          ...(tzOverride ? { serverTimeZone: tz.zone, serverTimeShiftMin: tz.shiftMin } : {}),
          ...(n > 0 ? { dataVersion: { increment: 1 } } : {}),
        },
      });
      changed += n;
      console.log(`  applied: ${n} row(s) converted`);
    } finally {
      await prisma.brokerAccount.update({ where: { id: a.id }, data: { syncLockedUntil: null } });
    }
  }
  console.log(`\ndone: ${apply ? `${changed} row(s) converted` : 'dry run'}, ${skipped} account(s) skipped, ${unsafe} unsafe`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
