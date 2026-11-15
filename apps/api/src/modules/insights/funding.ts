// Deposits and withdrawals (MT5 BALANCE deals) as dated cash flows.
//
// The account balance at a moment is the cash put in (or taken out) up to then
// plus the net of every trade closed by then. Summing every balance operation
// into one "starting balance" is wrong once money has been withdrawn: a trader
// who deposited $1k, made $5.5k and withdrew $6.4k would start at −$5.4k.
import type { Deal } from '@tradinjournal/types';

export interface BalanceOp {
  /** Deal time, epoch ms. */
  t: number;
  /** + deposit, − withdrawal. */
  amount: number;
}

/** BALANCE deals as cash flows, oldest first. */
export function balanceOpsOf(deals: Pick<Deal, 'type' | 'profit' | 'dealTime'>[]): BalanceOp[] {
  return deals
    .filter(d => d.type === 'BALANCE')
    .map(d => ({ t: Date.parse(d.dealTime), amount: parseFloat(d.profit) }))
    .filter(o => Number.isFinite(o.t) && Number.isFinite(o.amount) && o.amount !== 0)
    .sort((a, b) => a.t - b.t);
}

/** Cash flows strictly before ms (ops must be sorted oldest first). */
export function fundedBefore(ops: BalanceOp[], ms: number): number {
  let s = 0;
  for (const o of ops) { if (o.t >= ms) break; s += o.amount; }
  return s;
}

/**
 * The account's cash flows, or the legacy single starting balance when the
 * flows aren't known (treated as deposited before anything else happened).
 */
export function opsOrStart(ops: BalanceOp[] | null | undefined, startingBalance: number): BalanceOp[] {
  if (ops) return ops;
  return startingBalance ? [{ t: -Infinity, amount: startingBalance }] : [];
}
