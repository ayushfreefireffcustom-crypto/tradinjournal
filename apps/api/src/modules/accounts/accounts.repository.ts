import { prisma } from '@tradinjournal/db';
import type { BrokerAccount, MarginMode } from '@tradinjournal/db';

export async function findAccountsByUser(userId: string): Promise<BrokerAccount[]> {
  return prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findAccountById(id: string, userId: string): Promise<BrokerAccount | null> {
  return prisma.brokerAccount.findFirst({ where: { id, userId } });
}

export async function countAccountsByUser(userId: string): Promise<number> {
  return prisma.brokerAccount.count({ where: { userId } });
}

// Delete an account the user owns. Returns false if it was not found for this
// user (so the caller can 404 instead of deleting someone else's row).
export async function deleteAccountById(id: string, userId: string): Promise<boolean> {
  const result = await prisma.brokerAccount.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function upsertAccount(data: {
  userId: string;
  broker: string;
  mt5Login: bigint;
  server: string;
  password: string;
  baseCurrency: string;
  marginMode: MarginMode;
}): Promise<BrokerAccount> {
  return prisma.brokerAccount.upsert({
    where: { mt5Login_server: { mt5Login: data.mt5Login, server: data.server } },
    update: { userId: data.userId, status: 'ACTIVE', updatedAt: new Date() },
    create: data,
  });
}
