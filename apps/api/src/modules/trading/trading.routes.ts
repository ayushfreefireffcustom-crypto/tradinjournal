// Trading desk routes (/api/trading). Mounted only when TRADING_ENABLED.
import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { createApiKeySchema, type CreateApiKeyInput, historyImportSchema, historyQuerySchema, type HistoryImportInput, webhookSetupSchema, webhookUpdateSchema, type WebhookSetupInput, type WebhookUpdateInput, protectionQuerySchema, setProtectionSchema, type SetProtectionInput, cancelOrderSchema, closeManySchema, closePositionSchema, deskOrderFiltersSchema, deskOrdersQuerySchema, orderTicketSchema, ticketQuoteQuerySchema, type OrderTicketInput, type CloseManyInput, type DeskOrderFilters, type DeskOrdersQuery } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { previewTicket, ticketQuote, tradableInstruments } from './ticket.service.js';
import { getProtection, setProtection } from './protection.service.js';
import { exchangeJournal, importHistory } from './history.service.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.service.js';
import { contextOf, recordActivity, recordTradeAction } from '../me/activity.service.js';
import { cancelOrderAudited, closePositionAudited, placeTicketAudited } from './trade-audit.js';
import { deleteWebhook, getWebhook, setupWebhook, updateWebhook, webhookEvents } from './webhook.service.js';
import { closeMany, deskOrders, deskOrdersCsv, deskOrdersSummary, deskOverview } from './trading.service.js';
import { requireFeature } from '../../lib/plans.js';
import { prisma } from '@tradinjournal/db';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// Every overview reads each exchange account; closes send real orders.
const readLimit = perUserRateLimit({ name: 'desk-read', max: 60, windowSeconds: 60, message: 'Too many refreshes. Give it a moment.' });
const exportLimit = perUserRateLimit({ name: 'desk-export', max: 10, windowSeconds: 60, message: 'Too many exports. Wait a minute.' });
const closeLimit = perUserRateLimit({ name: 'desk-close', max: 20, windowSeconds: 60, message: 'Too many orders in a short time. Wait a minute and try again.' });

export const tradingRouter: ExpressRouter = Router();
tradingRouter.use(requireAuth, requirePlatformAccess);
tradingRouter.get('/overview', readLimit, wrap(async (_req, res) => res.json({ data: await deskOverview(uid(res)) })));
tradingRouter.get('/orders', validateQuery(deskOrdersQuerySchema), wrap(async (req, res) => res.json({ data: await deskOrders(uid(res), req.query as unknown as DeskOrdersQuery) })));
tradingRouter.get('/orders/summary', validateQuery(deskOrderFiltersSchema), wrap(async (req, res) => res.json({ data: await deskOrdersSummary(uid(res), req.query as unknown as DeskOrderFilters) })));
tradingRouter.get('/orders/export.csv', exportLimit, validateQuery(deskOrderFiltersSchema), wrap(async (req, res) => {
  const out = await deskOrdersCsv(uid(res), req.query as unknown as DeskOrderFilters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tradelogs-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('X-Rows', String(out.rows));
  res.setHeader('X-Truncated', String(out.truncated));
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.csv);
}));
// Order ticket (D10, D11, D13). Quote and preview read the exchange; place sends a real order.
tradingRouter.get('/instruments', readLimit, wrap(async (_req, res) => res.json({ data: await tradableInstruments(uid(res)) })));
tradingRouter.get('/quote', readLimit, validateQuery(ticketQuoteQuerySchema), wrap(async (req, res) => {
  const q = req.query as unknown as { connectionId: string; symbol: string };
  res.json({ data: await ticketQuote(uid(res), q.connectionId, q.symbol) });
}));
tradingRouter.post('/orders/preview', readLimit, validateBody(orderTicketSchema), wrap(async (req, res) => res.json({ data: await previewTicket(uid(res), req.body as OrderTicketInput) })));
tradingRouter.post('/orders', closeLimit, requireFeature('trading.desk', 'Placing orders from the trading desk'), validateBody(orderTicketSchema), wrap(async (req, res) => res.json({ data: await placeTicketAudited(req, res) })));
// Personal API keys for /api/v1 (D16).
tradingRouter.get('/api-keys', wrap(async (_req, res) => res.json({ data: await listApiKeys(uid(res)) })));
tradingRouter.post('/api-keys', closeLimit, requireFeature('api.keys', 'API keys'), validateBody(createApiKeySchema), wrap(async (req, res) => {
  const k = await createApiKey(uid(res), req.body as CreateApiKeyInput);
  await recordActivity(uid(res), 'api_key_created', `Created API key “${k.name}” (${k.scope}, …${k.last4})`, contextOf(req));
  res.status(201).json({ data: k });
}));
tradingRouter.post('/api-keys/:id/revoke', closeLimit, wrap(async (req, res) => {
  const k = await revokeApiKey(uid(res), String(req.params.id).slice(0, 64));
  await recordActivity(uid(res), 'api_key_revoked', `Revoked API key “${k.name}” (…${k.last4})`, contextOf(req));
  res.json({ data: k });
}));

