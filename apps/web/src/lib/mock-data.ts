// Centralised mock data + helpers used by Next.js /api routes.
// Stable seed → deterministic output so the UI always looks identical between reloads.

export interface BrokerAccount {
  id: string;
  broker: string;
  mt5Login: string;
  server: string;
  baseCurrency: string;
  marginMode: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface Deal {
  dealTicket: string;
  orderTicket: string;
  positionId: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'BALANCE';
  entry: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
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
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
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
  tags?: string[];
  emotion?: string;
}

export interface EquityPoint { time: string; equity: number; }
export interface SymbolStat { symbol: string; trades: number; wins: number; losses: number; winRate: number; netPnl: number; avgPnl: number; }
export interface DayStat { day: string; trades: number; netPnl: number; }

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

// Seeded RNG (mulberry32)
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_ACCOUNTS: BrokerAccount[] = [
  {
    id: 'acc-xm-345636702',
    broker: 'XM Global',
    mt5Login: '345636702',
    server: 'XMGlobal-MT5 10',
    baseCurrency: 'USD',
    marginMode: 'Hedging',
    status: 'CONNECTED',
    lastSyncAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    createdAt: '2025-09-12T08:14:00.000Z',
  },
  {
    id: 'acc-icmarkets-441288',
    broker: 'IC Markets',
    mt5Login: '441288',
    server: 'ICMarketsSC-MT5',
    baseCurrency: 'USD',
    marginMode: 'Hedging',
    status: 'CONNECTED',
    lastSyncAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    createdAt: '2025-10-02T11:00:00.000Z',
  },
];

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NAS100', 'US30', 'BTCUSD'];
const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const TAG_POOL = ['Breakout', 'Trend Follow', 'News Fade', 'Liquidity Grab', 'Range', 'Pullback', 'Reversal'];

function buildTrades(seed: number, count: number, opts: { winBias?: number; startingBalance: number }): { trades: Trade[]; deals: Deal[] } {
  const r = rng(seed);
  const trades: Trade[] = [];
  const deals: Deal[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const symbol = SYMBOLS[Math.floor(r() * SYMBOLS.length)]!;
    const direction = r() > 0.5 ? 'LONG' : 'SHORT';
    const openTime = new Date(now - (count - i) * 1000 * 60 * 60 * (3 + r() * 8));
    const durationSecs = Math.floor(60 * (5 + r() * 600));
    const closeTime = new Date(openTime.getTime() + durationSecs * 1000);
    const volume = parseFloat((0.1 + r() * 1.5).toFixed(2));
    const isWin = r() < (opts.winBias ?? 0.6);
    const magnitude = (symbol === 'XAUUSD' || symbol.includes('100') || symbol.includes('30') || symbol.includes('BTC'))
      ? 80 + r() * 700
      : 12 + r() * 180;
    const grossPnl = parseFloat(((isWin ? 1 : -1) * magnitude * (0.6 + r() * 0.8)).toFixed(2));
    const commission = parseFloat((-volume * 7).toFixed(2));
    const swap = parseFloat(((r() - 0.5) * 2).toFixed(2));
    const netPnl = parseFloat((grossPnl + commission + swap).toFixed(2));
    const entryPrice = parseFloat((symbol === 'XAUUSD' ? (2300 + r() * 200)
      : symbol === 'EURUSD' ? (1.05 + r() * 0.15)
      : symbol === 'GBPUSD' ? (1.21 + r() * 0.1)
      : symbol === 'USDJPY' ? (140 + r() * 20)
      : symbol === 'NAS100' ? (16000 + r() * 4000)
      : symbol === 'US30' ? (38000 + r() * 4000)
      : (60000 + r() * 30000)).toFixed(5));
    const priceDelta = (isWin ? 1 : -1) * (direction === 'LONG' ? 1 : -1) * (entryPrice * 0.005 * (0.5 + r()));
    const exitPrice = parseFloat((entryPrice + priceDelta).toFixed(5));
    const positionId = String(8000000 + i);
    const tags = [TAG_POOL[Math.floor(r() * TAG_POOL.length)]!];
    const emotion = EMOTIONS[Math.floor(r() * EMOTIONS.length)];

    trades.push({
      positionId, symbol, direction, status: 'CLOSED',
      openTime: openTime.toISOString(), closeTime: closeTime.toISOString(),
      entryPrice, exitPrice, volume,
      grossPnl, commission, swap, netPnl, durationSecs,
      deals: [], tags, emotion,
    });

    const dealOpen: Deal = {
      dealTicket: String(20000000 + i * 2),
      orderTicket: String(30000000 + i * 2),
      positionId,
      symbol,
      type: direction === 'LONG' ? 'BUY' : 'SELL',
      entry: 'IN',
      volume: volume.toFixed(2),
      price: entryPrice.toFixed(5),
      profit: '0.00',
      commission: commission.toFixed(2),
      swap: '0.00',
      fee: '0.00',
      dealTime: openTime.toISOString(),
      comment: '',
    };
    const dealClose: Deal = {
      dealTicket: String(20000000 + i * 2 + 1),
      orderTicket: String(30000000 + i * 2 + 1),
      positionId,
      symbol,
      type: direction === 'LONG' ? 'SELL' : 'BUY',
      entry: 'OUT',
      volume: volume.toFixed(2),
      price: exitPrice.toFixed(5),
      profit: grossPnl.toFixed(2),
      commission: '0.00',
      swap: swap.toFixed(2),
      fee: '0.00',
      dealTime: closeTime.toISOString(),
      comment: '',
    };
    deals.push(dealOpen, dealClose);
  }
  return { trades, deals };
}

export function statsFor(accountId: string): { account: BrokerAccount; trades: Trade[]; deals: Deal[]; stats: AccountStats } {
  const account = MOCK_ACCOUNTS.find(a => a.id === accountId) ?? MOCK_ACCOUNTS[0]!;
  const seed = accountId === MOCK_ACCOUNTS[1]?.id ? 421 : 137;
  const count = accountId === MOCK_ACCOUNTS[1]?.id ? 42 : 78;
  const startingBalance = accountId === MOCK_ACCOUNTS[1]?.id ? 10000 : 25000;
  const winBias = accountId === MOCK_ACCOUNTS[1]?.id ? 0.55 : 0.64;
  const { trades, deals } = buildTrades(seed, count, { winBias, startingBalance });

  // sort newest first
  trades.sort((a, b) => +new Date(b.openTime) - +new Date(a.openTime));

  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = grossProfit - grossLoss;

  // Equity curve from oldest → newest
  const ordered = [...trades].sort((a, b) => +new Date(a.closeTime!) - +new Date(b.closeTime!));
  let eq = startingBalance;
  let peak = startingBalance;
  let maxDD = 0;
  const equityCurve: EquityPoint[] = [{ time: ordered[0]?.openTime ?? new Date().toISOString(), equity: startingBalance }];
  for (const t of ordered) {
    eq += t.netPnl;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak - eq) / peak);
    equityCurve.push({ time: t.closeTime!, equity: parseFloat(eq.toFixed(2)) });
  }

  const symbolMap: Record<string, SymbolStat> = {};
  for (const t of trades) {
    const s = symbolMap[t.symbol] ?? { symbol: t.symbol, trades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, avgPnl: 0 };
    s.trades += 1;
    if (t.netPnl > 0) s.wins += 1; else s.losses += 1;
    s.netPnl += t.netPnl;
    symbolMap[t.symbol] = s;
  }
  const bySymbol = Object.values(symbolMap).map(s => ({
    ...s,
    winRate: s.trades ? s.wins / s.trades : 0,
    avgPnl: s.trades ? s.netPnl / s.trades : 0,
    netPnl: parseFloat(s.netPnl.toFixed(2)),
  })).sort((a, b) => b.netPnl - a.netPnl);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayMap: Record<string, DayStat> = {};
  for (const d of days) dayMap[d] = { day: d, trades: 0, netPnl: 0 };
  for (const t of trades) {
    const d = new Date(t.openTime).toLocaleDateString('en-US', { weekday: 'short' });
    if (dayMap[d]) {
      dayMap[d].trades += 1;
      dayMap[d].netPnl += t.netPnl;
    }
  }
  const byDay = days.map(d => ({ ...dayMap[d]!, netPnl: parseFloat(dayMap[d]!.netPnl.toFixed(2)) }));

  const avgDur = trades.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / (trades.length || 1);

  const stats: AccountStats = {
    netPnl: parseFloat(netPnl.toFixed(2)),
    totalTrades: trades.length,
    openTrades: 0,
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 999,
    avgWin: wins.length ? parseFloat((grossProfit / wins.length).toFixed(2)) : 0,
    avgLoss: losses.length ? parseFloat((-grossLoss / losses.length).toFixed(2)) : 0,
    bestTrade: trades.length ? parseFloat(Math.max(...trades.map(t => t.netPnl)).toFixed(2)) : 0,
    worstTrade: trades.length ? parseFloat(Math.min(...trades.map(t => t.netPnl)).toFixed(2)) : 0,
    maxDrawdownPct: parseFloat(maxDD.toFixed(4)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    avgDurationSecs: parseFloat(avgDur.toFixed(0)),
    startingBalance,
    currentEquity: parseFloat(eq.toFixed(2)),
    equityCurve,
    bySymbol,
    byDay,
  };

  return { account, trades, deals, stats };
}

export function ok<T>(data: T) {
  return Response.json({ data });
}
