import { Router, type Request, type Response, type NextFunction, type Router as ExpressRouter } from 'express';
import { adminLeaderActionSchema, adminLeadersQuerySchema, adminStopFollowSchema, killSwitchSchema, type AdminLeaderActionInput, type KillSwitchInput } from '@tradinjournal/contracts';
import type { CopyLeaderStatus } from '@tradinjournal/db';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireAdmin } from '../../http/middleware/require-admin.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { adminLeaderAction, adminListLeaders, adminStopFollow, adminUserCopy, engineHealth, getKillSwitch, setKillSwitch } from './admin-copy.service.js';

const actorOf = (res: Response) => ({ id: res.locals.user.id as string, email: res.locals.user.email as string });
type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const router: ExpressRouter = Router();
router.use(requireAuth, requireAdmin);

router.get('/leaders', validateQuery(adminLeadersQuerySchema), wrap(async (req, res) => res.json({ data: await adminListLeaders((req.query as { status?: CopyLeaderStatus }).status) })));
router.post('/leaders/:id/action', validateBody(adminLeaderActionSchema), wrap(async (req, res) => {
  const b = req.body as AdminLeaderActionInput;
  res.json({ data: await adminLeaderAction(actorOf(res), String(req.params.id), b.action, b.reason) });
}));
router.get('/kill-switch', wrap(async (_req, res) => res.json({ data: await getKillSwitch() })));
router.post('/kill-switch', validateBody(killSwitchSchema), wrap(async (req, res) => {
  const b = req.body as KillSwitchInput;
  res.json({ data: await setKillSwitch(actorOf(res), b.enabled, b.reason) });
}));
router.get('/health', wrap(async (_req, res) => res.json({ data: await engineHealth() })));
router.get('/users/:id', wrap(async (req, res) => res.json({ data: await adminUserCopy(String(req.params.id)) })));
router.post('/follows/:id/stop', validateBody(adminStopFollowSchema), wrap(async (req, res) => {
  res.json({ data: await adminStopFollow(actorOf(res), String(req.params.id), (req.body as { reason: string }).reason) });
}));

export { router as adminCopyRouter };
