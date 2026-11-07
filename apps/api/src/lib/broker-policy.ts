// Elefin only: while the platform gate is on (PLATFORM_ACCESS_ENABLED), clients may
// only connect and use MT5 accounts on an Elefin server. Accounts at other brokers
// stay in the database (nothing is deleted) but are hidden, not synced and refused
// everywhere until the gate is switched off. Admins (ADMIN_EMAILS) and people an
// admin let in by email (an active access grant) can still use any broker.
import { env } from '@tradinjournal/config';
import { prisma } from '@tradinjournal/db';
import { AppError } from '../http/errors.js';
import { isAdmin } from './admin.js';

/**
 * An Elefin account is one on an Elefin MT5 server ("Elefin-Trade", …). Only the server
 * counts: it's what the bridge actually logged in to, whereas the broker name is picked
 * by the user in a dropdown and could say "Elefin" for any account.
 */
export function isElefinServer(server: string): boolean {
  return /^elefin/i.test(server.trim());
}

export class ElefinOnlyError extends AppError {
  constructor(message = 'Only Elefin MT5 accounts can be used on TRADElogs. Connect the account you opened with Elefin.') {
    super(403, 'ELEFIN_ACCOUNTS_ONLY', message);
  }
}

const CACHE_MS = 60_000;
const cache = new Map<string, { only: boolean; at: number }>();

/** Is this user limited to Elefin accounts right now? */
export async function elefinOnlyFor(userId: string): Promise<boolean> {
  if (!env.PLATFORM_ACCESS_ENABLED) return false;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.only;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  let only = true;
  if (user && isAdmin(user.email)) only = false;
  else if (user && await prisma.accessGrant.findFirst({ where: { email: user.email.trim().toLowerCase(), revokedAt: null }, select: { id: true } })) only = false;
  cache.set(userId, { only, at: Date.now() });
  return only;
}

/** Test hook, and for when an admin grants or revokes access. */
export function clearBrokerPolicyCache(userId?: string): void {
  if (userId) cache.delete(userId); else cache.clear();
}

/** May this user use this account? */
export async function accountUsable(userId: string, account: { server: string }): Promise<boolean> {
  return isElefinServer(account.server) || !(await elefinOnlyFor(userId));
}

/** Throws when the account is at another broker and the user is limited to Elefin. */
export async function assertAccountUsable(userId: string, account: { server: string }): Promise<void> {
  if (!(await accountUsable(userId, account))) throw new ElefinOnlyError('This account isn’t at Elefin. Only Elefin MT5 accounts can be used on TRADElogs.');
}

/** Splits a user's accounts into the ones they may use and the ones that are locked. */
export async function splitUsable<T extends { server: string }>(userId: string, accounts: T[]): Promise<{ usable: T[]; locked: T[] }> {
  if (!(await elefinOnlyFor(userId))) return { usable: accounts, locked: [] };
  return { usable: accounts.filter(a => isElefinServer(a.server)), locked: accounts.filter(a => !isElefinServer(a.server)) };
}

/**
 * Prisma filter for background work (scheduled sync): Elefin accounts, plus any
 * account owned by an admin or a granted user. Undefined when the gate is off.
 */
export async function usableAccountsWhere(): Promise<object | undefined> {
  if (!env.PLATFORM_ACCESS_ENABLED) return undefined;
  const grants = await prisma.accessGrant.findMany({ where: { revokedAt: null }, select: { email: true } });
  const exempt = [...new Set([...env.ADMIN_EMAILS_LIST, ...grants.map(g => g.email.trim().toLowerCase())])];
  return {
    OR: [
      { server: { startsWith: 'elefin', mode: 'insensitive' } },
      ...(exempt.length ? [{ user: { email: { in: exempt, mode: 'insensitive' } } }] : []),
    ],
  };
}
