// Desk actions with their audit record (Z3), shared by the app routes and the
// API-key routes (/api/v1) so both leave the same trail.
import type { Request, Response } from 'express';
import type { CancelOrderInput, ClosePositionInput, OrderTicketInput } from '@tradinjournal/contracts';
import { recordTradeAction } from '../me/activity.service.js';
import { placeTicket } from './ticket.service.js';
import { cancelOrder, closePosition } from './trading.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const sizeText = (s: OrderTicketInput['size']) => (s.mode === 'contracts' ? `${s.value} contracts` : s.mode === 'usd' ? `$${s.value}` : `${s.value}% risk`);
const ids = (xs: Array<{ id: string } | null | undefined>) => xs.filter((x): x is { id: string } => !!x).map((x) => x.id);

export async function placeTicketAudited(req: Request, res: Response) {
  const t = req.body as OrderTicketInput;
  const r = await placeTicket(uid(res), t);
  await recordTradeAction(req, res, 'order_placed', `${t.side === 'BUY' ? 'Buy' : 'Sell'} ${t.symbol} ${t.type.toLowerCase().replace(/_/g, ' ')}, ${sizeText(t.size)}: ${r.outcome}`, {
    connectionId: t.connectionId, symbol: t.symbol, side: t.side, type: t.type, size: t.size, requestId: t.requestId, outcome: r.outcome,
    orderIds: ids([r.order, ...r.protective.map((p) => p.order)]),
  });
  return r;
}

export async function cancelOrderAudited(req: Request, res: Response) {
  const b = req.body as CancelOrderInput;
  const r = await cancelOrder(uid(res), b);
  await recordTradeAction(req, res, 'order_cancelled', `Cancelled a ${b.symbol} order (${r.status.toLowerCase()})`, { connectionId: b.connectionId, symbol: b.symbol, exchangeOrderId: b.exchangeOrderId, status: r.status });
  return r;
}

export async function closePositionAudited(req: Request, res: Response) {
  const b = req.body as ClosePositionInput;
  const r = await closePosition(uid(res), b);
  await recordTradeAction(req, res, 'position_closed', `Closed the ${b.symbol} position: ${r.message}`, { connectionId: b.connectionId, symbol: b.symbol, orderIds: ids([r.order]) });
  return r;
}
