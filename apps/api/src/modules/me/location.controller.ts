import type { Request, Response, NextFunction } from 'express';
import { ok } from '../../http/response.js';
import type { UpdateLocationInput } from '@tradinjournal/contracts';
import { getUserLocation, updateUserLocation } from './location.service.js';
import { suggestPlaces } from '../../lib/geocode.js';
import { ValidationError } from '../../http/errors.js';

export async function handleGetLocation(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const loc = await getUserLocation(res.locals.user.id);
    ok(res, loc);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await updateUserLocation(res.locals.user.id, req.body as UpdateLocationInput));
  } catch (err) {
    next(err);
  }
}

export async function handleSuggestLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const kindRaw = String(req.query.kind || '');
    const kind = kindRaw === 'city' || kindRaw === 'postal' ? kindRaw : null;
    const q = String(req.query.q || '').trim();
    const country = String(req.query.country || '').trim().toUpperCase();
    if (!kind) throw new ValidationError('kind must be city or postal');
    if (country.length !== 2) throw new ValidationError('country (ISO-2) is required for suggestions');
    if (q.length < 2) {
      ok(res, []);
      return;
    }
    ok(res, await suggestPlaces(kind, q, country));
  } catch (err) {
    next(err);
  }
}
