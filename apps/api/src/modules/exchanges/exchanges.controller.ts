import type { Request, Response, NextFunction } from 'express';
import type { ConnectExchangeInput, UpdateExchangeInput } from '@tradinjournal/contracts';
import { contextOf, recordActivity } from '../me/activity.service.js';
import { catalog, connectExchange, connectionEquity, listConnections, removeConnection, renameConnection, testConnection } from './exchanges.service.js';

const actorOf = (res: Response) => ({ id: res.locals.user.id as string, email: res.locals.user.email as string });

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const handleCatalog = wrap(async (_req, res) => res.json({ data: catalog() }));
export const handleList = wrap(async (_req, res) => res.json({ data: await listConnections(actorOf(res).id) }));
export const handleConnect = wrap(async (req, res) => {
  const c = await connectExchange(actorOf(res), req.body as ConnectExchangeInput);
  await recordActivity(actorOf(res).id, 'exchange_connected', `Connected ${c.label} (${c.environment === 'LIVE' ? 'live' : 'testnet'}, key …${c.keyLast4}${c.canTrade ? ', can trade' : ', read-only'})`, contextOf(req));
  res.status(201).json({ data: c });
});
export const handleTest = wrap(async (req, res) => res.json({ data: await testConnection(actorOf(res).id, String(req.params.id)) }));
export const handleRename = wrap(async (req, res) => res.json({ data: await renameConnection(actorOf(res).id, String(req.params.id), (req.body as UpdateExchangeInput).label) }));
export const handleRemove = wrap(async (req, res) => {
  await removeConnection(actorOf(res), String(req.params.id));
  await recordActivity(actorOf(res).id, 'exchange_removed', 'Removed an exchange account and wiped its keys', contextOf(req), { connectionId: String(req.params.id) });
  res.json({ data: { ok: true } });
});
export const handleEquity = wrap(async (req, res) => res.json({ data: await connectionEquity(actorOf(res).id, String(req.params.id)) }));
