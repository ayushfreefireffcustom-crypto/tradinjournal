import { prisma } from '@tradinjournal/db';

export interface JournalEntryInput {
  title?: string;
  body: string;
  emotion?: string;
  tags?: string[];
  tradeId?: string;
  brokerAccountId?: string;
  entryDate?: string;
}

export async function listJournalEntries(userId: string, brokerAccountId?: string) {
  return prisma.journalEntry.findMany({
    where: { userId, ...(brokerAccountId ? { brokerAccountId } : {}) },
    orderBy: { entryDate: 'desc' },
  });
}

export async function createJournalEntry(userId: string, input: JournalEntryInput) {
  return prisma.journalEntry.create({
    data: {
      userId,
      brokerAccountId: input.brokerAccountId ?? null,
      title: input.title ?? null,
      body: input.body,
      emotion: input.emotion ?? null,
      tags: input.tags ?? [],
      tradeId: input.tradeId ?? null,
      entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
    },
  });
}

export async function updateJournalEntry(userId: string, id: string, input: Partial<JournalEntryInput>) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } });
  if (!entry) throw Object.assign(new Error('Journal entry not found'), { statusCode: 404 });

  return prisma.journalEntry.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.emotion !== undefined ? { emotion: input.emotion } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.tradeId !== undefined ? { tradeId: input.tradeId } : {}),
      ...(input.entryDate !== undefined ? { entryDate: new Date(input.entryDate) } : {}),
    },
  });
}

export async function deleteJournalEntry(userId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } });
  if (!entry) throw Object.assign(new Error('Journal entry not found'), { statusCode: 404 });
  await prisma.journalEntry.delete({ where: { id } });
}
