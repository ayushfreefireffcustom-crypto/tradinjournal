import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { optionsAnalyzeSchema, optionsReplaySchema, optionsTemplateSchema, type OptionsAnalyzeDto } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { ValidationError } from '../../http/errors.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import {
  analyzeLegs, chain, contract, replayLegs, contractCandles, optionsOverview, premiumSeries, RESOLUTIONS, templateFor, templates, underlyings,
  type LegInput, type OptEnv, type Resolution,
} from './options.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const envOf = (req: Request): OptEnv => (req.query.env === 'testnet' ? 'testnet' : 'live');
const und = (req: Request) => {
  const u = String(req.query.underlying ?? 'BTC').toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(u)) throw new ValidationError('Pick an underlying.');
  return u;
};
const code = (v: unknown) => {
  if (v == null || v === '') return undefined;
  if (!/^\d{6}$/.test(String(v))) throw new ValidationError('Expiry is DDMMYY.');
  return String(v);
};
const sym = (req: Request) => {
  const s = String(req.params.symbol);
  if (!/^[CP]-[A-Z0-9]{2,12}-\d+(\.\d+)?-\d{6}$/.test(s)) throw new ValidationError('Not an option symbol.');
  return s;
};
const res = (v: unknown): Resolution => (RESOLUTIONS.includes(v as Resolution) ? (v as Resolution) : '1h');
const days = (v: unknown, def: number) => { const d = Number(v ?? def); return Number.isFinite(d) && d >= 1 ? Math.min(90, Math.floor(d)) : def; };
const analyzeLimit = perUserRateLimit({ name: 'options-analyze', max: 120, windowSeconds: 60, message: 'Too many updates in a minute. Give it a moment.' });

// Options market data and the multi-leg builder (Part G). Public Delta data only; no exchange keys.
export const optionsRouter: IRouter = Router();
optionsRouter.use(requireAuth, requirePlatformAccess);
optionsRouter.get('/underlyings', wrap(async (req, r) => ok(r, await underlyings(envOf(req)))));
optionsRouter.get('/chain', wrap(async (req, r) => ok(r, await chain(envOf(req), und(req), code(req.query.expiry)))));
optionsRouter.get('/overview', wrap(async (req, r) => ok(r, await optionsOverview(envOf(req), und(req), code(req.query.expiry)))));
optionsRouter.get('/templates', wrap(async (_req, r) => ok(r, templates())));
optionsRouter.get('/contracts/:symbol', wrap(async (req, r) => ok(r, await contract(envOf(req), sym(req)))));
optionsRouter.get('/contracts/:symbol/candles', wrap(async (req, r) => {
  const kind = String(req.query.kind ?? 'price');
  if (!['price', 'mark', 'oi', 'iv'].includes(kind)) throw new ValidationError('kind is price, mark, oi or iv.');
  ok(r, await contractCandles(envOf(req), sym(req), kind as 'price' | 'mark' | 'oi' | 'iv', res(req.query.resolution), days(req.query.days, 7)));
}));
optionsRouter.get('/premium', wrap(async (req, r) => {
  const e = code(req.query.expiry);
  if (!e) throw new ValidationError('Pick an expiry.');
  const put = Number(req.query.put);
  const call = Number(req.query.call);
  const strangle = req.query.put != null && req.query.call != null ? (put > 0 && call > 0 && put <= call ? { put, call } : null) : null;
  if ((req.query.put != null || req.query.call != null) && !strangle) throw new ValidationError('A strangle needs a put strike at or below the call strike.');
  ok(r, await premiumSeries(envOf(req), und(req), e, res(req.query.resolution), days(req.query.days, 3), strangle));
}));
optionsRouter.post('/analyze', analyzeLimit, validateBody(optionsAnalyzeSchema), wrap(async (req, r) => {
  const b = req.body as OptionsAnalyzeDto;
  ok(r, await analyzeLegs(b.env, b.underlying, { legs: b.legs as LegInput[], at: b.at, vol: b.vol }));
}));
optionsRouter.post('/template', analyzeLimit, validateBody(optionsTemplateSchema), wrap(async (req, r) => {
  const b = req.body as { env: OptEnv; underlying: string; template: string; expiry: string; qty: number };
  ok(r, await templateFor(b.env, b.underlying, b.template, b.expiry, b.qty));
}));
optionsRouter.post('/replay', analyzeLimit, validateBody(optionsReplaySchema), wrap(async (req, r) => {
  const b = req.body as { env: OptEnv; underlying: string; legs: LegInput[]; path: 'flat' | 'recorded' };
  ok(r, await replayLegs(b.env, b.underlying, { legs: b.legs, path: b.path }));
}));
