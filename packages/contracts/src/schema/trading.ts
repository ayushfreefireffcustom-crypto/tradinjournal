// Trading desk (Part D): the user's own positions and orders across their
// exchange connections, and manual closes. Copy trading has its own schemas.
import { z } from 'zod';

export const closePositionSchema = z.object({
  connectionId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(40),
  /** Contracts to close; omitted closes the whole position. */
  qty: z.number().positive().max(1e9).optional(),
  /** Required to close a position a copy is managing; the copy then sees it as changed by hand. */
  confirmCopied: z.boolean().optional(),
});
export type ClosePositionInput = z.infer<typeof closePositionSchema>;

export const deskOrderStatuses = ['all', 'rejected', 'filled', 'open'] as const;
/** Filters shared by the order log, its summary and its CSV export (D2, D12). */
export const deskOrderFiltersSchema = z.object({
  status: z.enum(deskOrderStatuses).default('all'),
  source: z.enum(['MANUAL', 'COPY', 'STRATEGY', 'WEBHOOK']).optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()).optional(),
  connectionId: z.string().min(1).max(64).optional(),
  /** Inclusive range on when the order was sent. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Exact exchange order ID or our client order ID. */
  q: z.string().trim().min(1).max(100).optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, { message: 'The start date must be before the end date', path: ['from'] });
export type DeskOrderFilters = z.infer<typeof deskOrderFiltersSchema>;

export const deskOrdersQuerySchema = deskOrderFiltersSchema.and(z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}));
export type DeskOrdersQuery = z.infer<typeof deskOrdersQuerySchema>;

/** Close several positions at once (D7), or all of them (D8). */
export const closeManySchema = z.object({
  items: z.array(z.object({ connectionId: z.string().min(1).max(64), symbol: z.string().min(1).max(40) })).min(1).max(50),
  /** Applies to every item; needed when any of them is managed by a copy. */
  confirmCopied: z.boolean().optional(),
});
export type CloseManyInput = z.infer<typeof closeManySchema>;

interface DeskAccountRef {
  connectionId: string;
  connectionLabel: string;
  exchange: string;
  environment: 'TESTNET' | 'LIVE';
}

export interface DeskPositionDto extends DeskAccountRef {
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** Contracts. */
  size: number;
  avgEntry: number;
  markPrice: number | null;
  unrealizedPnl: number;
  liquidationPrice: number | null;
  /** Set when a live copy manages (part of) this position. */
  copiedFrom: { followId: string; leaderName: string } | null;
}

export interface DeskPendingOrderDto extends DeskAccountRef {
  exchangeOrderId: string;
  clientOrderId: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  qty: number;
  filledQty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  reduceOnly: boolean;
  createdAt: string | null;
}

export interface DeskClosedTradeDto extends DeskAccountRef {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  avgEntry: number;
  avgExit: number;
  /** Price P&L before fees and funding. */
  pnlUsd: number;
  openedAt: string;
  closedAt: string;
}

export interface DeskOverviewDto {
  positions: DeskPositionDto[];
  pending: DeskPendingOrderDto[];
  /** Round trips closed in the last 30 days, rebuilt from the exchange's fill history. */
  closed: DeskClosedTradeDto[];
  counts: { open: number; pending: number; closed: number; rejected: number };
  /** Accounts the exchange couldn't be read for; their rows are missing, not zero. */
  errors: Array<{ connectionId: string; connectionLabel: string; message: string }>;
}

export interface DeskOrderDto extends DeskAccountRef {
  id: string;
  source: 'MANUAL' | 'COPY' | 'STRATEGY' | 'WEBHOOK';
  leaderName: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  reduceOnly: boolean;
  qty: number;
  filledQty: number;
  avgFillPrice: number | null;
  status: string;
  error: string | null;
  exchangeOrderId: string | null;
  clientOrderId: string;
  requestedAt: string;
  filledAt: string | null;
}

export interface ClosePositionResultDto {
  order: DeskOrderDto;
  /** Plain-language outcome for the toast. */
  message: string;
}

export interface DeskOrdersSummaryDto {
  placed: number;
  filled: number;
  partial: number;
  rejected: number;
  /** Sent or waiting, not yet answered. */
  inFlight: number;
  /** Never sent: limits, kill switch, sizes rounded to zero. */
  skipped: number;
  cancelled: number;
  /** USD value of everything filled; null when a contract's size couldn't be read. */
  filledNotionalUsd: number | null;
}

export interface CloseManyResultDto {
  results: Array<{ connectionId: string; symbol: string; ok: boolean; message: string; order: DeskOrderDto | null }>;
}

// ── Order ticket (D10, D11, D13) ────────────────────────────────────────────

