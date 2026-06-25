import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { handleGetDeals, handleGetTrades, handleGetStats } from './trades.controller.js';

const router: ExpressRouter = Router();

router.use(requireAuth);
router.get('/deals', handleGetDeals);
router.get('/stats', handleGetStats);
router.get('/', handleGetTrades);

export { router as tradesRouter };
