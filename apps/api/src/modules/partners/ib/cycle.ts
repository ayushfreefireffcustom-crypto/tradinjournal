// The scheduled pass for the IB layer: refresh sheet lists that are due, then
// recompute every client's package access so grace periods and expiries move on.
import { logger } from '@tradinjournal/logger';
import { recheckPartner, syncDueSheets } from './ib.service.js';
import { recomputeAll, recomputePartner, recomputeUser } from './access.service.js';
import { syncDueApis } from './integrations.service.js';
import { moneyCycle } from './payments.service.js';
import { prisma } from '@tradinjournal/db';

let running = false;

export async function runIbCycle(): Promise<{ sheets: number; clients: number } | null> {
  if (running) return null;
  running = true;
  try {
    const before = new Date();
    const sheets = await syncDueSheets();
    const apiPartners = await syncDueApis();
    if (sheets || apiPartners.length) {
      // List syncs re-verified their partners' clients; refresh those partners' access first.
      const touched = await prisma.partnerBroker.findMany({ where: { lastSyncAt: { gte: before } }, select: { partnerId: true }, distinct: ['partnerId'] });
      for (const t of touched) {
        await recheckPartner(t.partnerId);
        await recomputePartner(t.partnerId);
      }
    }
    // Paid periods that ended, shares past the refund window, payout drafts.
    const money = await moneyCycle();
    for (const u of money.expired) await recomputeUser(u);
    const clients = await recomputeAll();
    if (sheets || clients || money.drafts) logger.info('[partners] access cycle', { sheets, apis: apiPartners.length, clients, ...money, expired: money.expired.length });
    return { sheets, clients };
  } finally {
    running = false;
  }
}

/** Fire-and-forget hook for account connect / disconnect. Never throws. */
export function onAccountsChanged(userId: string, email: string | null): void {
  void (async () => {
    const { syncConnected } = await import('../partners.service.js');
    const { verifyUser } = await import('./ib.service.js');
    const { recomputeUser } = await import('./access.service.js');
    await syncConnected();
    await verifyUser(userId, { userEmail: email });
    await recomputeUser(userId);
  })().catch(err => logger.warn('[partners] account hook failed', { userId, err }));
}
