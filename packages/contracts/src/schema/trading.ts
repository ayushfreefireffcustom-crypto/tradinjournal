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
export const deskOrdersQuerySchema = z.object({
  status: z.enum(deskOrderStatuses).default('all'),
  source: z.enum(['MANUAL', 'COPY', 'STRATEGY', 'WEBHOOK']).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type DeskOrdersQuery = z.infer<typeof deskOrdersQuerySchema>;

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
