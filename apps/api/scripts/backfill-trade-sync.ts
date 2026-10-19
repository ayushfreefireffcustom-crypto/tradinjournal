// One-off after deploying trade sync: import every account's MT5 history before
// users arrive, so nobody's first visit waits on the bridge.
//
//   pnpm --filter api exec tsx scripts/backfill-trade-sync.ts --dry-run
//   pnpm --filter api exec tsx scripts/backfill-trade-sync.ts [--limit 200]
//
// Runs accounts one at a time (the bridge serialises anyway), never-synced first.
// Safe to stop and re-run: finished accounts are skipped, and the per-account
// lease means it can run while the API is live.
import { prisma } from '@tradinjournal/db';
import { syncAccount } from '../src/modules/sync/sync.service.js';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : undefined;

async function main() {
  const todo = await prisma.brokerAccount.findMany({
    where: { password: { not: null }, lastSyncAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, broker: true, server: true },
  });
  console.log(`${todo.length} account(s) never synced${dryRun ? ' (dry run — nothing fetched)' : ''}`);
  if (dryRun) return;
  let ok = 0, failed = 0, deals = 0;
  for (const [i, a] of todo.entries()) {
    const started = Date.now();
    const r = await syncAccount(a.id);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (r.status === 'synced') { ok++; deals += r.added; console.log(`[${i + 1}/${todo.length}] ${a.broker} (${a.server}): ${r.added} deals in ${secs}s`); }
    else if (r.status === 'locked') console.log(`[${i + 1}/${todo.length}] ${a.broker}: already syncing elsewhere, skipped`);
    else { failed++; console.log(`[${i + 1}/${todo.length}] ${a.broker}: FAILED — ${r.error.message}`); }
  }
  console.log(`done: ${ok} synced (${deals} deals), ${failed} failed`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
