import { Router } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { handleGetDeals } from './trades.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', handleGetDeals);

export { router as tradesRouter };
