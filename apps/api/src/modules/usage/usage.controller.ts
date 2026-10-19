import type { Request, Response, NextFunction } from 'express';
import { ok } from '../../http/response.js';
import { recordHeartbeat } from './usage.service.js';

export async function handleHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id;
    const body = (req.body ?? {}) as {
      path?: string;
      feature?: string;
      ended?: boolean;
      kind?: string;
    };
    const result = await recordHeartbeat(userId, {
      path: typeof body.path === 'string' ? body.path.slice(0, 200) : undefined,
      feature: typeof body.feature === 'string' ? body.feature.slice(0, 64) : undefined,
      ended: !!body.ended || body.kind === 'end',
      kind: body.kind === 'view' || body.kind === 'beat' || body.kind === 'end' ? body.kind : undefined,
      userAgent: typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 300)
        : undefined,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
}
