// "Does this client hold the package right now?" as a database filter. Checked at
// read time to the second, so an access period, a grace period or a package's end
// date takes effect when it passes, not when the next 15-minute cycle records it.
import type { Prisma } from '@tradinjournal/db';

export function heldNow(userId: string, now = new Date()): Prisma.ClientEntitlementWhereInput {
  return {
    userId,
    status: { in: ['ACTIVE', 'GRACE'] },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [{ graceUntil: null }, { graceUntil: { gt: now } }] },
      { package: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
    ],
  };
}
