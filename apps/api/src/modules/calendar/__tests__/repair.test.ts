// planCalendarRepair is pure; the DB side is covered by repair.integration.test.ts.
import { describe, expect, it } from 'vitest';
import { planCalendarRepair, type StoredEvent } from '../calendar.repair.js';

const at = '2026-10-02T12:30:00.000Z';
const tv = (title: string, actual?: string, forecast?: string, country = 'US', currency = 'USD') =>
  ({ source: 'tradingview', country, currency, title, impact: 'HIGH', eventTimeUtc: at, ...(actual ? { actual } : {}), ...(forecast ? { forecast } : {}) });

function row(id: string, p: Partial<StoredEvent> & { raw?: unknown[] }): StoredEvent {
  const { raw, ...rest } = p;
  return {
    id, dedupKey: `USD|2026-10-02T12|${id}`, title: 'x', country: 'US', currency: 'USD', category: null, impact: 'HIGH',
    eventTime: new Date(at), actual: null, forecast: null, previous: null, unit: null, actualAt: null,
    sources: { winners: {}, raw: raw ?? [] }, createdAt: new Date('2026-09-01T00:00:00Z'), ...rest,
  };
}

describe('planCalendarRepair', () => {
  it('splits a row holding two releases; the shown title keeps the id', () => {
    const merged = row('m', {
      dedupKey: 'USD|2026-10-02T12|unemployment rate', title: 'Unemployment Rate', actual: '7.9%', forecast: '4.2%',
      raw: [tv('Unemployment Rate', '4.3%', '4.2%'), tv('U-6 Unemployment Rate', '7.9%')],
    });
    const plan = planCalendarRepair([merged], new Map(), ['tradingview']);
    expect(plan.splitRows).toBe(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: 'm', data: { dedupKey: 'USD|2026-10-02T12|unemployment rate', actual: '4.3%', forecast: '4.2%' } });
    expect(plan.creates.map(c => c.data)).toMatchObject([{ dedupKey: 'USD|2026-10-02T12|u6 unemployment rate', title: 'U-6 Unemployment Rate', actual: '7.9%', forecast: null }]);
    expect(plan.deletes).toEqual([]);
  });

  it('folds two rows naming one release into the watched one', () => {
    const a = row('a', { dedupKey: 'USD|2026-10-02T12|initial jobless claims', title: 'Initial Jobless Claims', raw: [tv('Initial Jobless Claims', '210')] });
    const b = row('b', { dedupKey: 'USD|2026-10-02T12|unemployment claims', title: 'Unemployment Claims', raw: [{ ...tv('Unemployment Claims', undefined, '216K'), source: 'forexfactory' }] });
    const plan = planCalendarRepair([a, b], new Map([['b', 2]]), ['tradingview', 'forexfactory']);
    expect(plan.deletes).toEqual([{ id: 'a', intoId: 'b' }]);
    expect(plan.updates[0]).toMatchObject({ id: 'b', fromKey: 'USD|2026-10-02T12|unemployment claims', data: { dedupKey: 'USD|2026-10-02T12|initial jobless claims', title: 'Initial Jobless Claims', actual: '210', forecast: '216K' } });
  });

  it('leaves a correct row alone and uses the row itself when provenance is missing', () => {
    const ok = row('ok', { dedupKey: 'USD|2026-10-02T12|retail sales mom', title: 'Retail Sales MoM', actual: '0.2', raw: [tv('Retail Sales MoM', '0.2')] });
    const bare = row('bare', { dedupKey: 'USD|2026-10-02T12|ism manufacturing pmi', title: 'ISM Manufacturing PMI', sources: {} });
    const plan = planCalendarRepair([ok, bare], new Map(), ['tradingview']);
    expect(plan.unchanged).toBe(1);
    expect(plan.updates.map(u => u.id)).toEqual(['bare']); // gains a synthesized provenance entry, same key
    expect(plan.updates[0]!.data.dedupKey).toBe('USD|2026-10-02T12|ism manufacturing pmi');
    expect(plan.creates).toEqual([]);
  });
});
