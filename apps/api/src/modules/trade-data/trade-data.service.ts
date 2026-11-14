// Trade data for the insights pages and the stop / target editor.
//
//   loadTradeExtras — one call per page load: levels, excursions, stored
//     R / MAE / MFE and values per point → TradeExtra per position.
//   addLevel / deleteLevel — the trader's "Add stop / target" (and the Charts
//     "Save as plan"), with account ownership and stop-side validation.
// Everything degrades to "no data" while the tables are missing (store.ts).
import { prisma, type BrokerAccount } from '@tradinjournal/db';
import type { AddLevelDTO, AddLevelInput, DeleteLevelInput, PositionLevelsDTO } from '@tradinjournal/contracts';
import type { Trade } from '@tradinjournal/types';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { loadAccountData } from '../sync/account-data.js';
import { enrichPositions, type TradeExtra } from './enrich.js';
import { levelError, levelsDto, NO_LEVELS, stopAtEntry, type LevelRow } from './levels.js';
import { pointValues } from './point-value.js';
import { available, bumpDataVersion, deleteOwnLevel, excursionsByPosition, insertLevels, levelsByPosition } from './store.js';

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const openKey = (symbol: string, ms: number) => `${symbol}|${Math.floor(ms / 1000)}`;

/** Stored R-multiple and TradeMetric MAE/MFE (Trade rows), matched by symbol + open second. */
async function storedExtras(accountId: string, positions: Trade[]) {
  const rows = await prisma.trade.findMany({
    where: { brokerAccountId: accountId },
    select: { symbol: true, openTime: true, rMultiple: true, metric: { select: { mae: true, mfe: true } } },
  });
  const byKey = new Map(rows.map(r => [openKey(r.symbol, r.openTime.getTime()), { r: num(r.rMultiple), mae: num(r.metric?.mae), mfe: num(r.metric?.mfe) }]));
  const out = new Map<string, { r: number | null; mae: number | null; mfe: number | null }>();
  for (const t of positions) {
    const x = byKey.get(openKey(t.symbol, new Date(t.openTime).getTime()));
    if (x) out.set(t.positionId, x);
  }
  return out;
}

export interface TradeExtras {
  extras: Map<string, TradeExtra>;
  levels: Map<string, LevelRow[]>;
  /** Value per point per position (for display). */
  pv: ReturnType<typeof pointValues>;
}

export async function loadTradeExtras(account: Pick<BrokerAccount, 'id' | 'baseCurrency'>, positions: Trade[]): Promise<TradeExtras> {
  const [levels, excursions, stored] = await Promise.all([
    levelsByPosition(account.id),
    excursionsByPosition(account.id),
    storedExtras(account.id, positions).catch(() => new Map()),
  ]);
  const pv = pointValues(positions, account.baseCurrency);
  return { extras: enrichPositions({ positions, levels, excursions, stored, pointValues: pv }), levels, pv };
}

/** The levels block for one position (trade review / trade log panel). */
export async function positionLevels(accountId: string, position: Pick<Trade, 'positionId' | 'direction'>, rows?: LevelRow[]): Promise<PositionLevelsDTO> {
  const ok = await available();
  if (!ok) return NO_LEVELS(false);
  const r = rows ?? (await levelsByPosition(accountId, [position.positionId])).get(position.positionId) ?? [];
  return levelsDto(r, position.direction, true);
}

async function ownPosition(userId: string, accountId: string, positionId: string) {
  // Ownership (and the Elefin-only policy) is checked inside loadAccountData.
  const data = await loadAccountData(userId, accountId, 'readonly');
  const pos = data.trades().find(t => t.positionId === positionId);
  if (!pos) throw new NotFoundError(`Position #${positionId} isn't on this account`);
  return { account: data.account, pos };
}

export async function addLevel(userId: string, input: AddLevelInput, now = new Date()): Promise<AddLevelDTO> {
  const { account, pos } = await ownPosition(userId, input.accountId, input.positionId);
  if (!(await available())) throw new ConflictError('Stops can’t be saved yet. Try again later.');
  const existing = (await levelsByPosition(account.id, [pos.positionId])).get(pos.positionId) ?? [];
  const sl = input.sl ?? null, tp = input.tp ?? null;
  const err = levelError(pos.direction, pos.entryPrice, sl, tp, !!stopAtEntry(existing));
  if (err) throw new ValidationError(err, { [sl != null && err.includes('stop') ? 'sl' : 'tp']: [err] });
  await insertLevels(account.id, [{ positionId: pos.positionId, sl, tp, source: input.source, observedAt: now }]);
  await bumpDataVersion(account.id);
  return { levels: await positionLevels(account.id, pos) };
}

export async function deleteLevel(userId: string, input: DeleteLevelInput): Promise<AddLevelDTO> {
  const acc = await prisma.brokerAccount.findFirst({ where: { id: input.accountId, userId }, select: { id: true } });
  if (!acc) throw new NotFoundError('Broker account not found');
  const gone = await deleteOwnLevel(acc.id, input.id);
  if (!gone) throw new NotFoundError('That stop isn’t yours to remove');
  await bumpDataVersion(acc.id);
  const { pos } = await ownPosition(userId, input.accountId, gone.positionId);
  return { levels: await positionLevels(acc.id, pos) };
}
