// One-off: encrypt broker passwords stored before encryption existed.
//
//   pnpm --filter api exec tsx scripts/encrypt-broker-passwords.ts --dry-run
//   pnpm --filter api exec tsx scripts/encrypt-broker-passwords.ts
//
// Needs CREDENTIAL_ENCRYPTION_KEY (64 hex chars) — the SAME key the API runs
// with. Idempotent: already-encrypted rows are skipped. Each row is re-read and
// verified (decrypt == original) before the next one.
import { prisma } from '@tradinjournal/db';
import { decryptSecret, encryptSecret, encryptionKey, isEncrypted } from '../src/lib/secrets.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const key = encryptionKey();
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set to 64 hex characters.');
  const rows = await prisma.brokerAccount.findMany({ where: { password: { not: null } }, select: { id: true, password: true } });
  const todo = rows.filter(r => r.password && !isEncrypted(r.password));
  console.log(`${rows.length} accounts with a password, ${todo.length} still plaintext${dryRun ? ' (dry run — nothing written)' : ''}`);
  if (dryRun) return;
  let done = 0;
  for (const r of todo) {
    const enc = encryptSecret(r.password!, key);
    // Only overwrite if it's still the same plaintext (no concurrent update).
    const { count } = await prisma.brokerAccount.updateMany({ where: { id: r.id, password: r.password }, data: { password: enc } });
    if (count && decryptSecret(enc, key) !== r.password) throw new Error(`verification failed for ${r.id}`);
    done += count;
  }
  console.log(`encrypted ${done} of ${todo.length}`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
