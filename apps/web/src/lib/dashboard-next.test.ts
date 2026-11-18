import { describe, expect, it } from 'vitest';
import type { DashRecentTrade, LeakDTO } from '@/lib/dashboard-v2-api';
import { brokeLine, dayPossessive, pickNextUp } from './dashboard-next';

const NOW = new Date(2026, 10, 18, 19, 0).getTime(); // Wed 18 Nov 2026, 19:00 local
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();
const t = (id: string, day: number, h: number, reasons: string[] = [], grade: DashRecentTrade['grade'] = reasons.length ? 'C' : 'A'): DashRecentTrade =>
  ({ id, symbol: 'NAS100', side: 'LONG', openTime: at(day, h - 1), closeTime: at(day, h), net: 10, r: null, grade, reasons });
const leak: LeakDTO = { key: 'revenge', label: 'Revenge trades', sub: '15 · ≤15 min after a loss', trades: 15, wins: 4, net: -1281 };

describe('pickNextUp', () => {
  it('reviews the latest day when a trade there broke a rule', () => {
    const n = pickNextUp({ recent: [t('c', 17, 16, ['Past −1.25R']), t('b', 17, 12), t('a', 17, 9, ['Your rule: FOMO', 'Past −1.25R']), t('z', 14, 9)], leaks: { rows: [leak] } }, NOW);
    expect(n).toMatchObject({ kind: 'review', day: "yesterday's", count: 3, partial: false, flagged: 2, href: '/trades/a' });
    expect(n?.kind === 'review' && n.reasons).toEqual(['Past −1.25R', 'FOMO']);
    expect(n?.kind === 'review' && brokeLine(n)).toBe('Two broke a rule');
  });
  it('says "of the latest" when the whole list is one day (there may be more)', () => {
    const recent = ['f', 'e', 'd', 'c', 'b', 'a'].map((id, i) => t(id, 18, 17 - i, i === 0 ? ['Oversized'] : []));
    const n = pickNextUp({ recent, leaks: { rows: [] } }, NOW);
    expect(n).toMatchObject({ kind: 'review', day: "today's", count: 6, partial: true });
    expect(n?.kind === 'review' && brokeLine(n)).toBe('One of the latest 6 broke a rule');
  });
  it('falls back to the biggest leak when the latest day was clean or old', () => {
    expect(pickNextUp({ recent: [t('a', 18, 9)], leaks: { rows: [leak] } }, NOW)).toMatchObject({ kind: 'leak', key: 'revenge', net: -1281 });
    expect(pickNextUp({ recent: [t('a', 2, 9, ['Oversized'])], leaks: { rows: [leak] } }, NOW)).toMatchObject({ kind: 'leak' });
  });
  it('has nothing to say without flags or leaks', () => {
    expect(pickNextUp({ recent: [t('a', 18, 9)], leaks: { rows: [] } }, NOW)).toBeNull();
    expect(pickNextUp({ recent: [], leaks: { rows: [] } }, NOW)).toBeNull();
  });
  it('names the day', () => {
    expect(dayPossessive(new Date(2026, 10, 16, 10).getTime(), NOW)).toBe("Monday's");
    expect(dayPossessive(new Date(2026, 10, 1, 10).getTime(), NOW)).toBe("your last session's");
  });
});
