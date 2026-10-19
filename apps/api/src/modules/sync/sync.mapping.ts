// Bridge deal ⇄ stored Execution row. Stored deals are the source of truth;
// trades and stats are rebuilt from them with the same code that used to run on
// live bridge data, so the numbers are identical.
import { Prisma } from '@tradinjournal/db';
import type { Deal } from '@tradinjournal/types';

export type ExecutionRow = Prisma.ExecutionCreateManyInput;

export function dealToExecution(brokerAccountId: string, d: Deal): ExecutionRow {
  return {
    brokerAccountId,
    dealTicket: BigInt(d.dealTicket),
    orderTicket: BigInt(d.orderTicket || '0'),
    positionId: BigInt(d.positionId || '0'),
    symbol: d.symbol,
    type: d.type,
    entry: d.entry,
    volume: new Prisma.Decimal(d.volume || '0'),
    price: new Prisma.Decimal(d.price || '0'),
    profit: new Prisma.Decimal(d.profit || '0'),
    commission: new Prisma.Decimal(d.commission || '0'),
    swap: new Prisma.Decimal(d.swap || '0'),
    fee: new Prisma.Decimal(d.fee || '0'),
    dealTime: new Date(d.dealTime),
    comment: d.comment || null,
  };
}

type StoredExecution = Pick<Prisma.ExecutionGetPayload<object>,
  'dealTicket' | 'orderTicket' | 'positionId' | 'symbol' | 'type' | 'entry' | 'volume' | 'price' | 'profit' | 'commission' | 'swap' | 'fee' | 'dealTime' | 'comment'>;

export function executionToDeal(e: StoredExecution): Deal {
  return {
    dealTicket: e.dealTicket.toString(),
    orderTicket: e.orderTicket.toString(),
    positionId: e.positionId.toString(),
    symbol: e.symbol,
    type: e.type,
    entry: e.entry,
    volume: e.volume.toString(),
    price: e.price.toString(),
    profit: e.profit.toString(),
    commission: e.commission.toString(),
    swap: e.swap.toString(),
    fee: e.fee.toString(),
    dealTime: e.dealTime.toISOString(),
    comment: e.comment ?? '',
  };
}

export const executionSelect = {
  dealTicket: true, orderTicket: true, positionId: true, symbol: true, type: true, entry: true, volume: true,
  price: true, profit: true, commission: true, swap: true, fee: true, dealTime: true, comment: true,
} as const;
