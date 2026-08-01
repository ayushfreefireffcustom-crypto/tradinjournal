// Price alerts: CRUD + the dispatch loop. Mirrors the reminder dispatcher
// (dispatch.service.ts) — find due → deliver in-app + push → idempotent ledger.
// Delivery policy is inherited: real-time = in-app + push only; email folds into
// the daily digest. Prices come from the market layer's cached path, fetched
// once per distinct (symbol, account) group (fetch-once-serve-many).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { CreateAlertInput, UpdateAlertInput } from '@tradinjournal/contracts';
import { getLatestPrice } from '../market/market.service.js';
import { claimDelivery } from '../../lib/notifications/claim.js';
import { sendPush } from '../../lib/push.js';

// Read degrades gracefully if the table is missing (migration lagging a deploy)
// so the chart page's alerts panel shows empty instead of 500ing.
export async function listAlerts(userId: string) {
  try {
    return await prisma.priceAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  } catch (err) {
    logger.warn(`Alerts read failed (migration applied?): ${(err as Error).message}`);
    return [];
  }
}

export async function createAlert(userId: string, input: CreateAlertInput) {
  // Seed lastPrice from the price the client already holds — the alert is armed
  // against the side it's created on (fires on a real cross, not instantly if
  // already past). We deliberately DON'T fetch the price server-side here: that
  // blocked the create response on a slow provider call. If no seed is given,
  // the next dispatch tick arms it (cross detection ignores a null lastPrice).
  return prisma.priceAlert.create({
    data: {
      userId,
      symbol: input.symbol,
      accountId: input.accountId ?? null,
      direction: input.direction,
      threshold: input.threshold,
      lastPrice: input.seedPrice ?? null,
      recurring: input.recurring ?? false,
      note: input.note ?? null,
    },
  });
}

export async function updateAlert(userId: string, id: string, input: UpdateAlertInput) {
  const res = await prisma.priceAlert.updateMany({ where: { id, userId }, data: { ...input } });
  return res.count === 0 ? null : prisma.priceAlert.findFirst({ where: { id, userId } });
}

export async function deleteAlert(userId: string, id: string): Promise<{ ok: boolean }> {
  const res = await prisma.priceAlert.deleteMany({ where: { id, userId } });
  return { ok: res.count > 0 };
}

/**
 * Check every active alert against the current price and fire on a threshold
 * cross. One price fetch per distinct (symbol, account) group. Idempotent via
 * the delivery ledger; one-shot alerts go `triggered`, recurring ones re-arm
 * (fireSeq++ for a fresh dedup slot).
 */
export async function dispatchPriceAlerts(): Promise<{ checked: number; fired: number }> {
  const alerts = await prisma.priceAlert.findMany({ where: { status: 'active' } });
  if (alerts.length === 0) return { checked: 0, fired: 0 };

  // Group by (symbol, account) — accounts are user-scoped, so the group's userId
  // is well-defined and drives the (broker) price lookup.
  const groups = new Map<string, { symbol: string; accountId: string | null; userId: string; alerts: typeof alerts }>();
  for (const a of alerts) {
    const key = `${a.symbol}::${a.accountId ?? ''}`;
    const g = groups.get(key) ?? groups.set(key, { symbol: a.symbol, accountId: a.accountId, userId: a.userId, alerts: [] }).get(key)!;
    g.alerts.push(a);
  }

  // One price fetch per group.
  const prices = new Map<string, number | null>();
  await Promise.all(
    [...groups.entries()].map(async ([key, g]) => {
      prices.set(key, await getLatestPrice(g.symbol, g.accountId ?? undefined, g.userId));
    }),
  );

  // Prefs + push subs for the users who have active alerts.
  const userIds = [...new Set(alerts.map(a => a.userId))];
  const [prefRows, pushSubs] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } }),
    prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } }),
  ]);
  const prefsByUser = new Map(prefRows.map(p => [p.userId, p]));
  const subsByUser = new Map<string, typeof pushSubs>();
  for (const s of pushSubs) (subsByUser.get(s.userId) ?? subsByUser.set(s.userId, []).get(s.userId)!).push(s);

  let checked = 0;
  let fired = 0;

  for (const [key, g] of groups) {
    const price = prices.get(key);
    if (price == null) continue; // no data / stale feed — skip this group this tick

    for (const alert of g.alerts) {
      checked += 1;
      const threshold = Number(alert.threshold);
      const last = alert.lastPrice != null ? Number(alert.lastPrice) : null;

      // Fire only on a transition (needs a known prior price on the near side).
      const fire =
        last != null &&
        (alert.direction === 'above' ? last < threshold && price >= threshold : last > threshold && price <= threshold);

      if (!fire) {
        // Persist lastPrice only when it changed which side of the threshold it's
        // on (or when seeding a null) — avoids a write per alert per tick.
        const sideChanged = last == null || last < threshold !== price < threshold;
        if (sideChanged) await prisma.priceAlert.update({ where: { id: alert.id }, data: { lastPrice: price } });
        continue;
      }

      const prefs = prefsByUser.get(alert.userId);
      const priceAlertsOn = prefs?.priceAlerts ?? true;
      const inApp = prefs?.inApp ?? true;
      const push = prefs?.push ?? false;

      const word = alert.direction === 'above' ? 'above' : 'below';
      const title = `${alert.symbol} ${word} ${threshold}`;
      const body = `Price is ${price} — crossed ${word} ${threshold}`;
      const href = `/charts?symbol=${encodeURIComponent(alert.symbol)}`;
      const dedupKey = `pricealert:${alert.id}:${alert.fireSeq}`;

      if (priceAlertsOn && inApp && (await claimDelivery(alert.userId, dedupKey, 'in_app'))) {
        await prisma.notification.create({ data: { userId: alert.userId, kind: 'price_alert', title, body, href } });
        fired += 1;
      }
      if (priceAlertsOn && push) {
        const subs = subsByUser.get(alert.userId) ?? [];
        if (subs.length && (await claimDelivery(alert.userId, dedupKey, 'push'))) {
          for (const sub of subs) {
            const res = await sendPush(sub, { title, body, url: href });
            if (res === 'gone') await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
          }
        }
      }

      // Re-arm (recurring) or complete (one-shot).
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: alert.recurring
          ? { lastPrice: price, fireSeq: { increment: 1 } }
          : { lastPrice: price, status: 'triggered', triggeredAt: new Date() },
      });
    }
  }

  return { checked, fired };
}
