import type { Request, Response, NextFunction } from 'express';
import type { ApplyLeaderInput, CreateFollowInput, CursorQuery, LeaderRange, LeadersQuery, StopFollowInput, UpdateFollowInput, UpdateLeaderInput } from '@tradinjournal/contracts';
import { applyAsLeader, getLeader, getMyLeader, leaderEquity, leaderRoundTrips, leaderTrades, listLeaders, updateMyLeader } from './leaders.service.js';
import { subscribeCopy } from './copy-stream.js';
import { contextOf, recordActivity } from '../me/activity.service.js';
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
export const handleLeaderRoundTrips = wrap(async (req, res) => res.json({ data: await leaderRoundTrips(uid(res), String(req.params.id)) }));
export const handleLeaderEquity = wrap(async (req, res) => res.json({ data: await leaderEquity(uid(res), String(req.params.id), rangeOf(req)) }));

export const handleListFollows = wrap(async (req, res) => res.json({ data: await listFollows(uid(res), { includeStopped: req.query.all === '1' }) }));
export const handleCreateFollow = wrap(async (req, res) => {
  const f = await createFollow(uid(res), req.body as CreateFollowInput);
  await recordActivity(uid(res), 'follow_started', `Started copying ${f.leader.displayName} on ${f.connection.label}`, contextOf(req), { followId: f.id });
  res.status(201).json({ data: f });
});
export const handleGetFollow = wrap(async (req, res) => res.json({ data: await getFollow(uid(res), String(req.params.id)) }));
export const handleFollowOrders = wrap(async (req, res) => res.json({ data: await followOrders(uid(res), String(req.params.id), req.query as unknown as CursorQuery) }));
export const handleUpdateFollow = wrap(async (req, res) => res.json({ data: await updateFollow(uid(res), String(req.params.id), req.body as UpdateFollowInput) }));
export const handleStopFollow = wrap(async (req, res) => {
  const close = (req.body as StopFollowInput).closePositions;
  const r = await stopFollow(uid(res), String(req.params.id), close);
  await recordActivity(uid(res), 'follow_stopped', `Stopped a copy${close ? ' and closed its positions' : ', leaving positions open'}`, contextOf(req), { followId: String(req.params.id) });
  res.json({ data: r });
});

/** GET /api/follows/stream: a ping whenever the user's copies change; the page refetches. */
export function handleFollowStream(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');
  const send = () => res.write(`data: ${JSON.stringify({ type: 'changed', at: new Date().toISOString() })}\n\n`);
  const off = subscribeCopy(uid(res), send);
  // Comments keep proxies from closing an idle stream.
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(beat);
    off();
  });
}
