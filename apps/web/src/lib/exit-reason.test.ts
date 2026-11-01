import { describe, expect, it } from 'vitest';
import type { Deal } from './api';
import { exitReasonOf, exitReasonOfComment } from './exit-reason';

const deal = (entry: Deal['entry'], comment: string, dealTime: string): Deal => ({ dealTicket: dealTime, orderTicket: '1', positionId: 'p', symbol: 'EURUSD', type: 'SELL', entry, volume: '0.10', price: '1.1', profit: '0', commission: '0', swap: '0', fee: '0', dealTime, comment });

describe('exit reasons from MT5 deal comments', () => {
  it('reads the server’s own markers', () => {
    expect(['[tp 1.08450]', '[TP]', 'tp 2381.5', '[sl 1.08120]', 'sl', 'so: 48.2%/120.00/57.83', 'Stop out', ''].map(exitReasonOfComment))
      .toEqual(['tp', 'tp', 'tp', 'sl', 'sl', 'stopout', 'stopout', 'other']);
  });
  it('does not mistake words that merely contain the letters', () => {
    expect(['Slow exit', 'tpl breakout', 'manual close', 'EA#42', 'sol long'].map(exitReasonOfComment)).toEqual(['other', 'other', 'other', 'other', 'other']);
  });
  it('uses the deal that finally closed the position', () => {
    const deals = [deal('IN', '', '2026-03-02T09:00:00Z'), deal('OUT', '[tp 1.1]', '2026-03-02T10:00:00Z'), deal('OUT', '[sl 1.0]', '2026-03-02T11:00:00Z')];
    expect(exitReasonOf({ status: 'CLOSED', deals })).toBe('sl');
    expect(exitReasonOf({ status: 'CLOSED', deals: [deals[2]!, deals[1]!, deals[0]!] })).toBe('sl'); // order of the array doesn't matter
    expect(exitReasonOf({ status: 'OPEN', deals })).toBeNull();
    expect(exitReasonOf({ status: 'CLOSED', deals: [deals[0]!] })).toBeNull();
  });
});
