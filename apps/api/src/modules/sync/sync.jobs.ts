// Scheduled + internal entry points for trade sync.
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { env } from '@tradinjournal/config';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { dueAccounts } from './sync.service.js';
import { syncQueue } from './sync.queue.js';

/** Queue the accounts that are due (low priority — users jump ahead). */
export async function queueDueSyncs(limit = env.SYNC_BATCH): Promise<{ queued: number; waiting: number; active: number }> {
  const ids = await dueAccounts(limit);
  for (const id of ids) void syncQueue().request(id, 'low');
  return { queued: ids.length, ...syncQueue().stats() };
}

// POST /internal/sync/run — the worker's cron hook when IN_PROCESS_SCHEDULER is off.
export const syncInternalRouter: IRouter = Router();
syncInternalRouter.use(requireInternalToken);
syncInternalRouter.post('/run', validateBody(z.object({ limit: z.number().int().min(1).max(500).optional() })), (req, res, next) => {
  queueDueSyncs(req.body?.limit).then(r => ok(res, r)).catch(next);
});
