import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { deleteConfirmSchema, tourUpdateSchema, updateLocationSchema, updateProfileSchema, type UpdateProfileInput } from '@tradinjournal/contracts';
import {
  handleGetLocation,
  handleUpdateLocation,
  handleSuggestLocation,
} from './location.controller.js';
import { confirmDeletion, deletionBlockers, exportData, getProfile, getTour, requestDeletion, updateProfile, updateTour } from './account.service.js';
import { contextOf, listActivity, type ActivityGroup } from './activity.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const uid = (res: Response) => res.locals.user.id as string;
const exportLimit = perUserRateLimit({ name: 'me-export', max: 5, windowSeconds: 3600, message: 'You can download your data 5 times an hour.' });
const deleteAskLimit = perUserRateLimit({ name: 'me-delete-ask', max: 3, windowSeconds: 3600, message: 'Too many codes asked for. Try again in an hour.' });
const deleteConfirmLimit = perUserRateLimit({ name: 'me-delete-confirm', max: 10, windowSeconds: 3600, message: 'Too many tries. Try again in an hour.' });
const writeLimit = perUserRateLimit({ name: 'me-write', max: 30, windowSeconds: 60, message: 'Too many changes in a minute.' });

export const meRouter: IRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/location', handleGetLocation);
meRouter.get('/location/suggest', handleSuggestLocation);
meRouter.patch('/location', validateBody(updateLocationSchema), handleUpdateLocation);

// Profile (H8), tour (H9), activity (H7), export and deletion (H6).
meRouter.get('/profile', wrap(async (_req, res) => ok(res, await getProfile(uid(res)))));
meRouter.patch('/profile', writeLimit, validateBody(updateProfileSchema), wrap(async (req, res) => ok(res, await updateProfile(uid(res), req.body as UpdateProfileInput, contextOf(req)))));
meRouter.get('/tour', wrap(async (_req, res) => ok(res, await getTour(uid(res)))));
meRouter.patch('/tour', writeLimit, validateBody(tourUpdateSchema), wrap(async (req, res) => ok(res, await updateTour(uid(res), req.body as { seen?: string[]; dismissed?: boolean; reset?: boolean }))));
meRouter.get('/activity', wrap(async (req, res) => {
  const g = String(req.query.group ?? 'all');
  const group: ActivityGroup = g === 'security' || g === 'trading' || g === 'orders' ? g : 'all';
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : undefined;
  ok(res, await listActivity(uid(res), { group, before, limit: Number(req.query.limit) || 50 }));
}));
meRouter.get('/export', exportLimit, wrap(async (req, res) => {
  const data = await exportData(uid(res), contextOf(req));
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tradelogs-export-${day}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  // BigInt (MT5 logins) isn't JSON; send it as text.
  res.send(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}));
meRouter.get('/delete', wrap(async (_req, res) => ok(res, { blockers: await deletionBlockers(uid(res)) })));
meRouter.post('/delete/request', deleteAskLimit, wrap(async (req, res) => ok(res, await requestDeletion(uid(res), contextOf(req)))));
meRouter.post('/delete/confirm', deleteConfirmLimit, validateBody(deleteConfirmSchema), wrap(async (req, res) => {
  await confirmDeletion(uid(res), (req.body as { otp: string }).otp);
  // The session went with the user; clear the cookie too.
  res.clearCookie('better-auth.session_token', { path: '/', sameSite: 'none', secure: true });
  res.clearCookie('__Secure-better-auth.session_token', { path: '/', sameSite: 'none', secure: true });
  ok(res, { deleted: true });
}));
