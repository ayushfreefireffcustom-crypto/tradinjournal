import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { creatorApplySchema, reviewSchema, subscribeSchema, templateCreateSchema, templateUpdateSchema } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireAdmin } from '../../http/middleware/require-admin.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { created, ok } from '../../http/response.js';
import { ValidationError } from '../../http/errors.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { contextOf, recordActivity, recordTradeAction } from '../me/activity.service.js';
import {
  adminQueue, applyCreator, browse, createTemplate, getCreator, manageSubscription, mySubscriptions, myTemplates, publishOptions, resizeSubscription,
  reviewCreator, reviewTemplate, setListed, subscribe, templateDetail, updateTemplate, type Sort, type SubscribeInput, type TemplateInput,
} from './marketplace.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const uid = (res: Response) => res.locals.user.id as string;
const p = (req: Request, k = 'id') => String(req.params[k]).slice(0, 40);
const writeLimit = perUserRateLimit({ name: 'marketplace-write', max: 20, windowSeconds: 60, message: 'Too many changes in a minute.' });
const publishLimit = perUserRateLimit({ name: 'marketplace-publish', max: 10, windowSeconds: 3600, message: 'That’s a lot of publishing for an hour. Try again later.' });
const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 60) : undefined);

// Strategy marketplace (H1–H3).
export const marketplaceRouter: IRouter = Router();
marketplaceRouter.use(requireAuth, requirePlatformAccess);
marketplaceRouter.get('/', wrap(async (req, res) => ok(res, await browse({ category: str(req.query.category), risk: str(req.query.risk), symbol: str(req.query.symbol), q: str(req.query.q), sort: str(req.query.sort) as Sort | undefined }, uid(res)))));
marketplaceRouter.get('/creator', wrap(async (_req, res) => ok(res, await getCreator(uid(res)))));
marketplaceRouter.post('/creator', writeLimit, validateBody(creatorApplySchema), wrap(async (req, res) => ok(res, await applyCreator(uid(res), req.body))));
marketplaceRouter.get('/mine', wrap(async (_req, res) => ok(res, await myTemplates(uid(res)))));
marketplaceRouter.get('/publish-options/:strategyId', wrap(async (req, res) => ok(res, await publishOptions(uid(res), p(req, 'strategyId')))));
marketplaceRouter.post('/templates', publishLimit, validateBody(templateCreateSchema), wrap(async (req, res) => created(res, await createTemplate(uid(res), req.body as TemplateInput))));
marketplaceRouter.patch('/templates/:id', publishLimit, validateBody(templateUpdateSchema), wrap(async (req, res) => ok(res, await updateTemplate(uid(res), p(req), req.body))));
marketplaceRouter.post('/templates/:id/:listing(list|unlist)', writeLimit, wrap(async (req, res) => ok(res, await setListed(uid(res), p(req), req.params.listing === 'list'))));
marketplaceRouter.get('/subscriptions', wrap(async (_req, res) => ok(res, await mySubscriptions(uid(res)))));
marketplaceRouter.post('/subscriptions/:id/size', writeLimit, wrap(async (req, res) => {
  const m = Number((req.body as { multiplier?: unknown })?.multiplier);
  if (!(m >= 0.01 && m <= 10)) throw new ValidationError('The size multiplier must be between 0.01 and 10.');
  const s = await resizeSubscription(uid(res), p(req), m);
  await recordTradeAction(req, res, 'subscription_changed', `Set the “${s.template?.name ?? 'marketplace'}” subscription to ${m}× size`, { subscriptionId: p(req), multiplier: m });
  ok(res, s);
}));
const SUB_VERB = { pause: 'Paused', resume: 'Resumed', cancel: 'Cancelled', cancel_settle: 'Cancelled and closed the positions of' } as const;
marketplaceRouter.post('/subscriptions/:id/:action(pause|resume|cancel|cancel_settle)', writeLimit, wrap(async (req, res) => {
  const a = req.params.action as keyof typeof SUB_VERB;
  const s = await manageSubscription(uid(res), p(req), a);
  await recordTradeAction(req, res, 'subscription_changed', `${SUB_VERB[a]} the “${s.template?.name ?? 'marketplace'}” subscription`, { subscriptionId: p(req), action: a });
  ok(res, s);
}));
marketplaceRouter.get('/:id', wrap(async (req, res) => ok(res, await templateDetail(uid(res), p(req)))));
marketplaceRouter.post('/:id/subscribe', writeLimit, validateBody(subscribeSchema), wrap(async (req, res) => {
  const r = await subscribe(uid(res), p(req), req.body as SubscribeInput);
  await recordActivity(uid(res), 'deployment_started', `Subscribed to a marketplace strategy (${(req.body as SubscribeInput).mode})`, contextOf(req), { subscriptionId: r.id });
  created(res, r);
}));

export const adminMarketplaceRouter: IRouter = Router();
adminMarketplaceRouter.use(requireAuth, requireAdmin);
adminMarketplaceRouter.get('/', wrap(async (req, res) => ok(res, await adminQueue(str(req.query.status) ?? 'pending'))));
adminMarketplaceRouter.post('/creators/:id', validateBody(reviewSchema), wrap(async (req, res) => {
  const b = req.body as { decision: string; note?: string };
  if (!['approve', 'reject', 'suspend'].includes(b.decision)) throw new ValidationError('Decision is approve, reject or suspend.');
  ok(res, await reviewCreator(p(req), b.decision as 'approve' | 'reject' | 'suspend', b.note));
}));
adminMarketplaceRouter.post('/templates/:id', validateBody(reviewSchema), wrap(async (req, res) => {
  const b = req.body as { decision: string; note?: string };
  if (!['publish', 'reject', 'unlist'].includes(b.decision)) throw new ValidationError('Decision is publish, reject or unlist.');
  ok(res, await reviewTemplate(p(req), b.decision as 'publish' | 'reject' | 'unlist', b.note));
}));
