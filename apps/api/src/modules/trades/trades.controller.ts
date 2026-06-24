import type { Request, Response, NextFunction } from 'express';
import { fetchDealsWithPassword } from './trades.service.js';

export async function handleGetDeals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { accountId, password } = req.query as { accountId: string; password: string };
    const deals = await fetchDealsWithPassword(userId, accountId, password);
    res.json({ data: deals });
  } catch (err) {
    next(err);
  }
}
