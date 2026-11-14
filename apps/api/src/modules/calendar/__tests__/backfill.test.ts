import { describe, expect, it, vi } from 'vitest';

vi.mock('@tradinjournal/db', () => ({ prisma: {} }));
const { backfillCalendar, backfillRange, backfillWindows } = await import('../calendar.backfill.js');
type Deps = Parameters<typeof backfillCalendar>[1] & object;
type State = Awaited<ReturnType<Deps['read']>>;

const NOW = Date.UTC(2026, 10, 14, 9, 30);
const DAY = 86_400_000;
const iso = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

function fakeDeps(over: Partial<Deps> = {}, state: State = null) {
  const calls: [string, string][] = [];
  const sleeps: number[] = [];
  let saved: State = state;
  let claimed = 0;
  const provider = { name: 'tradingview', fetchWindow: async () => [] };
  const deps: Deps = {
    providers: () => [provider],
    ingest: async (from, to, providers) => {
      expect(providers).toEqual([provider]);
      calls.push([iso(from), iso(to)]);
      return { upserted: 3, fetched: 40 };
    },
    claim: async () => { claimed++; return true; },
    read: async () => saved,
    write: async (s) => { saved = s; },
    now: () => NOW,
    sleep: async (ms) => { sleeps.push(ms); },
    ...over,
  };
  return { deps, calls, sleeps, saved: () => saved, claimed: () => claimed };
}

describe('calendar backfill plan', () => {
  it('first pass: 13 months back to a week ago, in 10-day windows', () => {
    const r = backfillRange(NOW, null)!;
    expect(iso(r.from)).toBe('2025-10-14');
    expect(iso(r.to)).toBe('2026-11-07');
    const w = backfillWindows(r.from, r.to);
    expect(w).toHaveLength(39);
    expect(iso(w[0]!.from)).toBe('2025-10-14');
    expect(iso(w.at(-1)!.to)).toBe('2026-11-07');
    for (let i = 1; i < w.length; i++) expect(w[i]!.from.getTime()).toBe(w[i - 1]!.to.getTime());
  });

  it('later passes only fetch from the last end (minus two days)', () => {
    const r = backfillRange(NOW, { doneFrom: '2025-10-01T00:00:00.000Z', doneTo: '2026-11-01T00:00:00.000Z', lastRunAt: null })!;
    expect(iso(r.from)).toBe('2026-10-30');
    expect(iso(r.to)).toBe('2026-11-07');
    // Up to date: nothing to do.
    expect(backfillRange(NOW, { doneFrom: '2025-10-01T00:00:00.000Z', doneTo: '2026-11-07T00:00:00.000Z', lastRunAt: null })).not.toBeNull();
    expect(backfillRange(NOW, { doneFrom: '2025-10-01T00:00:00.000Z', doneTo: '2026-11-10T00:00:00.000Z', lastRunAt: null })).toBeNull();
    // A covered range that starts too late means a full pass.
    expect(iso(backfillRange(NOW, { doneFrom: '2026-06-01T00:00:00.000Z', doneTo: '2026-11-01T00:00:00.000Z', lastRunAt: null })!.from)).toBe('2025-10-14');
  });
});

describe('backfillCalendar', () => {
  it('fetches every window one at a time with a pause, then records the range', async () => {
    const f = fakeDeps();
    const r = await backfillCalendar({}, f.deps);
    expect(r.status).toBe('done');
    expect(f.calls).toHaveLength(39);
    expect(f.calls[0]).toEqual(['2025-10-14', '2025-10-24']);
    expect(f.sleeps).toEqual(Array(38).fill(1_500));
    expect(f.claimed()).toBe(1);
    expect(r).toMatchObject({ fetched: 39 * 40, upserted: 39 * 3 });
    expect(f.saved()).toMatchObject({ doneFrom: '2025-10-14T00:00:00.000Z', doneTo: '2026-11-07T00:00:00.000Z', lastRunAt: new Date(NOW).toISOString() });
  });

  it('second run the same day is skipped by the guard; the next day only tops up', async () => {
    const f = fakeDeps({ claim: async () => false });
    await expect(backfillCalendar({}, f.deps)).resolves.toMatchObject({ status: 'skipped', reason: 'ran in the last day' });
    expect(f.calls).toEqual([]);
    const g = fakeDeps({}, { doneFrom: '2025-10-14T00:00:00.000Z', doneTo: '2026-11-06T00:00:00.000Z', lastRunAt: new Date(NOW - DAY).toISOString() });
    const r = await backfillCalendar({}, g.deps);
    expect(g.calls).toEqual([['2026-11-04', '2026-11-07']]);
    expect(r.status).toBe('done');
    expect(g.saved()).toMatchObject({ doneFrom: '2025-10-14T00:00:00.000Z', doneTo: '2026-11-07T00:00:00.000Z' });
  });

  it('stops after three empty windows and keeps the old range for tomorrow', async () => {
    let n = 0;
    const f = fakeDeps({ ingest: async () => (n++ < 2 ? { upserted: 1, fetched: 5 } : { upserted: 0, fetched: 0 }) });
    const r = await backfillCalendar({}, f.deps);
    expect(r).toMatchObject({ status: 'stopped', reason: '3 empty windows in a row' });
    expect(n).toBe(5);
    expect(f.saved()).toMatchObject({ doneFrom: null, doneTo: null, lastResult: { stopped: '3 empty windows in a row' } });
  });

  it('a failing window counts as empty and does not throw', async () => {
    const f = fakeDeps({ ingest: async () => { throw new Error('HTTP 500'); } });
    await expect(backfillCalendar({}, f.deps)).resolves.toMatchObject({ status: 'stopped' });
  });

  it('dry run plans without claiming, fetching or writing', async () => {
    const f = fakeDeps();
    const r = await backfillCalendar({ dryRun: true }, f.deps);
    expect(r.status).toBe('planned');
    expect(r.windows).toHaveLength(39);
    expect(f.calls).toEqual([]);
    expect(f.claimed()).toBe(0);
    expect(f.saved()).toBeNull();
  });

  it('force (the script) skips the guard and redoes the full range', async () => {
    const f = fakeDeps({ claim: async () => false }, { doneFrom: '2025-10-14T00:00:00.000Z', doneTo: '2026-11-07T00:00:00.000Z', lastRunAt: null });
    const r = await backfillCalendar({ force: true, months: 2, chunkDays: 30 }, f.deps);
    expect(r.status).toBe('done');
    expect(f.calls).toEqual([['2026-09-14', '2026-10-14'], ['2026-10-14', '2026-11-07']]);
  });

  it('does nothing without a history provider', async () => {
    const f = fakeDeps({ providers: () => [] });
    await expect(backfillCalendar({}, f.deps)).resolves.toMatchObject({ status: 'skipped' });
    expect(f.claimed()).toBe(0);
  });
});
