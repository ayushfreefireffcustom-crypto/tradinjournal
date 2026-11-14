import { describe, expect, it } from 'vitest';
import type { DealWithLevels } from '../../../lib/broker-connector.js';
import { levelRowsFromSync } from '../bridge-levels.js';
import { lv, MON, M } from './fixtures.js';

const deal = (p: Partial<DealWithLevels>): DealWithLevels => ({
  dealTicket: '1', orderTicket: '1', positionId: '7', symbol: 'EURUSD', type: 'BUY', entry: 'IN', volume: '0.1', price: '1.08', profit: '0',
  commission: '0', swap: '0', fee: '0', dealTime: new Date(MON).toISOString(), comment: '', ...p,
});
const now = new Date(MON + 60 * M);

describe('levels from the bridge', () => {
  it('writes the opening order once, at the deal time', () => {
    const rows = levelRowsFromSync([deal({ sl: 1.075, tp: 1.09 }), deal({ entry: 'OUT', sl: null, tp: null })], null, new Map(), now);
    expect(rows).toEqual([{ positionId: '7', sl: 1.075, tp: 1.09, source: 'order', observedAt: new Date(MON) }]);
    const again = levelRowsFromSync([deal({ sl: 1.075, tp: 1.09 })], null, new Map([['7', [lv({ at: MON, sl: 1.075, source: 'order' })]]]), now);
    expect(again).toEqual([]);
  });
  it('older bridges (no fields) write nothing', () => {
    expect(levelRowsFromSync([deal({})], null, new Map(), now)).toEqual([]);
  });
  it('snapshots only when sl/tp changed since the last row', () => {
    const existing = new Map([['7', [lv({ at: MON, sl: 1.075, tp: 1.09, source: 'order' })]]]);
    expect(levelRowsFromSync([], [{ positionId: '7', sl: 1.075, tp: 1.09, updatedAt: null }], existing, now)).toEqual([]);
    const moved = levelRowsFromSync([], [{ positionId: '7', sl: 1.07, tp: 1.09, updatedAt: new Date(MON + 5 * M) }], existing, now);
    expect(moved).toEqual([{ positionId: '7', sl: 1.07, tp: 1.09, source: 'bridge', observedAt: new Date(MON + 5 * M) }]);
    // A modification time from the future or before the last row falls back to now.
    expect(levelRowsFromSync([], [{ positionId: '7', sl: 1.07, tp: null, updatedAt: new Date(MON - M) }], existing, now)[0]!.observedAt).toEqual(now);
    // No stop on a position that never had one: nothing to say.
    expect(levelRowsFromSync([], [{ positionId: '8', sl: null, tp: null, updatedAt: null }], existing, now)).toEqual([]);
  });
  it('a removed stop is written (it reads as widened)', () => {
    const existing = new Map([['7', [lv({ at: MON, sl: 1.075, source: 'bridge' })]]]);
    expect(levelRowsFromSync([], [{ positionId: '7', sl: null, tp: null, updatedAt: null }], existing, now)).toHaveLength(1);
  });
  it('the order row from this same sync counts for the snapshot dedupe', () => {
    const rows = levelRowsFromSync([deal({ sl: 1.075 })], [{ positionId: '7', sl: 1.075, tp: null, updatedAt: null }], new Map(), now);
    expect(rows.map(r => r.source)).toEqual(['order']);
  });
});