export const ticketTypes = ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT'] as const;
export const orderTicketSchema = z.object({
  connectionId: z.string().min(1).max(64),
  symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(ticketTypes),
  /** Contracts, a USD amount, or a share of equity to risk down to the stop-loss. */
  size: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('contracts'), value: z.number().positive().max(1e9) }),
    z.object({ mode: z.literal('usd'), value: z.number().positive().max(1e9) }),
    z.object({ mode: z.literal('risk'), value: z.number().positive().max(10) }),
  ]),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  tif: z.enum(['GTC', 'IOC']).optional(),
  postOnly: z.boolean().optional(),
  reduceOnly: z.boolean().optional(),
  leverage: z.number().int().min(1).max(200).optional(),
  takeProfit: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  /** Required for a real-money account. */
  confirmLive: z.boolean().optional(),
  /** Set once per ticket by the client; a repeat with the same id is the same order, never a second one. */
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});
export type OrderTicketInput = z.infer<typeof orderTicketSchema>;

export const ticketQuoteQuerySchema = z.object({ connectionId: z.string().min(1).max(64), symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()) });

/** What the ticket needs to size and check an order before it's built. */
export interface TicketQuoteDto {
  symbol: string;
  live: boolean;
  markPrice: number | null;
  contractMultiplier: number;
  qtyStep: number;
  minQty: number;
  tickSize: number;
  maxLeverage: number | null;
  currentLeverage: number | null;
  equityUsd: number;
  availableUsd: number | null;
  /** Signed contracts held now. */
  position: number;
  environment: 'TESTNET' | 'LIVE';
}

export interface TicketPreviewDto {
  ok: boolean;
  /** Blocking problems; the order can't be sent until they're fixed. */
  errors: string[];
  /** Worth knowing, not blocking. */
  warnings: string[];
  symbol: string;
  side: 'BUY' | 'SELL';
  type: (typeof ticketTypes)[number];
  /** Whole contracts after rounding to the venue's step. */
  qty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  tif: 'GTC' | 'IOC' | null;
  postOnly: boolean;
  reduceOnly: boolean;
  takeProfit: number | null;
  stopLoss: number | null;
  leverage: number | null;
  currentLeverage: number | null;
  /** The price the estimates use: limit, stop, or mark. */
  refPrice: number | null;
  notionalUsd: number | null;
  marginUsd: number | null;
  /** Loss at the stop-loss, when one is set. */
  riskUsd: number | null;
  availableUsd: number | null;
  environment: 'TESTNET' | 'LIVE';
}

export type TicketOutcome = 'filled' | 'partial' | 'resting' | 'unconfirmed' | 'rejected';
export interface PlaceTicketResultDto {
  outcome: TicketOutcome;
  message: string;
  order: DeskOrderDto | null;
  /** Take-profit and stop-loss orders placed after a market entry filled. */
  protective: Array<{ kind: 'TP' | 'SL'; ok: boolean; message: string; order: DeskOrderDto | null }>;
}

/** Cancel one order that is still waiting on the exchange. */
export const cancelOrderSchema = z.object({
  connectionId: z.string().min(1).max(64),
  symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  exchangeOrderId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// ── Position protection: edit take-profit / stop-loss on an open position (D5) ──

export const protectionQuerySchema = z.object({ connectionId: z.string().min(1).max(64), symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()) });

export const setProtectionSchema = z.object({
  connectionId: z.string().min(1).max(64),
  symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  /** New trigger price; null removes it; omitted leaves it as it is. */
  takeProfit: z.number().positive().nullable().optional(),
  stopLoss: z.number().positive().nullable().optional(),
  /** Trailing stop-loss distance in price units (D6); replaces any stop-loss. */
  stopLossTrail: z.number().positive().optional(),
})
  .refine((b) => b.takeProfit !== undefined || b.stopLoss !== undefined || b.stopLossTrail !== undefined, { message: 'Nothing to change' })
  .refine((b) => !(b.stopLossTrail !== undefined && b.stopLoss != null), { message: 'Choose a fixed stop-loss or a trailing one, not both', path: ['stopLossTrail'] });
export type SetProtectionInput = z.infer<typeof setProtectionSchema>;

export interface ProtectionOrderDto {
  exchangeOrderId: string;
  /** Trigger now; for a trailing stop it moves with the price. */
  price: number;
  /** Trailing distance, for a trailing stop; null otherwise. */
  trail: number | null;
  qty: number;
  /** Placed through TRADElogs (vs. directly on the exchange). */
  ours: boolean;
}

export interface ProtectionDto {
  symbol: string;
  /** Signed contracts. */
  position: number;
  avgEntry: number | null;
  markPrice: number | null;
  tickSize: number;
  takeProfit: ProtectionOrderDto[];
  stopLoss: ProtectionOrderDto[];
}

export interface SetProtectionResultDto {
  protection: ProtectionDto;
  changes: Array<{ kind: 'TP' | 'SL'; action: 'placed' | 'removed' | 'replaced' | 'kept'; ok: boolean; message: string }>;
}

// ── TradingView webhooks (D14, D15) ─────────────────────────────────────────

export const webhookSetupSchema = z.object({
  connectionId: z.string().min(1).max(64),
  /** Required to point the webhook at a real-money account. */
  liveConfirmed: z.boolean().optional(),
});
export type WebhookSetupInput = z.infer<typeof webhookSetupSchema>;

export const webhookUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  connectionId: z.string().min(1).max(64).optional(),
  liveConfirmed: z.boolean().optional(),
}).refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Nothing to change' });
export type WebhookUpdateInput = z.infer<typeof webhookUpdateSchema>;

