// Context chips for the AI coach (H11): extra data the user chooses to hand
// the coach for one question: open exchange positions, the last 7 days of
// fills, running strategies, and copies. Built from the user's own records
// only, compact, and labelled so the model can't confuse it with the journal.
import { env } from '@tradinjournal/config';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { deskOverview } from '../trading/trading.service.js';

export const CHIPS = ['positions', 'fills7d', 'strategies', 'follows'] as const;
export type Chip = (typeof CHIPS)[number];
const LABEL: Record<Chip, string> = { positions: 'Open positions', fills7d: 'Fills, last 7 days', strategies: 'Live strategies', follows: 'Copies' };

/** The chips worth offering: only what the user actually has. */
export async function availableChips(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [conns, fills, strategies, follows] = await Promise.all([
    env.TRADING_ENABLED ? prisma.exchangeConnection.count({ where: { userId, status: 'ACTIVE' } }) : 0,
    env.TRADING_ENABLED ? prisma.exchangeFill.count({ where: { connection: { userId }, exchTs: { gte: since } } }) : 0,
    prisma.strategyDeployment.count({ where: { userId, status: { in: ['running', 'paused', 'stopping', 'errored'] } } }),
    env.TRADING_ENABLED ? prisma.copyFollow.count({ where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } } }) : 0,
  ]);
  const out: Array<{ id: Chip; label: string; count: number | null }> = [];
  // Positions are read live from the exchange when asked, so there's no count here.
  if (conns) out.push({ id: 'positions', label: LABEL.positions, count: null });
  if (fills) out.push({ id: 'fills7d', label: LABEL.fills7d, count: fills });
  if (strategies) out.push({ id: 'strategies', label: LABEL.strategies, count: strategies });
  if (follows) out.push({ id: 'follows', label: LABEL.follows, count: follows });
  return out;
}

const n = (v: unknown, d = 2) => (v == null ? 'n/a' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));

/** One system message with the chosen data, or null when there's nothing to add. */
export async function chipContext(userId: string, chips: Chip[], now = new Date()): Promise<string | null> {
  const parts: string[] = [];
  const want = new Set(chips);
  if (want.has('positions') && env.TRADING_ENABLED) {
    try {
      const d = await deskOverview(userId, now);
      parts.push(d.positions.length
        ? `Open exchange positions (${d.positions.length}):\n${d.positions.slice(0, 30).map((p) => `- ${p.connectionLabel}: ${p.side} ${n(p.size, 4)} ${p.symbol} @ ${n(p.avgEntry)} (mark ${n(p.markPrice)}, unrealised ${n(p.unrealizedPnl)} USD${p.liquidationPrice ? `, liquidation ${n(p.liquidationPrice)}` : ''}${p.copiedFrom ? `, copied from ${p.copiedFrom.leaderName}` : ''})`).join('\n')}`
        : 'Open exchange positions: none.');
      if (d.errors.length) parts.push(`Couldn't read: ${d.errors.map((e) => e.connectionLabel).join(', ')}.`);
    } catch (err) {
      logger.warn('[coach] positions chip failed', { err: (err as Error).message });
      parts.push('Open exchange positions: could not be read just now.');
    }
  }
  if (want.has('fills7d') && env.TRADING_ENABLED) {
    const fills = await prisma.exchangeFill.findMany({ where: { connection: { userId }, exchTs: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { exchTs: 'desc' }, take: 60, include: { connection: { select: { label: true } } } });
    parts.push(fills.length
      ? `Exchange fills, last 7 days (newest first, ${fills.length}${fills.length === 60 ? '+' : ''}):\n${fills.map((f) => `- ${f.exchTs.toISOString().slice(0, 16).replace('T', ' ')} ${f.connection.label}: ${f.side} ${n(f.qty, 4)} ${f.symbol} @ ${n(f.price)}${f.fee != null ? ` fee ${n(f.fee, 4)}` : ''}`).join('\n')}`
      : 'Exchange fills, last 7 days: none.');
  }
  if (want.has('strategies')) {
    const deps = await prisma.strategyDeployment.findMany({ where: { userId, status: { in: ['running', 'paused', 'stopping', 'errored'] } }, take: 20 });
    const pnl = new Map((await prisma.deploymentTrade.groupBy({ by: ['deploymentId'], where: { deploymentId: { in: deps.map((d) => d.id) } }, _sum: { pnl: true }, _count: true })).map((g) => [g.deploymentId, g]));
    parts.push(deps.length
      ? `Running strategies (${deps.length}):\n${deps.map((d) => { const g = pnl.get(d.id); const open = ((d.snapshot as { open?: unknown[] } | null)?.open ?? []).length; return `- "${d.name}" on ${d.mode}, ${d.status}, since ${d.startedAt.toISOString().slice(0, 10)}: ${g?._count ?? 0} closed trades, ${n(g?._sum.pnl ?? 0)} USD closed P&L${d.mode === 'paper' ? `, ${open} open` : ''}${d.error ? `, problem: ${d.error.slice(0, 120)}` : ''}`; }).join('\n')}`
      : 'Running strategies: none.');
  }
  if (want.has('follows') && env.TRADING_ENABLED) {
    const fs = await prisma.copyFollow.findMany({ where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } }, include: { leader: { select: { displayName: true } }, connection: { select: { label: true } } }, take: 20 });
    parts.push(fs.length
      ? `Copy trading (${fs.length}):\n${fs.map((f) => `- copying ${f.leader.displayName} on ${f.connection.label}, ${f.status.toLowerCase()}${f.pauseReason ? ` (${f.pauseReason})` : ''}, sizing ${f.sizingMode.toLowerCase().replace('_', ' ')} ${n(f.sizingValue)}${f.dailyLossLimitUsd ? `, daily loss limit ${n(f.dailyLossLimitUsd)} USD` : ''}`).join('\n')}`
      : 'Copy trading: none.');
  }
  if (!parts.length) return null;
  return `<ACCOUNT_DATA source="exchange accounts, strategies and copies, chosen by the user for this question">\n${parts.join('\n\n')}\n</ACCOUNT_DATA>\nUse this alongside the journal data when it helps answer. Don't give trade signals.`;
}