// Exchange trade history and journal (D17, D18).
tradingRouter.get('/history', validateQuery(historyQuerySchema), wrap(async (req, res) => res.json({ data: await exchangeJournal(uid(res), (req.query as unknown as { connectionId: string }).connectionId) })));
tradingRouter.post('/history/import', exportLimit, validateBody(historyImportSchema), wrap(async (req, res) => {
  const b = req.body as HistoryImportInput;
  res.json({ data: await importHistory(uid(res), b.connectionId, b.days) });
}));

// TradingView webhook setup and its request log (D14, D15).
tradingRouter.get('/webhook', wrap(async (_req, res) => res.json({ data: await getWebhook(uid(res)) })));
tradingRouter.post('/webhook', closeLimit, requireFeature('webhooks', 'TradingView webhooks'), validateBody(webhookSetupSchema), wrap(async (req, res) => {
  const w = await setupWebhook(uid(res), req.body as WebhookSetupInput);
  await recordTradeAction(req, res, 'webhook_changed', `Set up the TradingView webhook on ${w.connection.label} with a new secret (…${w.secretLast4})`, { connectionId: w.connection.id });
  res.json({ data: w });
}));
tradingRouter.patch('/webhook', closeLimit, validateBody(webhookUpdateSchema), wrap(async (req, res) => {
  const b = req.body as WebhookUpdateInput;
  const w = await updateWebhook(uid(res), b);
  const what = [b.enabled === true ? 'turned it on' : b.enabled === false ? 'turned it off' : null, b.connectionId ? `pointed it at ${w.connection.label}` : null, b.liveConfirmed ? 'confirmed real-money orders' : null].filter(Boolean);
  await recordTradeAction(req, res, 'webhook_changed', `Changed the TradingView webhook${what.length ? `: ${what.join(', ')}` : ''}`, { connectionId: w.connection.id, ...b });
  res.json({ data: w });
}));
tradingRouter.delete('/webhook', closeLimit, wrap(async (req, res) => {
  await deleteWebhook(uid(res));
  await recordTradeAction(req, res, 'webhook_changed', 'Removed the TradingView webhook');
  res.json({ data: { ok: true } });
}));
tradingRouter.get('/webhook/events', wrap(async (req, res) => res.json({ data: await webhookEvents(uid(res), typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 64) : undefined) })));

// Take-profit / stop-loss on an open position (D5).
tradingRouter.get('/protection', readLimit, validateQuery(protectionQuerySchema), wrap(async (req, res) => {
  const q = req.query as unknown as { connectionId: string; symbol: string };
  res.json({ data: await getProtection(uid(res), q.connectionId, q.symbol) });
}));
tradingRouter.post('/protection', closeLimit, validateBody(setProtectionSchema), wrap(async (req, res) => {
  const b = req.body as SetProtectionInput;
  const r = await setProtection(uid(res), b);
  const what = r.changes.filter((c) => c.action !== 'kept').map((c) => `${c.kind === 'TP' ? 'take-profit' : 'stop-loss'} ${c.action}${c.ok ? '' : ' (failed)'}`);
  await recordTradeAction(req, res, 'protection_changed', `Changed take-profit / stop-loss on ${b.symbol}${what.length ? `: ${what.join(', ')}` : ' (nothing to change)'}`, { connectionId: b.connectionId, symbol: b.symbol, takeProfit: b.takeProfit, stopLoss: b.stopLoss, stopLossTrail: b.stopLossTrail, changes: r.changes.map((c) => ({ kind: c.kind, action: c.action, ok: c.ok })) });
  res.json({ data: r });
}));
tradingRouter.post('/orders/cancel', closeLimit, validateBody(cancelOrderSchema), wrap(async (req, res) => res.json({ data: await cancelOrderAudited(req, res) })));
tradingRouter.post('/positions/close-many', closeLimit, validateBody(closeManySchema), wrap(async (req, res) => {
  const r = await closeMany(uid(res), req.body as CloseManyInput);
  const sent = r.results.filter((x) => x.ok).length;
  // Only the caller's own accounts go in the record; ids that aren't theirs are just counted.
  const mine = new Set((await prisma.exchangeConnection.findMany({ where: { userId: uid(res), id: { in: r.results.map((x) => x.connectionId) } }, select: { id: true } })).map((c) => c.id));
  await recordTradeAction(req, res, 'position_closed', `Closed ${r.results.length} position${r.results.length === 1 ? '' : 's'} (${sent} sent${sent < r.results.length ? `, ${r.results.length - sent} not` : ''})`, {
    items: r.results.filter((x) => mine.has(x.connectionId)).map((x) => ({ connectionId: x.connectionId, symbol: x.symbol, ok: x.ok })),
    unknownAccounts: r.results.filter((x) => !mine.has(x.connectionId)).length,
    orderIds: r.results.flatMap((x) => (x.order ? [x.order.id] : [])),
  });
  res.json({ data: r });
}));
tradingRouter.post('/positions/close', closeLimit, validateBody(closePositionSchema), wrap(async (req, res) => res.json({ data: await closePositionAudited(req, res) })));
