import { describe, expect, it } from 'vitest';
import { contractMonths, FOMC_DECISIONS, fedWatch, moveOdds, upcomingMeetings, zqSymbol } from '../index.js';

/** Prices for months from a step path of the target EFFR, averaging each month by day. */
function pricesFor(meetings: ReturnType<typeof upcomingMeetings>, rates: number[], from: string, to: string, startRate: number) {
  const out = new Map<string, number>();
  const months = contractMonths(meetings).filter((m) => m >= from && m <= to);
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number) as [number, number];
    const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let sum = 0;
    for (let day = 1; day <= n; day++) {
      const iso = `${m}-${String(day).padStart(2, '0')}`;
      // Rate in force on `iso`: after every decision strictly before it.
      let r = startRate;
      meetings.forEach((mt, i) => { if (mt.decision < iso) r = rates[i]!; });
      sum += r;
    }
    out.set(m, 100 - sum / n);
  }
  return out;
}

describe('FedWatch maths', () => {
  it('maps months to CBOT ZQ symbols on Yahoo', () => {
    expect(zqSymbol('2026-12')).toBe('ZQZ26.CBT');
    expect(zqSymbol('2027-01')).toBe('ZQF27.CBT');
    expect(zqSymbol('2027-03')).toBe('ZQH27.CBT');
  });

  it('lists upcoming meetings with the effective month and days at the old rate', () => {
    const m = upcomingMeetings('2026-11-14', 3);
    expect(m).toEqual([
      { decision: '2026-12-09', month: '2026-12', d: 9, n: 31 },
      { decision: '2027-01-27', month: '2027-01', d: 27, n: 31 },
      { decision: '2027-03-17', month: '2027-03', d: 17, n: 31 },
    ]);
    // The meeting day itself still counts as upcoming.
    expect(upcomingMeetings('2026-12-09', 1)[0]!.decision).toBe('2026-12-09');
    expect(contractMonths(m)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(FOMC_DECISIONS.every((d, i) => i === 0 || d > FOMC_DECISIONS[i - 1]!)).toBe(true);
  });

  it('splits an expected move between the nearest 25 bp outcomes', () => {
    expect(moveOdds(-0.6)).toEqual({ cutPct: 60, holdPct: 40, hikePct: 0, bigMovePct: 0 });
    expect(moveOdds(0.2)).toEqual({ cutPct: 0, holdPct: 80, hikePct: 20, bigMovePct: 0 });
    expect(moveOdds(-1.3)).toEqual({ cutPct: 100, holdPct: 0, hikePct: 0, bigMovePct: 30 });
    expect(moveOdds(0)).toEqual({ cutPct: 0, holdPct: 100, hikePct: 0, bigMovePct: 0 });
  });

  it('recovers a known path of certain moves exactly', () => {
    // Nine meetings: the ninth (Nov 2027) lets late-month Oct 27 solve back rather than forward.
    const meetings = upcomingMeetings('2026-11-14', 9);
    // Cut in Dec, hold Jan, cut Mar, hold, hike Jun, holds after.
    const rates = [3.625, 3.625, 3.375, 3.375, 3.625, 3.625, 3.625, 3.625, 3.625];
    const prices = pricesFor(meetings, rates, '2026-11', '2028-01', 3.875);
    const r = fedWatch(meetings, prices)!;
    expect(r.impliedNow).toBeCloseTo(3.875, 6);
    expect(r.meetings.map((m) => m.decision)).toEqual(meetings.map((m) => m.decision));
    expect(r.meetings.map((m) => Math.round(m.expectedBp) || 0)).toEqual([-25, 0, -25, 0, 25, 0, 0, 0, 0]);
    expect(r.meetings[0]).toMatchObject({ cutPct: 100, holdPct: 0, hikePct: 0 });
    expect(r.meetings[1]).toMatchObject({ cutPct: 0, holdPct: 100, hikePct: 0 });
    expect(r.meetings[4]).toMatchObject({ hikePct: 100 });
    expect(r.meetings.map((m) => Math.round(m.cumulativeCuts) || 0)).toEqual([1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('prices a partial cut as odds', () => {
    const meetings = upcomingMeetings('2026-11-14', 2);
    // Market averages a 15 bp cut in December (60 % of 25 bp), then holds.
    const prices = pricesFor(meetings, [3.725, 3.725], '2026-11', '2027-02', 3.875);
    const r = fedWatch(meetings, prices)!;
    expect(r.meetings[0]!.cutPct).toBeCloseTo(60, 0);
    expect(r.meetings[0]!.holdPct).toBeCloseTo(40, 0);
    expect(r.meetings[0]!.cumulativeCuts).toBeCloseTo(0.6, 2);
    expect(r.meetings[1]!.holdPct).toBeCloseTo(100, 0);
  });

  it('solves consecutive meeting months (Sep, Oct, Nov 2027) without a free month between', () => {
    const meetings = upcomingMeetings('2027-08-01', 4); // Sep 15, Oct 27, Nov 17, Jan 26
    expect(meetings.map((m) => m.month)).toEqual(['2027-09', '2027-10', '2027-11', '2028-01']);
    const prices = pricesFor(meetings, [3.25, 3.0, 3.0, 3.0], '2027-08', '2028-02', 3.5);
    const r = fedWatch(meetings, prices)!;
    expect(r.meetings.map((m) => Math.round(m.expectedBp) || 0)).toEqual([-25, -25, 0, 0]);
  });

  it('stops at the first unpriced month and needs the first meeting', () => {
    const meetings = upcomingMeetings('2026-11-14', 4);
    const prices = pricesFor(meetings, [3.625, 3.625, 3.625, 3.625], '2026-11', '2027-03', 3.875);
    const r = fedWatch(meetings, prices)!;
    // April 2027 isn't priced: March solves forward, April drops.
    expect(r.meetings.map((m) => m.decision)).toEqual(['2026-12-09', '2027-01-27', '2027-03-17']);
    prices.delete('2026-12');
    expect(fedWatch(meetings, prices)).toBeNull();
    expect(fedWatch([], prices)).toBeNull();
  });

  it('uses the given EFFR when the month before has its own meeting', () => {
    // Early January 2027: December held the last change, so December isn't a clean anchor.
    const meetings = upcomingMeetings('2027-01-05', 2);
    const prices = pricesFor(meetings, [3.375, 3.375], '2027-01', '2027-04', 3.625);
    prices.set('2026-12', 100 - 3.7); // mixed month: must not be used
    const r = fedWatch(meetings, prices, { effr: 3.625 })!;
    expect(r.impliedNow).toBeCloseTo(3.625, 4);
    expect(Math.round(r.meetings[0]!.expectedBp)).toBe(-25);
    // Without an EFFR the start is solved back from February (meeting-free).
    const r2 = fedWatch(meetings, prices)!;
    expect(r2.impliedNow).toBeCloseTo(3.625, 4);
  });

  it('drops a late-month meeting it could only solve forward (noise blows up)', () => {
    // Sep 15 and Oct 27 2027; Nov 2027 holds a meeting of its own, and no later meeting is given.
    const meetings = upcomingMeetings('2027-08-01', 2);
    const prices = pricesFor(meetings, [4.75, 4.75], '2027-08', '2027-11', 4.75);
    // A 0.5 bp wobble in October's price: a forward solve (4 of 31 days left) would read it as ~+4 bp.
    prices.set('2027-10', prices.get('2027-10')! - 0.005);
    const r = fedWatch(meetings, prices)!;
    expect(r.meetings.map((m) => m.decision)).toEqual(['2027-09-15']);
    // Given the next meeting too, October solves back from it and stays put.
    const three = upcomingMeetings('2027-08-01', 3);
    const p3 = pricesFor(three, [4.75, 4.75, 4.75], '2027-08', '2027-12', 4.75);
    p3.set('2027-10', p3.get('2027-10')! - 0.005);
    const r3 = fedWatch(three, p3)!;
    expect(Math.abs(r3.meetings[1]!.expectedBp)).toBeLessThan(2);
  });

  it('ignores junk prices', () => {
    const meetings = upcomingMeetings('2026-11-14', 1);
    expect(fedWatch(meetings, new Map([['2026-11', 0], ['2026-12', 96], ['2027-01', 96]]))).toBeNull();
  });
});
