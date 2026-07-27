// Aggregate account statistics: the computed summary the API serves and the web
// dashboard renders. Kept in one shape so server and client never drift.

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

export interface DirectionStat {
  trades: number;
  wins: number;
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
  byDirection: { long: DirectionStat; short: DirectionStat };
  maxWinStreak: number;
  maxLossStreak: number;
}
