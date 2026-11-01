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
