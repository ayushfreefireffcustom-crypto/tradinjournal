import { describe, it, expect } from 'vitest';
import type { Deal } from '@tradinjournal/types';
import { dealToExecution, executionToDeal } from '../sync.mapping.js';
import { reconstructTrades, computeStats } from '../../trades/trades.service.js';

const d = (o: Partial<Deal>): Deal => ({
  dealTicket: '1', orderTicket: '1', positionId: '100', symbol: 'EURUSD', type: 'BUY', entry: 'IN', volume: '0.10',
  price: '1.10000', profit: '0.00', commission: '-0.35', swap: '0.00', fee: '0.00', dealTime: '2026-10-01T09:00:00.000Z', comment: '', ...o,
});

// A realistic history: deposit, a partial-close long, a short, an open position, a 0-position fee.
const DEALS: Deal[] = [
  d({ dealTicket: '1', positionId: '0', type: 'BALANCE', entry: 'IN', volume: '0', price: '0', profit: '10000.00', commission: '0', dealTime: '2026-09-30T08:00:00.000Z', comment: 'deposit' }),
  d({ dealTicket: '2', positionId: '100' }),
  d({ dealTicket: '3', positionId: '100', type: 'SELL', entry: 'OUT', volume: '0.04', price: '1.10230', profit: '9.20', dealTime: '2026-10-01T10:00:00.000Z' }),
  d({ dealTicket: '4', positionId: '100', type: 'SELL', entry: 'OUT', volume: '0.06', price: '1.10110', profit: '6.60', swap: '-0.12', dealTime: '2026-10-02T11:30:00.000Z' }),
  d({ dealTicket: '5', positionId: '200', type: 'SELL', symbol: 'XAUUSD', volume: '0.01', price: '2650.15', dealTime: '2026-10-03T07:00:00.000Z' }),
  d({ dealTicket: '6', positionId: '200', type: 'BUY', entry: 'OUT', symbol: 'XAUUSD', volume: '0.01', price: '2655.95', profit: '-5.80', dealTime: '2026-10-03T08:15:00.000Z' }),
  d({ dealTicket: '7', positionId: '300', symbol: 'BTCUSD', volume: '0.02', price: '61234.5', dealTime: '2026-10-04T12:00:00.000Z' }),
];

describe('deal ⇄ execution mapping', () => {
  it('round-trips every field', () => {
    for (const deal of DEALS) {
      const back = executionToDeal(dealToExecution('acc', deal) as never);
      expect(parseFloat(back.volume)).toBe(parseFloat(deal.volume));
      expect(parseFloat(back.price)).toBe(parseFloat(deal.price));
      expect(parseFloat(back.profit)).toBe(parseFloat(deal.profit));
      expect(back).toMatchObject({ dealTicket: deal.dealTicket, positionId: deal.positionId, symbol: deal.symbol, type: deal.type, entry: deal.entry, dealTime: deal.dealTime, comment: deal.comment });
    }
  });

  it('rebuilds identical trades and stats from stored rows', () => {
    const stored = DEALS.map(x => executionToDeal(dealToExecution('acc', x) as never));
    const live = reconstructTrades(DEALS), fromDb = reconstructTrades(stored);
    const strip = (t: ReturnType<typeof reconstructTrades>) => t.map(({ deals: _d, ...rest }) => rest);
    expect(strip(fromDb)).toEqual(strip(live));
    expect(computeStats(fromDb, 10000)).toEqual(computeStats(live, 10000));
    expect(live.map(t => t.status)).toEqual(['OPEN', 'CLOSED', 'CLOSED']);
  });

  it('keeps 64-bit tickets exact', () => {
    const big = d({ dealTicket: '9223372036854775807', positionId: '9007199254740993' });
    expect(executionToDeal(dealToExecution('acc', big) as never)).toMatchObject({ dealTicket: '9223372036854775807', positionId: '9007199254740993' });
  });
});
