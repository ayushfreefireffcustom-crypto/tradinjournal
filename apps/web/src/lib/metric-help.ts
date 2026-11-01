// What each performance number means and why it matters (QW.8). Shown by the
// ⓘ next to a metric on the dashboard and analytics, so the two pages explain a
// number the same way. Plain sentences; no promises about results.
export interface MetricHelp { label: string; what: string; why: string }

export const METRIC_HELP = {
  netPnl: { label: 'Net P&L', what: 'Everything your closed trades made or lost, after commission and swap.', why: 'The bottom line. Read it with the trade count: one big trade can carry a whole month.' },
  winRate: { label: 'Win rate', what: 'The share of closed trades that made money.', why: 'On its own it says little: a 35% win rate is fine if winners are much bigger than losers. Read it with average win and loss.' },
  profitFactor: { label: 'Profit factor', what: 'Gross profit divided by gross loss.', why: 'Above 1 means the winners paid for the losers. Around 1.5 or more is a solid edge; below 1 the strategy is losing money.' },
  avgWinLoss: { label: 'Avg win / loss', what: 'Your average winning trade compared with your average losing trade, as reward to risk.', why: 'With a low win rate you need a high ratio, and the other way round. A ratio under 1 means you cut winners early or let losers run.' },
  expectancy: { label: 'Expectancy', what: 'What an average trade made: net P&L divided by the number of trades.', why: 'Positive means the way you trade has made money per trade so far. It only means something over enough trades (say 30+).' },
  maxDrawdown: { label: 'Max drawdown', what: 'The biggest fall from a high point of your account curve to a later low.', why: 'It is the pain you had to sit through. Size positions so a drawdown like this would not knock you out.' },
  avgGreenDay: { label: 'Avg green day', what: 'The average P&L of days that ended in profit.', why: 'Compare it with your average red day: if red days are bigger, one bad day undoes several good ones.' },
  avgRedDay: { label: 'Avg red day', what: 'The average P&L of days that ended in a loss.', why: 'A daily loss limit near this number keeps a bad day from becoming a bad week.' },
  bestStreak: { label: 'Best green streak', what: 'The most trading days in a row that ended in profit.', why: 'Streaks are mostly luck; the useful question is whether you size up after them (many traders give it back).' },
  tradesPerDay: { label: 'Trades per day', what: 'Closed trades divided by the days you traded.', why: 'A sudden jump often means overtrading or revenge trades. Check your worst days against this number.' },
  sharpe: { label: 'Sharpe ratio', what: 'Average daily return divided by how much daily returns swing, scaled to a year.', why: 'Higher means steadier gains for the risk taken. Above 1 is good; it needs a few months of data to mean much.' },
  sortino: { label: 'Sortino ratio', what: 'Like Sharpe, but it only counts the swings on losing days.', why: 'It does not punish big up days, so it is fairer to strategies with occasional large wins.' },
  avgHold: { label: 'Average hold', what: 'How long a trade stays open, from first entry to final exit.', why: 'If losers stay open much longer than winners, you are hoping instead of cutting.' },
  largestWin: { label: 'Largest win', what: 'Your single most profitable closed trade.', why: 'If it is a big part of your total P&L, your results lean on one trade.' },
  grossProfit: { label: 'Gross profit', what: 'The sum of every winning trade, before the losers are taken off.', why: 'Set against gross loss it gives the profit factor; on its own it flatters a strategy.' },
  grossLoss: { label: 'Gross loss', what: 'The sum of every losing trade.', why: 'If it grows faster than gross profit, losers are getting bigger or more frequent.' },
  stdDev: { label: 'Std dev', what: 'How far a typical trade’s result is from the average trade.', why: 'High spread means results swing a lot from trade to trade; size positions with that in mind.' },
  cagr: { label: 'CAGR', what: 'The yearly growth rate that would turn your starting balance into today’s, compounded.', why: 'It lets you compare periods of different lengths. It is only shown after 90 days, since a few good weeks annualise into silly numbers.' },
  recoveryFactor: { label: 'Recovery factor', what: 'Net profit divided by the biggest fall from a high point, in money.', why: 'Above 2 means you made well over what you had to sit through. Below 1, the worst stretch cost more than you have made.' },
  median: { label: 'Median trade', what: 'The middle trade when every result is lined up from worst to best.', why: 'If it sits well below the average trade, a few big winners carry your results.' },
  withinSd: { label: 'Within 1 std dev', what: 'The share of trades whose result is within one standard deviation of the average.', why: 'Around two thirds is normal. Much less means fat tails: rare big wins or losses decide the month.' },
  largestLoss: { label: 'Largest loss', what: 'Your single worst closed trade.', why: 'It should be close to your planned risk per trade. Much bigger means a stop was moved or missing.' },
} satisfies Record<string, MetricHelp>;

export type MetricKey = keyof typeof METRIC_HELP;
