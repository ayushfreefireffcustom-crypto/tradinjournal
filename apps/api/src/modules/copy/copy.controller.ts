import type { Request, Response, NextFunction } from 'express';
import type { ApplyLeaderInput, CreateFollowInput, CursorQuery, LeaderRange, LeadersQuery, StopFollowInput, UpdateFollowInput, UpdateLeaderInput } from '@tradinjournal/contracts';
import { applyAsLeader, getLeader, getMyLeader, leaderEquity, leaderTrades, listLeaders, updateMyLeader } from './leaders.service.js';
import { createFollow, followOrders, getFollow, listFollows, stopFollow, updateFollow } from './follows.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const actorOf = (res: Response) => ({ id: res.locals.user.id as string, email: res.locals.user.email as string });

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const rangeOf = (req: Request) => (req.query as { range: LeaderRange }).range;

export const handleListLeaders = wrap(async (req, res) => res.json({ data: await listLeaders(uid(res), req.query as unknown as LeadersQuery) }));
export const handleMyLeader = wrap(async (_req, res) => res.json({ data: await getMyLeader(uid(res)) }));
export const handleApplyLeader = wrap(async (req, res) => res.status(201).json({ data: await applyAsLeader(actorOf(res), req.body as ApplyLeaderInput) }));
export const handleUpdateMyLeader = wrap(async (req, res) => res.json({ data: await updateMyLeader(uid(res), req.body as UpdateLeaderInput) }));
export const handleGetLeader = wrap(async (req, res) => res.json({ data: await getLeader(uid(res), String(req.params.id), rangeOf(req)) }));
export const handleLeaderTrades = wrap(async (req, res) => res.json({ data: await leaderTrades(uid(res), String(req.params.id), req.query as unknown as CursorQuery) }));
export const handleLeaderEquity = wrap(async (req, res) => res.json({ data: await leaderEquity(uid(res), String(req.params.id), rangeOf(req)) }));

export const handleListFollows = wrap(async (req, res) => res.json({ data: await listFollows(uid(res), { includeStopped: req.query.all === '1' }) }));
export const handleCreateFollow = wrap(async (req, res) => res.status(201).json({ data: await createFollow(uid(res), req.body as CreateFollowInput) }));
export const handleGetFollow = wrap(async (req, res) => res.json({ data: await getFollow(uid(res), String(req.params.id)) }));
export const handleFollowOrders = wrap(async (req, res) => res.json({ data: await followOrders(uid(res), String(req.params.id), req.query as unknown as CursorQuery) }));
export const handleUpdateFollow = wrap(async (req, res) => res.json({ data: await updateFollow(uid(res), String(req.params.id), req.body as UpdateFollowInput) }));
export const handleStopFollow = wrap(async (req, res) => res.json({ data: await stopFollow(uid(res), String(req.params.id), (req.body as StopFollowInput).closePositions) }));
