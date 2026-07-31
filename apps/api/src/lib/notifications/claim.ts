import { prisma } from '@tradinjournal/db';

/**
 * Claim (dedupKey, channel) in the NotificationDelivery ledger. Returns false
 * when it was already delivered (the `@@unique([dedupKey, channel])` violation).
 * This is the idempotency primitive shared by the reminder dispatcher, the daily
 * digest, and price alerts — a duplicate cron fire or retry re-sends nothing.
 */
export async function claimDelivery(userId: string, dedupKey: string, channel: string): Promise<boolean> {
  try {
    await prisma.notificationDelivery.create({ data: { userId, dedupKey, channel } });
    return true;
  } catch {
    return false; // unique violation → already delivered
  }
}
