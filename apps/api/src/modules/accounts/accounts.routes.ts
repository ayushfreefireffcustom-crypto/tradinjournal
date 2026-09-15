import { Router, type Router as ExpressRouter } from 'express';
import { connectAccountSchema, updateCredentialsSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { handleConnect, handleList, handleDelete, handleUpdateCredentials } from './accounts.controller.js';

const router: ExpressRouter = Router();

router.use(requireAuth, requirePlatformAccess);

router.post('/', validateBody(connectAccountSchema), handleConnect);
router.get('/', handleList);
router.patch('/:id/credentials', validateBody(updateCredentialsSchema), handleUpdateCredentials);
router.delete('/:id', handleDelete);

export { router as accountsRouter };
