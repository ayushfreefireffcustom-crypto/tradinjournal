import { describe, expect, it } from 'vitest';
import { changed, currentLevels, levelError, levelsDto, NO_LEVELS, stopAtEntry, stopMove, targetAtEntry } from '../levels.js';
import { lv, MON, M } from './fixtures.js';

describe('stop at entry', () => {
  it('is the earliest row with a stop, whatever the insert order', () => {
    const rows = [lv({ at: MON + 10 * M, sl: 1990, source: 'user' }), lv({ at: MON, tp: 2020, source: 'order' }), lv({ at: MON + M, sl: 1995, source: 'bridge' })];
    expect(stopAtEntry(rows)).toMatchObject({ sl: 1995, source: 'bridge' });
    expect(targetAtEntry(rows)).toMatchObject({ tp: 2020, source: 'order' });
    expect(stopAtEntry([lv({ at: MON, tp: 2020 })])).toBeNull();
  });
  it('current levels follow the newest row; a typed target keeps the stop', () => {
    const rows = [lv({ at: MON, sl: 1995, tp: 2020, source: 'order' }), lv({ at: MON + M, tp: 2030, source: 'user' })];
    expect(currentLevels(rows)).toEqual({ sl: 1995, tp: 2030 });
    // A live snapshot without a stop means it was removed.
    expect(currentLevels([...rows, lv({ at: MON + 2 * M, tp: 2030, source: 'bridge' })])).toEqual({ sl: null, tp: 2030 });
  });
});

describe('stop moves', () => {
  it('needs two different stops', () => {
    expect(stopMove([], 'LONG')).toBeNull();
    expect(stopMove([lv({ at: MON, sl: 1995 })], 'LONG')).toBeNull();
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, sl: 1995 })], 'LONG')).toBeNull();
  });
  it('long: lower = widened, higher = tightened; widened wins', () => {
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, sl: 1990 })], 'LONG')).toBe('widened');
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, sl: 1999 })], 'LONG')).toBe('tightened');
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, sl: 1999 }), lv({ at: MON + 2 * M, sl: 1990 })], 'LONG')).toBe('widened');
  });
  it('short is mirrored', () => {
    expect(stopMove([lv({ at: MON, sl: 2005 }), lv({ at: MON + M, sl: 2010 })], 'SHORT')).toBe('widened');
    expect(stopMove([lv({ at: MON, sl: 2005 }), lv({ at: MON + M, sl: 2001 })], 'SHORT')).toBe('tightened');
  });
  it('a removed stop (bridge snapshot without one) is widened; a typed target is not', () => {
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, source: 'bridge' })], 'LONG')).toBe('widened');
    expect(stopMove([lv({ at: MON, sl: 1995 }), lv({ at: MON + M, tp: 2030, source: 'user' })], 'LONG')).toBeNull();
  });
});

describe('dedupe and validation', () => {
  it('changed() only when sl or tp differ', () => {
    expect(changed(null, { sl: null, tp: null })).toBe(false);
    expect(changed(null, { sl: 1, tp: null })).toBe(true);
    expect(changed({ sl: 1.1, tp: null }, { sl: 1.1, tp: null })).toBe(false);
    expect(changed({ sl: 1.1, tp: null }, { sl: 1.1, tp: 1.2 })).toBe(true);
    expect(changed({ sl: 1.1, tp: 1.2 }, { sl: null, tp: 1.2 })).toBe(true);
  });
  it('stop at entry on the losing side; later stops may trail; target on the winning side', () => {
    expect(levelError('LONG', 2000, 2001, null, false)).toMatch(/below the entry/);
    expect(levelError('SHORT', 2000, 1999, null, false)).toMatch(/above the entry/);
    expect(levelError('LONG', 2000, 1990, null, false)).toBeNull();
    expect(levelError('LONG', 2000, 2005, null, true)).toBeNull(); // trailing into profit
    expect(levelError('LONG', 2000, null, 1990, false)).toMatch(/target has to be above/);
    expect(levelError('SHORT', 2000, 2010, 1980, false)).toBeNull();
    expect(levelError('LONG', 2000, null, null, false)).toMatch(/Add a stop/);
    expect(levelError('LONG', 2000, 2010, 2005, true)).toMatch(/other side/);
  });
});

describe('dto', () => {
  it('summarises the levels and marks the trader’s own rows', () => {
    const d = levelsDto([lv({ at: MON, sl: 1995, source: 'user' }), lv({ at: MON + M, sl: 1990, source: 'bridge' })], 'LONG');
    expect(d).toMatchObject({ available: true, stop: 1995, stopSource: 'user', current: { sl: 1990, tp: null }, move: 'widened' });
    expect(d.history.map(h => h.mine)).toEqual([true, false]);
    expect(NO_LEVELS(false)).toMatchObject({ available: false, stop: null, history: [] });
  });
});
