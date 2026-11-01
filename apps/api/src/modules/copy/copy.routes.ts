import { Router, type Router as ExpressRouter } from 'express';
import { applyLeaderSchema, createFollowSchema, cursorQuerySchema, leaderRangeQuerySchema, leadersQuerySchema, stopFollowSchema, updateFollowSchema, updateLeaderSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import {
  handleApplyLeader,
  handleCreateFollow,
  handleFollowOrders,
  handleFollowStream,
  handleGetFollow,
  handleGetLeader,
  handleLeaderEquity,
  handleLeaderRoundTrips,
  handleLeaderTrades,
  handleListFollows,
  handleListLeaders,
  handleMyLeader,
  handleStopFollow,
  handleUpdateFollow,
  handleUpdateMyLeader,
} from './copy.controller.js';

const writeLimit = perUserRateLimit({ name: 'copy-write', max: 30, windowSeconds: 600, message: 'Too many changes in a short time. Wait a few minutes and try again.' });
// Stop can place orders on the user's exchange.
const stopLimit = perUserRateLimit({ name: 'copy-stop', max: 10, windowSeconds: 60, message: 'Too many requests to your exchange. Give it a minute.' });

const leaders: ExpressRouter = Router();
leaders.use(requireAuth, requirePlatformAccess);
leaders.get('/', validateQuery(leadersQuerySchema), handleListLeaders);
leaders.get('/me', handleMyLeader);
leaders.post('/apply', writeLimit, validateBody(applyLeaderSchema), handleApplyLeader);
leaders.patch('/me', writeLimit, validateBody(updateLeaderSchema), handleUpdateMyLeader);
leaders.get('/:id', validateQuery(leaderRangeQuerySchema), handleGetLeader);
leaders.get('/:id/trades', validateQuery(cursorQuerySchema), handleLeaderTrades);
leaders.get('/:id/equity', validateQuery(leaderRangeQuerySchema), handleLeaderEquity);
leaders.get('/:id/round-trips', handleLeaderRoundTrips);

const follows: ExpressRouter = Router();
follows.use(requireAuth, requirePlatformAccess);
follows.get('/', handleListFollows);
// Before '/:id', or 'stream' would be taken for an id.
follows.get('/stream', handleFollowStream);
follows.post('/', writeLimit, validateBody(createFollowSchema), handleCreateFollow);
follows.get('/:id', handleGetFollow);
follows.get('/:id/orders', validateQuery(cursorQuerySchema), handleFollowOrders);
follows.patch('/:id', writeLimit, validateBody(updateFollowSchema), handleUpdateFollow);
follows.post('/:id/stop', stopLimit, validateBody(stopFollowSchema), handleStopFollow);

export { leaders as leadersRouter, follows as followsRouter };
