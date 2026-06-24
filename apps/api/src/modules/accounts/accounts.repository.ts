import { prisma } from '@tradinjournal/db';
import type { BrokerAccount, MarginMode } from '@prisma/client';

export async function findAccountsByUser(userId: string): Promise<BrokerAccount[]> {
  return prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findAccountById(id: string, userId: string): Promise<BrokerAccount | null> {
  return prisma.brokerAccount.findFirst({ where: { id, userId } });
}

export async function upsertAccount(data: {
  userId: string;
  broker: string;
  mt5Login: bigint;
  server: string;
  baseCurrency: string;
  marginMode: MarginMode;
}): Promise<BrokerAccount> {
  return prisma.brokerAccount.upsert({
    where: { mt5Login_server: { mt5Login: data.mt5Login, server: data.server } },
    update: { userId: data.userId, status: 'ACTIVE', updatedAt: new Date() },
    create: data,
  });
}
