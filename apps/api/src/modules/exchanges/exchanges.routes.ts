import { Router, type Router as ExpressRouter } from 'express';
import { connectExchangeSchema, updateExchangeSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { handleCatalog, handleConnect, handleEquity, handleList, handleRemove, handleRename, handleTest } from './exchanges.controller.js';

const router: ExpressRouter = Router();

router.use(requireAuth, requirePlatformAccess);

// Every route below that calls an exchange is throttled per user.
const connectLimit = perUserRateLimit({ name: 'exchange-connect', max: 10, windowSeconds: 600, message: 'Too many connection attempts. Wait a few minutes and try again.' });
const exchangeCallLimit = perUserRateLimit({ name: 'exchange-call', max: 30, windowSeconds: 60, message: 'Too many requests to your exchange. Give it a minute.' });
// Renaming and disconnecting don't call the exchange, but they change (or wipe) stored keys.
const writeLimit = perUserRateLimit({ name: 'exchange-write', max: 30, windowSeconds: 60, message: 'Too many changes to your exchange accounts. Give it a minute.' });

router.get('/catalog', handleCatalog);
router.get('/', handleList);
router.post('/', connectLimit, validateBody(connectExchangeSchema), handleConnect);
router.post('/:id/test', exchangeCallLimit, handleTest);
router.patch('/:id', writeLimit, validateBody(updateExchangeSchema), handleRename);
router.delete('/:id', writeLimit, handleRemove);
router.get('/:id/equity', exchangeCallLimit, handleEquity);

export { router as exchangesRouter };
