// Leader election for the in-process scheduler, so N API replicas run each
// background job once instead of N times (news enrichment and model training cost
// money; reminders and syncs would duplicate work).
//
// A lease row in system_setting ("scheduler:leader") names the leader instance.
// The leader renews it every RENEW_MS; any instance may take it over once it is
// older than LEASE_MS. One atomic upsert decides — no extra infrastructure.
import { randomUUID } from 'crypto';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';

const KEY = 'scheduler:leader';
export const LEASE_MS = 90_000;
const RENEW_MS = 30_000;

export interface Elector {
  readonly instanceId: string;
  isLeader(): boolean;
  /** Try to take or renew the lease now. Returns whether this instance leads. */
  tick(): Promise<boolean>;
  start(): void;
  stop(): Promise<void>;
}

export function createElector(instanceId: string = randomUUID(), leaseMs = LEASE_MS): Elector {
  let leader = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<boolean> {
    try {
      const rows = await prisma.$queryRaw<{ key: string }[]>`
        INSERT INTO "system_setting" ("key", "value", "updatedAt", "updatedBy")
        VALUES (${KEY}, ${JSON.stringify({ instance: instanceId })}::jsonb, now(), ${instanceId})
        ON CONFLICT ("key") DO UPDATE
          SET "value" = EXCLUDED."value", "updatedAt" = now(), "updatedBy" = EXCLUDED."updatedBy"
          WHERE "system_setting"."value"->>'instance' = ${instanceId}
             OR "system_setting"."updatedAt" < now() - (${leaseMs} * interval '1 millisecond')
        RETURNING "key"`;
      const now = rows.length === 1;
      if (now !== leader) logger.info(now ? '[leader] this instance now runs the scheduler' : '[leader] lost scheduler lease');
      leader = now;
    } catch (err) {
      // Can't reach the DB: stop leading rather than risk two leaders.
      if (leader) logger.warn('[leader] lease check failed — stepping down', { err });
      leader = false;
    }
    return leader;
  }

  return {
    instanceId,
    isLeader: () => leader,
    tick,
    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), RENEW_MS);
      timer.unref?.();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (!leader) return;
      leader = false;
      // Hand over immediately instead of making the next leader wait out the lease.
      await prisma.$executeRaw`DELETE FROM "system_setting" WHERE "key" = ${KEY} AND "value"->>'instance' = ${instanceId}`.catch(() => {});
    },
  };
}
