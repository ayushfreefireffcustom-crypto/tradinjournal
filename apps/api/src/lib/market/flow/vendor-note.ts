// Last-success stamps for paid lanes. Debounced so an analyze doesn't write
// SystemSetting on every request.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../cache.js';

const STALE_KEEP_SEC = 6 * 3600;
const noteAt = new Map<string, number>();

export interface CachedSnap<T> {
  value: T;
  asOf: string;
}

export async function readSnap<T>(key: string, ttlSec: number): Promise<{ snap: T; asOf: string; stale: boolean } | null> {
  const row = await cacheGet<CachedSnap<T>>(key);
  if (!row?.asOf) return null;
  const age = Date.now() - new Date(row.asOf).getTime();
  return { snap: row.value, asOf: row.asOf, stale: age > ttlSec * 1000 };
}

export async function writeSnap<T>(key: string, value: T): Promise<string> {
  const asOf = new Date().toISOString();
  await cacheSet(key, { value, asOf } satisfies CachedSnap<T>, STALE_KEEP_SEC);
  return asOf;
}

export async function noteVendor(id: string, ok: boolean): Promise<void> {
  const now = Date.now();
  const prev = noteAt.get(id) ?? 0;
  if (ok && now - prev < 60_000) return;
  noteAt.set(id, now);
  const value = { at: new Date(now).toISOString(), ok };
  try {
    await prisma.systemSetting.upsert({
      where: { key: `trader_vendor_${id}` },
      create: {
        key: `trader_vendor_${id}`,
        value,
        updatedBy: 'trader-vendor',
      },
      update: { value, updatedBy: 'trader-vendor' },
    });
  } catch (err) {
    logger.warn(`[trader/vendor] note ${id}: ${(err as Error).message}`);
  }
}

export async function readVendorNotes(
  ids: string[],
): Promise<Array<{ id: string; at: string | null; ok: boolean | null }>> {
  const keys = ids.map((id) => `trader_vendor_${id}`);
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  return ids.map((id) => {
    const row = rows.find((r) => r.key === `trader_vendor_${id}`);
    const value = row?.value as { at?: string; ok?: boolean } | null;
    return { id, at: value?.at ?? null, ok: typeof value?.ok === 'boolean' ? value.ok : null };
  });
}
