// Trade + deal domain types: the serialized DTO shapes the API returns (strings
// for money/volume so precision and units survive the wire — never Decimal here).
//
// Note: `TradeSide` here is the USER-FACING direction ('LONG' | 'SHORT'). The
// reconstruction layer in @tradinjournal/core has a separate `TradeSide`
// ('BUY' | 'SELL') that mirrors the raw MT5 deal direction; the two are mapped
// in trades.service (BUY→LONG, SELL→SHORT). Same name, deliberately different
// concept — don't unify them.

export type DealType = 'BUY' | 'SELL' | 'BALANCE';
export type DealEntry = 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
export type TradeSide = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface Deal {
  dealTicket: string;
  orderTicket: string;
  positionId: string;
  symbol: string;
  type: DealType;
  entry: DealEntry;
  volume: string;
  price: string;
  profit: string;
  commission: string;
  swap: string;
  fee: string;
  dealTime: string;
  comment: string;
}

export interface Trade {
  positionId: string;
  symbol: string;
  direction: TradeSide;
  status: TradeStatus;
  openTime: string;
  closeTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  volume: number;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
  durationSecs: number | null;
  deals: Deal[];
}
