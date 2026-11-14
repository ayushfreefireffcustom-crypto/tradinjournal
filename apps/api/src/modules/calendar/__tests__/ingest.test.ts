// ingestWindow is what the backfill writes through: new events are inserted,
// unchanged ones untouched, changed ones updated — so re-running is harmless.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const createMany = vi.fn();
const update = vi.fn();
vi.mock('@tradinjournal/db', () => ({ prisma: { economicEvent: { findMany, createMany, update } } }));
vi.mock('@tradinjournal/config', () => ({ env: { CALENDAR_PROVIDER_PRIORITY_LIST: ['tradingview'] } }));
vi.mock('../../../lib/calendar/providers/index.js', () => ({ getCalendarProviders: () => { throw new Error('should use the given providers'); } }));

const { ingestWindow } = await import('../calendar.service.js');
const { dedupKey } = await import('../../../lib/calendar/reconcile.js');

const when = new Date('2026-03-11T12:30:00Z');
const cpi = { source: 'tradingview', country: 'US', currency: 'USD', title: 'Inflation Rate YoY', impact: 'HIGH' as const, eventTimeUtc: when, actual: '2.8%', forecast: '2.9%', previous: '3.0%' };
const provider = (rows: unknown[]) => ({ name: 'tradingview', fetchWindow: async () => rows as never[] });

describe('ingestWindow with a provider subset', () => {
  beforeEach(() => { findMany.mockReset(); createMany.mockReset(); update.mockReset(); });

  it('inserts new events once and skips them unchanged on the next run', async () => {
    findMany.mockResolvedValueOnce([]);
    createMany.mockResolvedValueOnce({ count: 1 });
    const a = await ingestWindow(new Date('2026-03-10'), new Date('2026-03-20'), { providers: [provider([cpi])] });
    expect(a).toEqual({ upserted: 1, providers: 1, fetched: 1 });
    expect(createMany.mock.calls[0]![0]).toMatchObject({ skipDuplicates: true, data: [{ dedupKey: dedupKey(cpi), actual: '2.8%', forecast: '2.9%' }] });

    findMany.mockResolvedValueOnce([{ dedupKey: dedupKey(cpi), actual: '2.8%', actualAt: when, forecast: '2.9%', previous: '3.0%', impact: 'HIGH', eventTime: when, title: cpi.title }]);
    const b = await ingestWindow(new Date('2026-03-10'), new Date('2026-03-20'), { providers: [provider([cpi])] });
    expect(b.upserted).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates a row whose values changed, keyed by dedupKey', async () => {
    findMany.mockResolvedValueOnce([{ dedupKey: dedupKey(cpi), actual: null, actualAt: null, forecast: '2.9%', previous: '3.0%', impact: 'HIGH', eventTime: when, title: cpi.title }]);
    update.mockResolvedValueOnce({});
    const r = await ingestWindow(new Date('2026-03-10'), new Date('2026-03-20'), { providers: [provider([cpi])] });
    expect(r.upserted).toBe(1);
    expect(update.mock.calls[0]![0]).toMatchObject({ where: { dedupKey: dedupKey(cpi) }, data: { actual: '2.8%' } });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('reports nothing fetched when the provider is empty', async () => {
    await expect(ingestWindow(new Date('2026-03-10'), new Date('2026-03-20'), { providers: [provider([])] })).resolves.toEqual({ upserted: 0, providers: 1, fetched: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
