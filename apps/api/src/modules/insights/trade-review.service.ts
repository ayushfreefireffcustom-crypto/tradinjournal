// Trade review: loads the account's positions (rebuilt from stored MT5 deals),
// the trade data (stop levels, R, stop moves) and the deposits, then runs the pure
// compute in trade-review.ts. Cached per account + data version + position for
// 60s (an open position's numbers only change when new deals are stored).
import { createHash } from 'node:crypto';
import type { TradeReviewDTO, TradeReviewQuery } from '@tradinjournal/contracts';
import { AppError } from '../../http/errors.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { computeTradeReview } from './trade-review.js';
import { rulesKey } from './rules.js';
import { rulesFor } from '../prefs/prefs.service.js';
import { loadTradeExtras, positionLevels } from '../trade-data/trade-data.service.js';

const TTL_S = 60;

export async function tradeReview(userId: string, q: TradeReviewQuery, now = Date.now()): Promise<TradeReviewDTO> {
  // Ownership is checked inside loadAccountData; the cache key is only used after it.
  const [data, rules] = await Promise.all([loadAccountData(userId, q.accountId), rulesFor(userId)]);
  const rk = rules ? `:${createHash('sha1').update(rulesKey(rules)).digest('hex').slice(0, 10)}` : '';
  const key = `insights:review:v1:${data.account.id}:${data.account.dataVersion}:${q.positionId}${rk}`;
  const hit = await cacheGet<TradeReviewDTO>(key);
  if (hit) return hit;
  const positions = data.trades();
  const target = positions.find(t => t.positionId === q.positionId);
  if (!target) throw new AppError(404, 'TRADE_NOT_FOUND', `Position #${q.positionId} isn't on this account`);
  // R from the stop at entry or a stored R-multiple, for every trade (grades match the dashboard), plus this trade's levels.
  const { extras, levels, pv } = await loadTradeExtras(data.account, positions);
  const cash = data.deals.filter(d => d.type === 'BALANCE').map(d => ({ t: new Date(d.dealTime).getTime(), amount: parseFloat(d.profit) || 0 }));
  const out = computeTradeReview({
    now, positions, positionId: q.positionId, cash,
    user: rules ? { rules, startingBalance: data.stats().startingBalance, balanceOps: cash.filter(o => o.amount).sort((a, b) => a.t - b.t) } : null,
    storedR: null, extras,
    levels: await positionLevels(data.account.id, target, levels.get(target.positionId) ?? []),
    pointValue: pv.get(target.positionId) ? { value: Math.round(pv.get(target.positionId)!.value * 1e6) / 1e6, source: pv.get(target.positionId)!.source } : null,
  });
  if (!out) throw new AppError(404, 'TRADE_NOT_FOUND', `Position #${q.positionId} isn't on this account`);
  await cacheSet(key, out, TTL_S);
  return out;
}
