import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { feedbackSchema, feedbackStatusSchema, type FeedbackInput } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireAdmin } from '../../http/middleware/require-admin.js';
import { validateBody } from '../../http/middleware/validate.js';
import { created, ok } from '../../http/response.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { adminFeedback, myFeedback, setFeedbackStatus, submitFeedback } from './feedback.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const sendLimit = perUserRateLimit({ name: 'feedback', max: 10, windowSeconds: 3600, message: 'That’s a lot of messages for one hour. Email us instead.' });

// Help page (H10).
export const feedbackRouter: IRouter = Router();
feedbackRouter.use(requireAuth);
feedbackRouter.post('/', sendLimit, validateBody(feedbackSchema), wrap(async (req, res) => {
  const ua = req.headers['user-agent'];
  created(res, await submitFeedback({ id: res.locals.user.id as string, email: res.locals.user.email as string }, req.body as FeedbackInput, Array.isArray(ua) ? ua[0]! : ua ?? null));
}));
feedbackRouter.get('/mine', wrap(async (_req, res) => ok(res, await myFeedback(res.locals.user.id as string))));

export const adminFeedbackRouter: IRouter = Router();
adminFeedbackRouter.use(requireAuth, requireAdmin);
adminFeedbackRouter.get('/', wrap(async (req, res) => ok(res, await adminFeedback({ status: typeof req.query.status === 'string' ? req.query.status : undefined, cursor: typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 40) : undefined }))));
adminFeedbackRouter.patch('/:id', validateBody(feedbackStatusSchema), wrap(async (req, res) => ok(res, await setFeedbackStatus(String(req.params.id).slice(0, 40), (req.body as { status: 'new' | 'read' | 'done' }).status))));
