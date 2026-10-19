import type { Request, Response, NextFunction } from 'express';
import { fetchDeals, fetchTrades, fetchStats } from './trades.service.js';
import { loadAccountData } from '../sync/account-data.js';
import { listJournalEntries } from '../journal/journal.service.js';

export async function handleGetDeals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { accountId } = req.query as { accountId: string };
    res.json({ data: await fetchDeals(userId, accountId) });
  } catch (err) { next(err); }
}

export async function handleGetTrades(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { accountId } = req.query as { accountId: string };
    res.json({ data: await fetchTrades(userId, accountId) });
  } catch (err) { next(err); }
}

export async function handleGetStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { accountId } = req.query as { accountId: string };
    res.json({ data: await fetchStats(userId, accountId) });
  } catch (err) { next(err); }
}

// GET /api/trades/dashboard?accountId= — everything the dashboard needs in one
// round trip, from one stored-data read (was three requests).
export async function handleGetDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { accountId } = req.query as { accountId: string };
    const [data, journal] = await Promise.all([loadAccountData(userId, accountId), listJournalEntries(userId, accountId)]);
    res.json({
      data: {
        stats: data.stats(),
        trades: data.trades(),
        journal,
        syncedAt: data.account.lastSyncAt?.toISOString() ?? null,
        lastSyncError: data.account.lastSyncError,
      },
    });
  } catch (err) {
    next(err);
  }
}
