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
  it('spells one release one way across providers', () => {
    expect(normalizeTitle('Non-Farm Payrolls')).toBe('non farm payrolls');
    expect(normalizeTitle('NFP')).toBe('non farm payrolls');
    expect(normalizeTitle('Consumer Price Index (YoY)')).toBe('inflation rate yoy');
    expect(normalizeTitle('Prelim GDP q/q')).toBe('gdp growth rate qoq prel');
    expect(normalizeTitle('U-6 Unemployment Rate')).toBe('u6 unemployment rate');
  });

  it('strips punctuation/case for other titles but keeps them distinct', () => {
    expect(normalizeTitle('Retail Sales m/m')).toBe('retail sales mom');
    expect(normalizeTitle('ISM Manufacturing PMI')).toBe('ism manufacturing pmi');
  });

  it('applies country-scoped synonyms only in that country', () => {
    expect(normalizeTitle('Cash Rate', 'AU')).toBe('rba interest rate decision');
    expect(normalizeTitle('Cash Rate', 'NZ')).toBe('cash rate');
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

// Real titles seen from TradingView (tv) and Forex Factory (ff). Each pair is
// [country, currency, titleA, titleB]; both rows at the same hour.
type Pair = [string, string, string, string];

const MUST_MERGE: Pair[] = [
  ['US', 'USD', 'Non Farm Payrolls', 'Non-Farm Employment Change'],
  ['US', 'USD', 'Non Farm Payrolls', 'Nonfarm Payrolls'],
  ['US', 'USD', 'Non Farm Payrolls', 'NFP'],
  ['US', 'USD', 'Unemployment Rate', 'Unemployment Rate'],
  ['US', 'USD', 'U-6 Unemployment Rate', 'U6 Unemployment Rate'],
  ['US', 'USD', 'Inflation Rate MoM', 'CPI m/m'],
  ['US', 'USD', 'Inflation Rate YoY', 'CPI y/y'],
  ['US', 'USD', 'Core Inflation Rate MoM', 'Core CPI m/m'],
  ['US', 'USD', 'Inflation Rate MoM', 'CPI (MoM)'],
  ['US', 'USD', 'Initial Jobless Claims', 'Unemployment Claims'],
  ['US', 'USD', 'GDP Growth Rate QoQ Adv', 'Advance GDP q/q'],
  ['US', 'USD', 'GDP Price Index QoQ Adv', 'Advance GDP Price Index q/q'],
  ['US', 'USD', 'Nonfarm Productivity QoQ Prel', 'Prelim Nonfarm Productivity q/q'],
  ['US', 'USD', 'Unit Labour Costs QoQ Prel', 'Prelim Unit Labor Costs q/q'],
  ['US', 'USD', 'Michigan Consumer Sentiment Prel', 'Prelim UoM Consumer Sentiment'],
  ['US', 'USD', 'Fed Interest Rate Decision', 'Federal Funds Rate'],
  ['US', 'USD', 'Balance of Trade', 'Trade Balance'],
  ['US', 'USD', 'ADP Employment Change', 'ADP Non-Farm Employment Change'],
  ['US', 'USD', 'Core PCE Price Index MoM', 'Core PCE Price Index m/m'],
  ['GB', 'GBP', 'Inflation Rate YoY', 'CPI y/y'],
  ['GB', 'GBP', 'BoE Interest Rate Decision', 'Official Bank Rate'],
  ['GB', 'GBP', 'Business Investment QoQ Prel', 'Prelim Business Investment q/q'],
  ['EU', 'EUR', 'ECB Interest Rate Decision', 'Main Refinancing Rate'],
  ['EU', 'EUR', 'Employment Change QoQ Final', 'Final Employment Change q/q'],
  ['CA', 'CAD', 'BoC Summary of Deliberations', 'BOC Summary of Deliberations'],
  ['IT', 'EUR', "All Saints' Day", 'All Saints’ Day'],
];

const MUST_NOT_MERGE: Pair[] = [
  ['US', 'USD', 'Unemployment Rate', 'U-6 Unemployment Rate'],
  ['US', 'USD', 'Unemployment Rate', 'U6 Unemployment Rate'],
  ['US', 'USD', 'Non Farm Payrolls', 'Nonfarm Payrolls Private'],
  ['US', 'USD', 'Non Farm Payrolls', 'Non Farm Payrolls Annual Revision Prel'],
  ['US', 'USD', 'Non Farm Payrolls', 'Nonfarm Payrolls Benchmark Revision'],
  ['US', 'USD', 'CPI', 'CPI s.a'],
  ['US', 'USD', 'CPI', 'Inflation Rate MoM'],
  ['US', 'USD', 'CPI m/m', 'CPI y/y'],
  ['US', 'USD', 'CPI m/m', 'Core CPI m/m'],
  ['US', 'USD', 'Core CPI y/y', 'CPI y/y'],
  ['US', 'USD', 'Inflation Rate YoY', 'Core Inflation Rate YoY'],
  ['US', 'USD', 'GDP Growth Rate QoQ Adv', 'GDP Price Index QoQ Adv'],
  ['US', 'USD', 'GDP Growth Rate QoQ Adv', 'GDP Sales QoQ Adv'],
  ['US', 'USD', 'GDP Growth Rate QoQ Adv', 'GDP Growth Rate QoQ 2nd Est'],
  ['US', 'USD', 'Advance GDP q/q', 'Prelim GDP q/q'],
  ['US', 'USD', 'Michigan Consumer Sentiment Prel', 'Michigan Consumer Sentiment Final'],
  ['US', 'USD', 'Initial Jobless Claims', 'Continuing Jobless Claims'],
  ['US', 'USD', 'Fed Interest Rate Decision', 'Fed Press Conference'],
  ['US', 'USD', 'Balance of Trade', 'Goods Trade Balance Adv'],
  ['GB', 'GBP', 'GDP MoM', 'GDP YoY'],
  ['GB', 'GBP', 'GDP YoY', 'GDP Growth Rate YoY Prel'],
  ['GB', 'GBP', 'GDP 3-Month Avg', 'GDP MoM'],
  ['CA', 'CAD', 'CPI Trimmed-Mean YoY', 'CPI Median YoY'],
  ['CA', 'CAD', 'GDP MoM', 'GDP MoM Prel'],
  ['AU', 'AUD', 'CPI', 'RBA Trimmed Mean CPI YoY'],
  ['AU', 'AUD', 'RBA Trimmed Mean CPI MoM', 'RBA Trimmed Mean CPI YoY'],
  ['JP', 'JPY', 'Tokyo CPI YoY', 'Tokyo Core CPI YoY'],
  ['JP', 'JPY', 'GDP Growth Rate QoQ Prel', 'GDP Growth Annualized Prel'],
  ['DE', 'EUR', 'Bavaria CPI MoM', 'Hesse CPI MoM'],
  ['DE', 'EUR', 'Inflation Rate MoM Prel', 'Harmonised Inflation Rate MoM Prel'],
  ['FR', 'EUR', 'Non Farm Payrolls QoQ', 'Private Non Farm Payrolls QoQ Final'],
  ['EU', 'EUR', 'Inflation Rate YoY Flash', 'CPI Flash'],
  ['EU', 'EUR', 'Unemployment Rate', 'Unemployment Rate Prel'],
];

describe('release matching (table)', () => {
  const at = new Date('2026-08-07T12:30:00Z');
  const key = (country: string, currency: string, title: string) => dedupKey({ country, currency, title, eventTimeUtc: at });

  it.each(MUST_MERGE)('%s: "%s" = "%s"', (country, currency, a, b) => {
    expect(key(country, currency, a)).toBe(key(country, currency, b));
  });

  it.each(MUST_NOT_MERGE)('%s: "%s" ≠ "%s"', (country, currency, a, b) => {
    expect(key(country, currency, a)).not.toBe(key(country, currency, b));
  });

  it('keeps the same release from different euro members apart', () => {
    expect(key('IT', 'EUR', 'Unemployment Rate')).not.toBe(key('EU', 'EUR', 'Unemployment Rate'));
    expect(key('FR', 'EUR', "All Saints' Day")).not.toBe(key('ES', 'EUR', "All Saints' Day"));
    expect(key('DE', 'EUR', 'GDP Growth Rate QoQ Flash')).not.toBe(key('IT', 'EUR', 'GDP Growth Rate QoQ Flash'));
  });

  it('files a Forex Factory "German …" release under Germany, matching TradingView', () => {
    expect(key('EU', 'EUR', 'German Prelim CPI m/m')).toBe(key('DE', 'EUR', 'Inflation Rate MoM Prel'));
    expect(key('EU', 'EUR', 'Spanish Flash GDP q/q')).toBe(key('ES', 'EUR', 'GDP Growth Rate QoQ Flash'));
    expect(key('EU', 'EUR', 'Italian Monthly Unemployment Rate')).not.toBe(key('EU', 'EUR', 'Unemployment Rate'));
  });

  it('keeps keys for home-country releases in the old "CUR|hour|title" shape', () => {
    expect(key('US', 'USD', 'Retail Sales MoM')).toBe('USD|2026-08-07T12|retail sales mom');
    expect(key('DE', 'EUR', 'Retail Sales MoM')).toBe('EUR-DE|2026-08-07T12|retail sales mom');
  });
});

describe('reconcileEvents keeps distinct releases apart', () => {
  it('the US jobs report: headline unemployment, U6, NFP and private payrolls are four rows', () => {
    const at = new Date('2026-11-06T13:30:00Z');
    const tv = (title: string, actual: string, forecast?: string) =>
      ev({ source: 'tradingview', title, actual, ...(forecast ? { forecast } : {}), eventTimeUtc: at });
    const out = reconcileEvents(
      [
        tv('Unemployment Rate', '4.3%', '4.2%'),
        tv('U-6 Unemployment Rate', '7.9%'),
        tv('Non Farm Payrolls', '119K', '50K'),
        tv('Nonfarm Payrolls Private', '97K', '40K'),
        ev({ source: 'forexfactory', title: 'Unemployment Rate', actual: '4.3%', forecast: '4.2%', eventTimeUtc: at }),
        ev({ source: 'forexfactory', title: 'Non-Farm Employment Change', actual: '119K', forecast: '51K', eventTimeUtc: at }),
      ],
      ['tradingview', 'forexfactory'],
    );
    const byTitle = Object.fromEntries(out.map(e => [e.title, e]));
    expect(Object.keys(byTitle).sort()).toEqual(['Non Farm Payrolls', 'Nonfarm Payrolls Private', 'U-6 Unemployment Rate', 'Unemployment Rate']);
    expect(byTitle['Unemployment Rate']).toMatchObject({ actual: '4.3%', forecast: '4.2%' });
    expect(byTitle['Unemployment Rate']!.sources.raw.map(r => r.source).sort()).toEqual(['forexfactory', 'tradingview']);
    expect(byTitle['U-6 Unemployment Rate']).toMatchObject({ actual: '7.9%', forecast: null });
    expect(byTitle['Non Farm Payrolls']!.sources.raw).toHaveLength(2);
    expect(byTitle['Nonfarm Payrolls Private']!.sources.raw).toHaveLength(1);
  });

  it('sets the member country for a Forex Factory euro-member release', () => {
    const out = reconcileEvents([ev({ source: 'forexfactory', country: 'EU', currency: 'EUR', title: 'German Prelim CPI m/m' })], PRIORITY);
    expect(out[0]).toMatchObject({ country: 'DE', currency: 'EUR', title: 'German Prelim CPI m/m' });
  });

  it('splits a group back by literal title when one provider lists two titles under one key', () => {
    // "CPI m/m" and "Inflation Rate MoM" are synonyms; one provider sending both
    // means they are two different series to that provider — never merge them.
    const out = reconcileEvents(
      [ev({ source: 'fmp', title: 'CPI m/m', actual: '0.3%' }), ev({ source: 'fmp', title: 'Inflation Rate MoM', actual: '0.2%' })],
      PRIORITY,
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map(e => e.dedupKey)).size).toBe(2);
  });
});
