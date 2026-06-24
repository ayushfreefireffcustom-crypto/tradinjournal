import { Router } from 'express';
import { connectAccountSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { handleConnect, handleList } from './accounts.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(connectAccountSchema), handleConnect);
router.get('/', handleList);

export { router as accountsRouter };
