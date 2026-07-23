import { describe, it, expect } from 'vitest';
import { normalizeTitle, dedupKey, reconcileEvents } from '../reconcile.js';
import type { NormalizedEvent } from '../types.js';

function ev(p: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'source'>): NormalizedEvent {
  return {
    country: 'US',
    currency: 'USD',
    title: 'Non-Farm Payrolls',
    impact: 'HIGH',
    eventTimeUtc: new Date('2026-08-07T12:30:00Z'),
    ...p,
  };
}

const PRIORITY = ['forexfactory', 'fmp', 'finnhub'];

describe('normalizeTitle', () => {
  it('collapses known aliases to a canonical form', () => {
    expect(normalizeTitle('Non-Farm Payrolls')).toBe('nfp');
    expect(normalizeTitle('NFP')).toBe('nfp');
    expect(normalizeTitle('Consumer Price Index (YoY)')).toBe('cpi');
    expect(normalizeTitle('GDP q/q')).toBe('gdp');
  });

  it('strips punctuation/case for unknown titles but keeps them distinct', () => {
    expect(normalizeTitle('Retail Sales m/m')).toBe('retail sales m/m');
    expect(normalizeTitle('ISM Manufacturing PMI')).toBe('ism manufacturing pmi');
  });
});

describe('dedupKey', () => {
  it('is identical for the same event described differently, same hour', () => {
    const a = dedupKey({ currency: 'usd', eventTimeUtc: new Date('2026-08-07T12:30:00Z'), title: 'Non-Farm Payrolls' });
    const b = dedupKey({ currency: 'USD', eventTimeUtc: new Date('2026-08-07T12:45:00Z'), title: 'NFP' });
    expect(a).toBe(b);
  });

  it('differs across currency, hour, or distinct event', () => {
    const base = { currency: 'USD', eventTimeUtc: new Date('2026-08-07T12:30:00Z'), title: 'CPI' };
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, currency: 'EUR' }));
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, eventTimeUtc: new Date('2026-08-07T13:30:00Z') }));
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, title: 'PPI' }));
  });
});

describe('reconcileEvents', () => {
  it('merges rows for the same event into one record', () => {
    const out = reconcileEvents(
      [ev({ source: 'forexfactory' }), ev({ source: 'fmp', title: 'NFP' })],
      PRIORITY,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.sources.raw).toHaveLength(2);
  });

  it('takes schedule/impact from the highest-priority source, numbers from whoever has them', () => {
    const out = reconcileEvents(
      [
        ev({ source: 'fmp', title: 'NFP', impact: 'MEDIUM', forecast: '160K', previous: '206K' }),
        ev({ source: 'forexfactory', impact: 'HIGH' }), // priority winner for impact/title
      ],
      PRIORITY,
    );
    const e = out[0]!;
    expect(e.impact).toBe('HIGH'); // forexfactory won
    expect(e.sources.winners.impact).toBe('forexfactory');
    expect(e.forecast).toBe('160K'); // only fmp had it
    expect(e.sources.winners.forecast).toBe('fmp');
    expect(e.sources.impactConflict).toBe(true); // HIGH vs MEDIUM disagreed
  });

  it('fills actual from a lower-priority source when the top one lacks it', () => {
    const out = reconcileEvents(
      [ev({ source: 'forexfactory' }), ev({ source: 'finnhub', actual: '187K' })],
      PRIORITY,
    );
    expect(out[0]!.actual).toBe('187K');
    expect(out[0]!.sources.winners.actual).toBe('finnhub');
  });

  it('keeps unrelated events separate and sorts by time', () => {
    const out = reconcileEvents(
      [
        ev({ source: 'fmp', title: 'CPI', eventTimeUtc: new Date('2026-08-07T13:30:00Z') }),
        ev({ source: 'fmp', title: 'NFP', eventTimeUtc: new Date('2026-08-07T12:30:00Z') }),
      ],
      PRIORITY,
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe('NFP'); // earlier first
  });

  it('does not flag an impact conflict when all sources agree', () => {
    const out = reconcileEvents([ev({ source: 'forexfactory' }), ev({ source: 'fmp' })], PRIORITY);
    expect(out[0]!.sources.impactConflict).toBeUndefined();
  });

  it('normalizes currency casing in the output', () => {
    const out = reconcileEvents([ev({ source: 'fmp', currency: 'usd' })], PRIORITY);
    expect(out[0]!.currency).toBe('USD');
  });
});
