/**
 * Prisma client singleton.
 *
 * Rule: this package is the only place that talks to the database directly.
 * Feature modules use repositories that depend on this client.
 */
import { PrismaClient } from '@prisma/client';

/**
 * Optional pool sizing without editing DATABASE_URL: DATABASE_POOL_SIZE sets
 * Prisma's connection_limit and DATABASE_POOL_TIMEOUT its pool_timeout (s). Values
 * already present in the URL win. Unset → Prisma's defaults (num_cpus * 2 + 1).
 */
export function withPoolParams(url: string | undefined, size?: string, timeout?: string): string | undefined {
  if (!url || (!size && !timeout)) return url;
  try {
    const u = new URL(url);
    if (size && /^\d+$/.test(size) && !u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', size);
    if (timeout && /^\d+$/.test(timeout) && !u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', timeout);
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = withPoolParams(process.env.DATABASE_URL, process.env.DATABASE_POOL_SIZE, process.env.DATABASE_POOL_TIMEOUT);

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient(datasourceUrl && datasourceUrl !== process.env.DATABASE_URL ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
