// Test-DB seed for the trading platform: one verified leader and two followers,
// all fake users with placeholder (non-working) keys. Refuses to run unless
// DATABASE_URL points at localhost, so it can never touch Neon.
//
//   DATABASE_URL=postgresql://tj@localhost:5444/tradinjournal_test \
//   DIRECT_URL=postgresql://tj@localhost:5444/tradinjournal_test \
//   npx tsx prisma/seed-trading.ts

import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DIRECT_URL ?? '')) {
  console.error('Refusing to seed: DATABASE_URL and DIRECT_URL must both point at localhost.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function user(email: string, name: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, name, emailVerified: true } });
}

async function connection(userId: string, label: string, last4: string) {
  const existing = await prisma.exchangeConnection.findFirst({ where: { userId, label } });
  if (existing) return existing;
  return prisma.exchangeConnection.create({
    data: {
      userId,
      exchange: 'DELTA_INDIA',
      environment: 'TESTNET',
      label,
      // Placeholders, not keys. Anything that tries to use them fails auth.
      apiKeyEnc: `seed-placeholder-key-${last4}`,
      apiSecretEnc: 'seed-placeholder-secret',
      keyLast4: last4,
      keyFingerprint: `seed-${last4}`,
      canTrade: true,
    },
  });
}

async function main(): Promise<void> {
  const leaderUser = await user('seed.leader@tradelogs.test', 'Seed Leader');
  const f1 = await user('seed.follower1@tradelogs.test', 'Seed Follower One');
  const f2 = await user('seed.follower2@tradelogs.test', 'Seed Follower Two');

  const lc = await connection(leaderUser.id, 'Sample leader account', 'LEAD');
  const c1 = await connection(f1.id, 'Sample follower account', 'FOL1');
  const c2 = await connection(f2.id, 'Sample follower account', 'FOL2');

  const leader = await prisma.copyLeader.upsert({
    where: { connectionId: lc.id },
    update: {},
    create: { userId: leaderUser.id, connectionId: lc.id, displayName: 'Sample Leader', bio: 'Seed data for local testing.', status: 'VERIFIED' },
  });

  await prisma.copyFollow.upsert({
    where: { userId_leaderId: { userId: f1.id, leaderId: leader.id } },
    update: {},
    create: { userId: f1.id, leaderId: leader.id, connectionId: c1.id, sizingMode: 'PROPORTIONAL', sizingValue: 1, maxPositionUsd: 5000, dailyLossLimitUsd: 250 },
  });
  await prisma.copyFollow.upsert({
    where: { userId_leaderId: { userId: f2.id, leaderId: leader.id } },
    update: {},
    create: { userId: f2.id, leaderId: leader.id, connectionId: c2.id, sizingMode: 'MULTIPLIER', sizingValue: 0.5, leverage: 5 },
  });

  const counts = await Promise.all([prisma.exchangeConnection.count(), prisma.copyLeader.count(), prisma.copyFollow.count()]);
  console.log(`seeded: ${counts[0]} connections, ${counts[1]} leaders, ${counts[2]} follows`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
