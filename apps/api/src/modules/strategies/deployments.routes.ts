import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok, created } from '../../http/response.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { controlDeployment, createDeployment, deploymentReport, getDeployment, listDeployments, setMultiplier, tickDeployments, type DeployAction } from './deployments.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const limit = perUserRateLimit({ name: 'deployment-control', max: 30, windowSeconds: 60, message: 'Too many changes in a minute. Give it a moment.' });
const p = (req: Request) => String(req.params.id).slice(0, 40);

export const deploySchema = z.object({
  mode: z.enum(['paper', 'live']),
  capital: z.number().min(100).max(100_000_000).optional(),
  connectionId: z.string().min(1).max(64).optional(),
  sizeMultiplier: z.number().min(0.01).max(10).optional(),
  confirmLive: z.boolean().optional(),
}).strict();
const actions = ['pause', 'resume', 'stop', 'settle', 'emergency_close', 'archive'] as const;

/** POST /api/strategies/:id/deployments, GET /api/strategies/:id/deployments */
export function mountStrategyDeployments(r: IRouter) {
  r.post('/:id/deployments', limit, validateBody(deploySchema), wrap(async (req, res) => created(res, await createDeployment(uid(res), p(req), req.body))));
  r.get('/:id/deployments', wrap(async (req, res) => ok(res, await listDeployments(uid(res), p(req)))));
}

// Deployments (F15-F18).
export const deploymentsRouter: IRouter = Router();
deploymentsRouter.use(requireAuth, requirePlatformAccess);
deploymentsRouter.get('/', wrap(async (_req, res) => ok(res, await listDeployments(uid(res)))));
deploymentsRouter.get('/report', wrap(async (req, res) => {
  const mode = req.query.mode === 'live' ? 'live' : 'paper';
  const days = req.query.days === 'all' ? null : Math.min(3650, Math.max(1, Number(req.query.days) || 30));
  ok(res, await deploymentReport(uid(res), mode, days));
}));
deploymentsRouter.get('/:id', wrap(async (req, res) => ok(res, await getDeployment(uid(res), p(req)))));
deploymentsRouter.post('/:id/size', limit, validateBody(z.object({ multiplier: z.number().min(0.01).max(10) }).strict()), wrap(async (req, res) => ok(res, await setMultiplier(uid(res), p(req), (req.body as { multiplier: number }).multiplier))));
deploymentsRouter.post('/:id/:action', limit, wrap(async (req, res) => {
  const a = String(req.params.action);
  if (!(actions as readonly string[]).includes(a)) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown action' } }); return; }
  ok(res, await controlDeployment(uid(res), p(req), a as DeployAction));
}));

// Worker-driven ticks (when the in-process scheduler is off).
export const deploymentsInternalRouter: IRouter = Router();
deploymentsInternalRouter.use(requireInternalToken);
deploymentsInternalRouter.post('/tick', wrap(async (_req, res) => ok(res, await tickDeployments())));
