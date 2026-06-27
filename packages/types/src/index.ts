export type MarginMode = 'NETTING' | 'HEDGING';
export type AccountStatus = 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
export type DealType = 'BUY' | 'SELL' | 'BALANCE';
export type DealEntry = 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
export type TradeSide = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';

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

export interface EquityPoint {
  time: string;
  equity: number;
}

export interface SymbolStat {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
}

export interface DayStat {
  day: string;
  trades: number;
  netPnl: number;
}

export interface AccountStats {
  netPnl: number;
  totalTrades: number;
  openTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdownPct: number;
  grossProfit: number;
  grossLoss: number;
  avgDurationSecs: number;
  startingBalance: number;
  currentEquity: number;
  equityCurve: EquityPoint[];
  bySymbol: SymbolStat[];
  byDay: DayStat[];
}
