import type { Request, Response, NextFunction } from 'express';
import type { ConnectAccountInput } from '@tradinjournal/contracts';
import { connectAccount, listAccounts } from './accounts.service.js';

function serializeAccount(account: { id: string; broker: string; mt5Login: bigint; server: string; baseCurrency: string; marginMode: string; status: string; lastSyncAt: Date | null; createdAt: Date }) {
  return {
    id: account.id,
    broker: account.broker,
    mt5Login: account.mt5Login.toString(),
    server: account.server,
    baseCurrency: account.baseCurrency,
    marginMode: account.marginMode,
    status: account.status,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  };
}

export async function handleConnect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const account = await connectAccount(userId, req.body as ConnectAccountInput);
    res.status(201).json({ data: serializeAccount(account) });
  } catch (err) {
    next(err);
  }
}

export async function handleList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const accounts = await listAccounts(userId);
    res.json({ data: accounts.map(serializeAccount) });
  } catch (err) {
    next(err);
  }
}
