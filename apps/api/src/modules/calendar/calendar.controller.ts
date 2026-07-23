import type { Request, Response, NextFunction } from 'express';
import type { CalendarIngestInput, CalendarQuery } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { NotFoundError } from '../../http/errors.js';
import {
  ingestWindow,
  listEvents,
  getEvent,
  watchEvent,
  unwatchEvent,
  listWatchedEventIds,
} from './calendar.service.js';

// GET /api/calendar — merged events for a window (auth'd, served from cache).
export async function handleListEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const q = req.query as unknown as CalendarQuery;
    const [events, watched] = await Promise.all([listEvents(q), listWatchedEventIds(userId)]);
    const watchedSet = new Set(watched);
    ok(res, events.map(e => ({ ...e, watched: watchedSet.has(e.id) })));
  } catch (err) {
    next(err);
  }
}

// GET /api/calendar/:id — event detail incl. provenance.
export async function handleGetEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await getEvent(req.params.id!);
    if (!event) throw new NotFoundError('Event not found');
    ok(res, event);
  } catch (err) {
    next(err);
  }
}

// POST /api/calendar/:id/watch — pin an event for reminders.
export async function handleWatchEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const found = await watchEvent(userId, req.params.id!);
    if (!found) throw new NotFoundError('Event not found');
    ok(res, { watched: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/calendar/:id/watch
export async function handleUnwatchEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    await unwatchEvent(userId, req.params.id!);
    ok(res, { watched: false });
  } catch (err) {
    next(err);
  }
}

// POST /internal/calendar/ingest — worker-only.
export async function handleIngestCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.body as CalendarIngestInput;
    const result = await ingestWindow(new Date(from), new Date(to));
    ok(res, result);
  } catch (err) {
    next(err);
  }
}
