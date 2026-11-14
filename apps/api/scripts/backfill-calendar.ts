// Economic-calendar history backfill (13 months by default) — the same job the
// API leader runs once a day at boot (src/modules/calendar/calendar.backfill.ts).
//
//   pnpm --filter api exec tsx scripts/backfill-calendar.ts --dry-run
//   pnpm --filter api exec tsx scripts/backfill-calendar.ts [--months 13]
//
// Runs now regardless of the once-a-day guard (and over the full range), one
// 10-day window at a time. Safe to stop and re-run: rows are upserted by the
// calendar's dedupKey and unchanged rows are not rewritten.
import { prisma } from '@tradinjournal/db';
import { backfillCalendar } from '../src/modules/calendar/calendar.backfill.js';

const dryRun = process.argv.includes('--dry-run');
const mArg = process.argv.indexOf('--months');
const months = mArg > 0 ? Number(process.argv[mArg + 1]) : 13;

async function main() {
  if (!(months >= 1 && months <= 36)) throw new Error('--months must be 1..36');
  const r = await backfillCalendar({
    months,
    force: true,
    dryRun,
    onChunk: (i, n, from, to, res) =>
      console.log(`[${i + 1}/${n}] ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}: ${res.fetched} read, ${res.upserted} written`),
  });
  if (r.status === 'planned') {
    console.log(`dry run: ${r.windows.length} windows, ${r.windows[0]?.from.slice(0, 10)} → ${r.windows.at(-1)?.to.slice(0, 10)} (nothing fetched)`);
    return;
  }
  console.log(`${r.status}${r.reason ? ` (${r.reason})` : ''}: ${r.fetched} events read, ${r.upserted} written`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
