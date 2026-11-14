// Trade review: loads the account's positions (rebuilt from stored MT5 deals),
// the position's stored R-multiple if any, and the deposits, then runs the pure
// compute in trade-review.ts. Cached per account + data version + position for
// 60s (an open position's numbers only change when new deals are stored).
import { prisma } from '@tradinjournal/db';
import type { TradeReviewDTO, TradeReviewQuery } from '@tradinjournal/contracts';
import { AppError } from '../../http/errors.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { computeTradeReview } from './trade-review.js';

const TTL_S = 60;

/** Stored R of the position (Trade table row with the same symbol and open second). */
async function storedR(accountId: string, symbol: string, openIso: string): Promise<number | null> {
  const open = new Date(openIso);
  const row = await prisma.trade.findFirst({
    where: { brokerAccountId: accountId, symbol, openTime: { gte: new Date(Math.floor(open.getTime() / 1000) * 1000), lt: new Date(Math.floor(open.getTime() / 1000) * 1000 + 1000) } },
    select: { rMultiple: true },
  });
  const v = row?.rMultiple == null ? null : Number(row.rMultiple);
  return v != null && Number.isFinite(v) ? v : null;
}

export async function tradeReview(userId: string, q: TradeReviewQuery, now = Date.now()): Promise<TradeReviewDTO> {
  // Ownership is checked inside loadAccountData; the cache key is only used after it.
  const data = await loadAccountData(userId, q.accountId);
  const key = `insights:review:v1:${data.account.id}:${data.account.dataVersion}:${q.positionId}`;
  const hit = await cacheGet<TradeReviewDTO>(key);
  if (hit) return hit;
  const positions = data.trades();
  const target = positions.find(t => t.positionId === q.positionId);
  if (!target) throw new AppError(404, 'TRADE_NOT_FOUND', `Position #${q.positionId} isn't on this account`);
  const cash = data.deals.filter(d => d.type === 'BALANCE').map(d => ({ t: new Date(d.dealTime).getTime(), amount: parseFloat(d.profit) || 0 }));
  const out = computeTradeReview({
    now, positions, positionId: q.positionId, cash,
    storedR: target.status === 'CLOSED' ? await storedR(data.account.id, target.symbol, target.openTime).catch(() => null) : null,
  });
  if (!out) throw new AppError(404, 'TRADE_NOT_FOUND', `Position #${q.positionId} isn't on this account`);
  await cacheSet(key, out, TTL_S);
  return out;
}
