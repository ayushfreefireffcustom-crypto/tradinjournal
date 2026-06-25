import type { Request, Response, NextFunction } from 'express';
import { fetchDeals, fetchTrades, fetchStats } from './trades.service.js';

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
