import { describe, expect, it, vi } from 'vitest';

vi.mock('@tradinjournal/db', () => ({ prisma: {}, Prisma: {} }));
const { isHolidayEvent, matchesPrefs, symbolCurrencies } = await import('../reminder-match.js');

const ev = (p: Partial<Parameters<typeof isHolidayEvent>[0]>) => ({
  title: 'CPI', currency: 'USD', category: null, impact: 'HIGH' as const, eventTime: new Date('2026-11-14T13:30:00Z'),
  actual: null, forecast: '0.2%', previous: '0.3%', ...p,
});

describe('symbolCurrencies', () => {
  it('reads pairs, metals, indices and broker suffixes', () => {
    expect(symbolCurrencies('EURUSD')).toEqual(['EUR', 'USD']);
    expect(symbolCurrencies('gbpjpy.m')).toEqual(['GBP', 'JPY']);
    expect(symbolCurrencies('XAUUSD')).toEqual(['USD']);
    expect(symbolCurrencies('USDCNH')).toEqual(['USD', 'CNY']);
    expect(symbolCurrencies('GER40')).toEqual(['EUR']);
    expect(symbolCurrencies('NAS100.cash')).toEqual(['USD']);
    expect(symbolCurrencies('UK100')).toEqual(['GBP']);
    expect(symbolCurrencies('JP225')).toEqual(['JPY']);
    expect(symbolCurrencies('BTCUSDT')).toEqual(['USD']);
    expect(symbolCurrencies('AAPL')).toEqual([]);
  });
});

describe('isHolidayEvent', () => {
  it('spots holidays: low impact, no numbers', () => {
    expect(isHolidayEvent(ev({ title: 'Proclamation of the Republic Day', currency: 'BRL', impact: 'LOW', forecast: null, previous: null, eventTime: new Date('2026-11-15T00:00:00Z') }))).toBe(true);
    expect(isHolidayEvent(ev({ title: 'Labor Day', impact: 'LOW', forecast: null, previous: null, eventTime: new Date('2026-10-26T09:00:00Z') }))).toBe(true);
  });
  it('keeps real releases', () => {
    expect(isHolidayEvent(ev({ title: 'USDA Wheat Net Export Sales', impact: 'LOW', forecast: null }))).toBe(false);
    expect(isHolidayEvent(ev({ title: 'Fed Chair Speaks', impact: 'LOW', forecast: null, previous: null }))).toBe(false);
    expect(isHolidayEvent(ev({ title: 'Independence Day', impact: 'HIGH', forecast: null, previous: null }))).toBe(false);
  });
});

describe('matchesPrefs', () => {
  const mine = new Set(['USD', 'EUR']);
  const p = { minImpact: 'HIGH' as const, currencies: [] as string[], categories: [] as string[] };
  it('defaults to high impact in my currencies', () => {
    expect(matchesPrefs(ev({}), p, mine)).toBe(true);
    expect(matchesPrefs(ev({ currency: 'INR' }), p, mine)).toBe(false);
    expect(matchesPrefs(ev({ impact: 'MEDIUM' }), p, mine)).toBe(false);
  });
  it('keeps the user’s own impact, currency and category choices', () => {
    expect(matchesPrefs(ev({ impact: 'LOW', currency: 'INR' }), { ...p, minImpact: 'LOW', currencies: ['INR'] }, mine)).toBe(true);
    expect(matchesPrefs(ev({ category: 'inflation' }), { ...p, categories: ['jobs'] }, mine)).toBe(false);
  });
});
