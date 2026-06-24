export type MarginMode = 'NETTING' | 'HEDGING';
export type AccountStatus = 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
export type DealType = 'BUY' | 'SELL' | 'BALANCE';
export type DealEntry = 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface BrokerAccountInfo {
  id: string;
  broker: string;
  mt5Login: string;
  server: string;
  baseCurrency: string;
  marginMode: MarginMode;
  status: AccountStatus;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface VerifyResult {
  login: number;
  name: string;
  server: string;
  currency: string;
  balance: string;
  marginMode: MarginMode;
}

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
