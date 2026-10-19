import { statsFor, listJournal, ok } from '@/lib/mock-data';

// Mock of GET /api/trades/dashboard — stats + trades + journal in one response.
export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get('accountId') ?? '';
  const { stats, trades } = statsFor(accountId);
  return ok({ stats, trades, journal: listJournal(accountId), syncedAt: new Date().toISOString(), lastSyncError: null });
}
