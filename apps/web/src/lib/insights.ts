// Honest, derived "data-storytelling" observations. Every insight is computed
// directly from the trader's own closed trades / stats / journal — no invented
// numbers, no advice, just surfacing what the data already says.
import type { AccountStats, Trade, JournalEntry } from './api';

export type Tone = 'profit' | 'loss' | 'warning' | 'neutral';
export type InsightIcon = 'calendar' | 'direction' | 'clock' | 'coin' | 'target' | 'warning' | 'trophy' | 'session';

export interface Insight {
  id: string;
  tone: Tone;
  icon: InsightIcon;
  text: string;
}

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];
const money = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const dur = (s: number) => (s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)}d`);

export function buildInsights(stats: AccountStats, trades: Trade[], journal: JournalEntry[]): Insight[] {
  const out: Insight[] = [];
  const closed = trades.filter(t => t.status === 'CLOSED' && t.closeTime);
  if (closed.length < 3) return out;

  // Best / worst weekday by net P&L
  if (stats.byDay.length >= 2) {
    const best = [...stats.byDay].sort((a, b) => b.netPnl - a.netPnl)[0]!;
    const worst = [...stats.byDay].sort((a, b) => a.netPnl - b.netPnl)[0]!;
    if (best.netPnl > 0) out.push({ id: 'best-day', tone: 'profit', icon: 'calendar', text: `${best.day} is your strongest day at ${money(best.netPnl)} across ${best.trades} trades.` });
    if (worst.netPnl < 0 && worst.day !== best.day) out.push({ id: 'worst-day', tone: 'loss', icon: 'calendar', text: `${worst.day} bleeds the most — ${money(worst.netPnl)}. Consider sizing down.` });
  }

  // Long vs short edge
  const { long, short } = stats.byDirection;
  if (long.trades > 0 && short.trades > 0) {
    const diff = long.netPnl - short.netPnl;
    if (Math.abs(diff) > 1) {
      const strong = diff >= 0 ? 'Longs' : 'Shorts';
      out.push({ id: 'dir-edge', tone: 'neutral', icon: 'direction', text: `${strong} carry your edge: longs ${money(long.netPnl)} vs shorts ${money(short.netPnl)}.` });
    }
  }

  // Hold-time asymmetry (winners vs losers)
  const avgHold = (arr: Trade[]) => {
    const w = arr.filter(t => t.durationSecs != null);
    return w.length ? w.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / w.length : null;
  };
  const wHold = avgHold(closed.filter(t => t.netPnl > 0));
  const lHold = avgHold(closed.filter(t => t.netPnl <= 0));
  if (wHold != null && lHold != null && wHold > 0) {
    const ratio = lHold / wHold;
    if (ratio >= 1.3) out.push({ id: 'hold-asym', tone: 'warning', icon: 'clock', text: `You hold losers ${ratio.toFixed(1)}× longer than winners (${dur(lHold)} vs ${dur(wHold)}) — cut them sooner.` });
    else if (ratio <= 0.77) out.push({ id: 'hold-asym', tone: 'profit', icon: 'clock', text: `You let winners run — held ${dur(wHold)} vs ${dur(lHold)} on losers. Keep it up.` });
  }

  // Top symbol
  if (stats.bySymbol.length > 0) {
    const top = [...stats.bySymbol].sort((a, b) => b.netPnl - a.netPnl)[0]!;
    if (top.netPnl > 0) out.push({ id: 'top-symbol', tone: 'profit', icon: 'coin', text: `${top.symbol} is your best instrument at ${money(top.netPnl)} (${(top.winRate * 100).toFixed(0)}% win).` });
  }

  // Best trading session (UTC open hour buckets)
  const sess = { Asia: 0, London: 0, NewYork: 0 };
  for (const t of closed) {
    const h = new Date(t.openTime).getUTCHours();
    if (h < 7) sess.Asia += t.netPnl;
    else if (h < 13) sess.London += t.netPnl;
    else if (h < 22) sess.NewYork += t.netPnl;
    else sess.Asia += t.netPnl;
  }
  const bestSess = (Object.entries(sess) as [string, number][]).sort((a, b) => b[1] - a[1])[0]!;
  if (bestSess[1] > 0) out.push({ id: 'session', tone: 'neutral', icon: 'session', text: `Your ${bestSess[0] === 'NewYork' ? 'New York' : bestSess[0]} session is most profitable (${money(bestSess[1])}).` });

  // Profit factor summary
  if (stats.profitFactor > 0 && stats.totalTrades >= 5) {
    const pf = stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2);
    out.push({ id: 'pf', tone: stats.profitFactor >= 1 ? 'profit' : 'loss', icon: 'target', text: `Profit factor ${pf} — you make $${stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)} for every $1 lost.` });
  }

  // Tilt flag from journal emotions tied to losing trades
  const closedById = new Map(closed.map(t => [t.positionId, t]));
  let tiltPnl = 0, tiltCount = 0;
  for (const e of journal) {
    if (!e.emotion || !e.tradeId || !NEGATIVE_EMOTIONS.includes(e.emotion)) continue;
    const t = closedById.get(e.tradeId);
    if (t) { tiltPnl += t.netPnl; tiltCount++; }
  }
  if (tiltCount >= 2 && tiltPnl < 0) {
    out.push({ id: 'tilt', tone: 'warning', icon: 'warning', text: `Trades you tagged FOMO/Revenge/Hesitant netted ${money(tiltPnl)} across ${tiltCount} — your psychology is costing you.` });
  }

  return out;
}
