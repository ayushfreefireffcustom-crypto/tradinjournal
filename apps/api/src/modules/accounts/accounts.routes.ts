import { Router, type Router as ExpressRouter } from 'express';
import { connectAccountSchema, updateCredentialsSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { handleConnect, handleList, handleDelete, handleUpdateCredentials, handleSyncNow } from './accounts.controller.js';

const router: ExpressRouter = Router();

router.use(requireAuth, requirePlatformAccess);

router.post('/', validateBody(connectAccountSchema), handleConnect);
router.get('/', handleList);
router.patch('/:id/credentials', validateBody(updateCredentialsSchema), handleUpdateCredentials);
// "Sync now" is the one user-triggered path to the MT5 bridge — keep it bounded.
const syncLimit = perUserRateLimit({ name: 'sync-now', max: 6, windowSeconds: 60, message: 'You just synced — give it a minute before syncing again.' });
router.post('/:id/sync', syncLimit, handleSyncNow);
router.delete('/:id', handleDelete);

export { router as accountsRouter };
