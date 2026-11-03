// Guards the API of features the admin has locked to partner-package holders.
// Costs nothing while no feature is locked (the default).
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { auth } from '../../../lib/auth.js';
import { perksFor } from './access.service.js';
import { PERKS } from './perks.js';
import { getProgramSettings } from './settings.js';

function headersOf(req: Request): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach(x => h.append(k, x));
    else if (v !== undefined) h.set(k, v);
  }
  return h;
}

export function perkGate(key: string, label: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const { lockedPerks } = await getProgramSettings();
      if (!lockedPerks.includes(key)) return next();
      const session = await auth.api.getSession({ headers: headersOf(req) }).catch(() => null);
      // Not signed in: the feature's own router answers (401 or public data).
      if (!session?.user) return next();
      const { mine } = await perksFor(session.user.id, session.user.email);
      if (mine.includes(key)) return next();
      res.status(403).json({ error: { code: 'PERK_LOCKED', message: `${label} is available through a partner package. Open Access to see how to unlock it.`, perk: key } });
    })().catch(next);
  };
}

/** [prefix, gate] pairs for app.ts. */
export function perkGates(): [string, RequestHandler][] {
  return PERKS.flatMap(p => p.api.map(prefix => [prefix, perkGate(p.key, p.label)] as [string, RequestHandler]));
}