/**
 * The alert message TradingView sends. Field names are short and snake_case so
 * they're easy to type in TradingView's alert box. Numbers may arrive as
 * strings (TradingView placeholders like {{close}} are text), so they're coerced.
 */
const num = z.coerce.number();
export const tvAlertSchema = z.object({
  secret: z.string().min(1).max(200),
  action: z.enum(['buy', 'sell', 'close']),
  symbol: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase().replace(/^[A-Z]+:/, '').replace(/\.P$/, '')),
  qty: num.positive().max(1e9).optional(),
  size_usd: num.positive().max(1e9).optional(),
  risk_pct: num.positive().max(10).optional(),
  type: z.enum(['market', 'limit']).default('market'),
  price: num.positive().optional(),
  tp: num.positive().optional(),
  sl: num.positive().optional(),
  reduce_only: z.boolean().optional(),
  leverage: z.coerce.number().int().min(1).max(200).optional(),
  /** Unique per alert, e.g. "{{strategy.order.id}}-{{timenow}}"; repeats are ignored. */
  id: z.string().trim().min(1).max(100).optional(),
}).refine((a) => a.action === 'close' || [a.qty, a.size_usd, a.risk_pct].filter((v) => v != null).length === 1, { message: 'Give exactly one of qty, size_usd or risk_pct', path: ['qty'] })
  .refine((a) => a.type !== 'limit' || a.price != null, { message: 'A limit order needs a price', path: ['price'] });
export type TvAlert = z.infer<typeof tvAlertSchema>;

export interface WebhookDto {
  url: string;
  secretLast4: string;
  enabled: boolean;
  liveConfirmed: boolean;
  connection: { id: string; label: string; environment: 'TESTNET' | 'LIVE'; status: string };
  createdAt: string;
  rotatedAt: string;
}

/** Only returned when the secret is created or regenerated; it is never shown again. */
export interface WebhookCreatedDto extends WebhookDto {
  secret: string;
}

export interface WebhookEventDto {
  id: string;
  receivedAt: string;
  ip: string | null;
  status: 'rejected' | 'ordered' | 'failed' | 'duplicate';
  reason: string | null;
  alertId: string | null;
  payload: Record<string, unknown> | null;
  orderId: string | null;
}

// ── Exchange trade history and journal (D17, D18) ───────────────────────────

export const historyImportSchema = z.object({
  connectionId: z.string().min(1).max(64),
  /** How far back the first import reaches; later imports continue from where the last stopped. */
  days: z.number().int().min(1).max(365).optional(),
});
export type HistoryImportInput = z.infer<typeof historyImportSchema>;

export const historyQuerySchema = z.object({ connectionId: z.string().min(1).max(64) });

export interface HistoryImportResultDto {
  /** New fills stored by this import. */
  imported: number;
  /** Fills the exchange returned (new and already stored). */
  seen: number;
  from: string;
  to: string;
  message: string;
}

export interface JournalTradeDto {
  /** Stable id for this round trip; journal notes attach to it. */
  key: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  avgEntry: number;
  avgExit: number;
  /** Price P&L in USD, before fees and funding. */
  pnlUsd: number;
  openedAt: string;
  closedAt: string;
  note: { id: string; body: string; emotion: string | null; tags: string[] } | null;
}

export interface ExchangeJournalDto {
  connection: { id: string; label: string; environment: 'TESTNET' | 'LIVE' };
  trades: JournalTradeDto[];
  /** Equity at the first sample we have, for the curve; null when unknown. */
  startingEquityUsd: number | null;
  fillCount: number;
  firstFillAt: string | null;
  historySyncedAt: string | null;
}
