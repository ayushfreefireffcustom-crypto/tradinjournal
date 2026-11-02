// Named watchlists (QW.12). Up to 8 per user, names unique per user ignoring
// case, and the last one can't be deleted. A user's first read copies their old
// single watchlist (the `watchlist` table, left untouched) into a list named
// "Watchlist", so nothing pinned before is lost.
import { Prisma, prisma } from '@tradinjournal/db';
import { WATCHLIST_MAX_LISTS, cleanWatchlistSymbols as cleanSymbols, type CreateWatchlistInput, type UpdateWatchlistInput } from '@tradinjournal/contracts';
import { ConflictError, NotFoundError } from '../../http/errors.js';

export interface WatchlistDto { id: string; name: string; symbols: string[] }

const DEFAULT_NAME = 'Watchlist';
const dto = (r: { id: string; name: string; symbols: string[] }): WatchlistDto => ({ id: r.id, name: r.name, symbols: r.symbols });
const isUnique = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const ordered = (userId: string, tx: Prisma.TransactionClient = prisma) =>
  tx.watchlistList.findMany({ where: { userId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });

/** Serialises writes to one user's lists, so two requests can't both pass the 8-list or last-list check. */
const lockUser = (tx: Prisma.TransactionClient, userId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`watchlist:${userId}`}))`;

function assertNameFree(lists: { id: string; name: string }[], name: string, selfId?: string) {
  const taken = lists.find((l) => l.id !== selfId && l.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new ConflictError(`You already have a watchlist called “${taken.name}”.`);
}

export async function listWatchlists(userId: string): Promise<WatchlistDto[]> {
  const lists = await ordered(userId);
  if (lists.length) return lists.map(dto);
  const legacy = await prisma.watchlist.findUnique({ where: { userId } });
  try {
    await prisma.watchlistList.create({ data: { userId, name: DEFAULT_NAME, symbols: cleanSymbols(legacy?.symbols ?? []), position: 0 } });
  } catch (err) {
    if (!isUnique(err)) throw err; // a parallel first read created it
  }
  return (await ordered(userId)).map(dto);
}

export async function createWatchlist(userId: string, input: CreateWatchlistInput): Promise<WatchlistDto> {
  await listWatchlists(userId); // the default list exists before the cap is counted
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const lists = await ordered(userId, tx);
      if (lists.length >= WATCHLIST_MAX_LISTS) throw new ConflictError(`You can have up to ${WATCHLIST_MAX_LISTS} watchlists. Delete one to add another.`);
      assertNameFree(lists, input.name);
      const position = Math.max(-1, ...lists.map((l) => l.position)) + 1;
      return dto(await tx.watchlistList.create({ data: { userId, name: input.name, symbols: cleanSymbols(input.symbols ?? []), position } }));
    });
  } catch (err) {
    if (isUnique(err)) throw new ConflictError(`You already have a watchlist called “${input.name}”.`);
    throw err;
  }
}

export async function updateWatchlist(userId: string, id: string, input: UpdateWatchlistInput): Promise<WatchlistDto> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const lists = await ordered(userId, tx);
      if (!lists.some((l) => l.id === id)) throw new NotFoundError('Watchlist not found');
      if (input.name !== undefined) assertNameFree(lists, input.name, id);
      return dto(await tx.watchlistList.update({
        where: { id },
        data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.symbols !== undefined ? { symbols: cleanSymbols(input.symbols) } : {}) },
      }));
    });
  } catch (err) {
    if (isUnique(err)) throw new ConflictError(`You already have a watchlist called “${input.name}”.`);
    throw err;
  }
}

export async function deleteWatchlist(userId: string, id: string): Promise<{ deleted: true }> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const lists = await ordered(userId, tx);
    if (!lists.some((l) => l.id === id)) throw new NotFoundError('Watchlist not found');
    if (lists.length <= 1) throw new ConflictError('Keep at least one watchlist. Rename this one or clear it instead.');
    await tx.watchlistList.delete({ where: { id } });
    return { deleted: true as const };
  });
}

/** The old single-list API reads and writes the first list, so an older web build keeps working. */
export async function firstListSymbols(userId: string): Promise<{ symbols: string[] }> {
  return { symbols: (await listWatchlists(userId))[0]?.symbols ?? [] };
}
export async function setFirstListSymbols(userId: string, symbols: string[]): Promise<{ symbols: string[] }> {
  const first = (await listWatchlists(userId))[0]!;
  return { symbols: (await updateWatchlist(userId, first.id, { symbols })).symbols };
}
