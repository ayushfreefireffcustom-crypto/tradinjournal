import { Decimal } from 'decimal.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type DealType = 'BUY' | 'SELL' | 'BALANCE';
export type DealEntry = 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type MarginMode = 'NETTING' | 'HEDGING';

// ─── Input: raw MT5 deal ──────────────────────────────────────────────────────

export interface RawDeal {
  dealTicket: bigint;
  orderTicket: bigint;
  positionId: bigint;
  symbol: string;
  type: DealType;
  entry: DealEntry;
  volume: Decimal;
  price: Decimal;
  profit: Decimal;
  commission: Decimal;
  swap: Decimal;
  fee: Decimal;
  dealTime: Date;
  magic: number;
  comment?: string;
  reason: number;
}

// ─── Output: reconstructed round-trip trade ───────────────────────────────────

export interface ReconstructedTrade {
  positionId: bigint;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;

  openTime: Date;
  closeTime: Date | null;

  volume: Decimal;      // total entry volume (max open exposure)
  avgEntry: Decimal;
  avgExit: Decimal | null;

  grossPnl: Decimal;    // sum of profit fields on exit deals
  commission: Decimal;  // sum across all deals in group
  swap: Decimal;        // sum across all deals in group
  netPnl: Decimal;      // grossPnl + commission + swap

  dealTickets: bigint[];
}

// ─── Balance event (deposit / withdrawal) ────────────────────────────────────

export interface BalanceEvent {
  ticket: bigint;
  amount: Decimal;   // positive = deposit, negative = withdrawal
  comment: string;
  eventTime: Date;
}
