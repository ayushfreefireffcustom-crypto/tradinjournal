import type { Request, Response, NextFunction } from 'express';
import { listJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry } from './journal.service.js';

export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.user.id as string;
    const brokerAccountId = req.query.accountId as string | undefined;
    const entries = await listJournalEntries(userId, brokerAccountId);
    res.json({ data: entries });
  } catch (err) { next(err); }
}

export async function handleCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.user.id as string;
    const entry = await createJournalEntry(userId, req.body);
    res.status(201).json({ data: entry });
  } catch (err) { next(err); }
}

export async function handleUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.user.id as string;
    const { id } = req.params;
    const entry = await updateJournalEntry(userId, id!, req.body);
    res.json({ data: entry });
  } catch (err) { next(err); }
}

export async function handleDelete(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = res.locals.user.id as string;
    const { id } = req.params;
    await deleteJournalEntry(userId, id!);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
}
