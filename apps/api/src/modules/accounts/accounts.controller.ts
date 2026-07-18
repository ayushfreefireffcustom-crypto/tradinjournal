import type { Request, Response, NextFunction } from 'express';
import type { ConnectAccountInput, UpdateCredentialsInput } from '@tradinjournal/contracts';
import { connectAccount, listAccounts, deleteAccount, updateAccountCredentials } from './accounts.service.js';

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

export async function handleUpdateCredentials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const { password } = req.body as UpdateCredentialsInput;
    const account = await updateAccountCredentials(userId, req.params.id as string, password);
    res.json({ data: serializeAccount(account) });
  } catch (err) {
    next(err);
  }
}

export async function handleDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    await deleteAccount(userId, req.params.id as string);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}
