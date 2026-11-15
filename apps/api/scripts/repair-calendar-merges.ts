// Repair economic-calendar rows that the old, loose title aliases merged
// (headline + U6 unemployment, every "CPI…"/"GDP…" title at one hour, total +
// private payrolls, euro members sharing one row). See
// src/modules/calendar/calendar.repair.ts for what it does and why.
//
//   pnpm --filter api exec tsx scripts/repair-calendar-merges.ts            # dry run: counts + examples
//   pnpm --filter api exec tsx scripts/repair-calendar-merges.ts --apply    # write (one transaction)
//   … [--from 2026-07-01] [--to 2026-12-01]                                # only events in [from, to) (UTC days)
//
// Ids are kept wherever a row still names a release, so watches, inbox items
// and the reminder ledger keep pointing at the event users saw. Safe to re-run:
// a repaired table plans no changes. Run it right after deploying the new
// matcher (the next ingest would otherwise add rows under the new keys next to
// the old ones — the repair folds those in too, so a late run still converges).
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { applyCalendarRepair, loadCalendarRepair } from '../src/modules/calendar/calendar.repair.js';

const apply = process.argv.includes('--apply');
const day = (name: string): Date | undefined => {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${name} needs a UTC day, YYYY-MM-DD`);
  return new Date(`${v}T00:00:00.000Z`);
};

function dbHost(): string {
  try { return new URL(process.env.DATABASE_URL ?? '').host || '(unset)'; } catch { return '(unparseable)'; }
}

async function main() {
  const window = { from: day('--from'), to: day('--to') };
  console.log(`${apply ? 'APPLY' : 'dry run'} against ${dbHost()}${window.from || window.to ? ` · events ${window.from?.toISOString().slice(0, 10) ?? '…'} → ${window.to?.toISOString().slice(0, 10) ?? '…'}` : ''}`);
  const plan = await loadCalendarRepair(prisma, env.CALENDAR_PROVIDER_PRIORITY_LIST, window);
  const rekeyed = plan.updates.filter(u => u.fromKey !== u.data.dedupKey).length;
  console.log([
    `rows scanned:                 ${plan.scanned}`,
    `unchanged:                    ${plan.unchanged}`,
    `rows holding >1 release:      ${plan.splitRows}`,
    `rows rewritten (same id):     ${plan.updates.length} (${rekeyed} with a new key)`,
    `new rows for hidden releases: ${plan.creates.length}`,
    `duplicate rows folded away:   ${plan.deletes.length}`,
  ].join('\n'));
  if (plan.examples.length) console.log(`examples:\n  ${plan.examples.join('\n  ')}`);
  if (!apply) {
    console.log('dry run — nothing written. Re-run with --apply to write.');
    return;
  }
  const r = await applyCalendarRepair(prisma, plan);
  console.log(`written: ${r.updated} updated, ${r.created} created, ${r.deleted} deleted; moved ${r.watchesMoved} watches, ${r.notificationsMoved} inbox items, ${r.ledgerMoved} reminder-ledger rows`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
