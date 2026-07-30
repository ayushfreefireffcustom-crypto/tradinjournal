// Journal header stats — entries count, this-month, current day-streak, and a
// "mindset mix" distribution bar of logged emotions. Inspired by Daylio's mood
// stats + Edgewonk's emotion tracking: makes the logbook feel alive, not a form.
import { useMemo } from 'react';
import { Fire } from '@phosphor-icons/react';
import type { JournalEntry } from '@/lib/api';

const POSITIVE = ['Disciplined', 'Confident', 'Patient'];
const ORDER = ['Disciplined', 'Confident', 'Patient', 'Hesitant', 'FOMO', 'Revenge'];
const EMO_COLOR: Record<string, string> = {
  Disciplined: '#08C465', Confident: '#3BD17E', Patient: '#8AD9AE',
  Hesitant: '#FF9F0A', FOMO: '#FE6B63', Revenge: '#FE3A31',
};

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeStreak(entries: JournalEntry[]): number {
  const days = new Set(entries.map(e => localDay(e.entryDate)));
  if (days.size === 0) return 0;
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  if (!days.has(fmt(cur))) cur.setDate(cur.getDate() - 1); // grace: still counts if you logged yesterday
  let streak = 0;
  while (days.has(fmt(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export default function JournalStats({ entries }: { entries: JournalEntry[] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = entries.filter(e => {
      const d = new Date(e.entryDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const counts = new Map<string, number>();
    for (const e of entries) if (e.emotion) counts.set(e.emotion, (counts.get(e.emotion) ?? 0) + 1);
    const totalEmo = [...counts.values()].reduce((a, b) => a + b, 0);
    const mix = ORDER.filter(e => counts.has(e)).map(e => ({ emotion: e, count: counts.get(e)!, pct: (counts.get(e)! / totalEmo) * 100 }));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    const positive = [...counts.entries()].filter(([e]) => POSITIVE.includes(e)).reduce((a, [, c]) => a + c, 0);
    const discipline = totalEmo ? Math.round((positive / totalEmo) * 100) : null;

    return { thisMonth, streak: computeStreak(entries), mix, top, discipline };
  }, [entries]);

  const tiles = [
    { label: 'This month', value: `${stats.thisMonth}`, sub: 'entries' },
    { label: 'Day streak', value: `${stats.streak}`, icon: true },
    { label: 'Top mindset', value: stats.top },
    { label: 'Discipline', value: stats.discipline === null ? '—' : `${stats.discipline}%`, accent: 'text-profit' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="rounded-[var(--radius-card)] border border-border-soft bg-surface/40 px-4 py-3">
            <div className="text-[9px] tracking-[0.18em] uppercase text-fg-3">{t.label}</div>
            <div className={`font-display font-black text-[22px] tracking-tight mt-1 flex items-baseline gap-1.5 ${t.accent ?? ''}`}>
              {t.icon && <Fire size={16} weight="fill" className="text-warning" />}
              <span className="numeric">{t.value}</span>
              {t.sub && <span className="text-fg-3 text-[11px] font-normal">{t.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {stats.mix.length > 0 && (
        <div>
          <div className="text-[9px] tracking-[0.2em] uppercase text-fg-3 mb-2">Mindset mix</div>
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-surface-active">
            {stats.mix.map(m => (
              <span key={m.emotion} title={`${m.emotion} · ${m.count}`} style={{ width: `${m.pct}%`, background: EMO_COLOR[m.emotion] }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
            {stats.mix.map(m => (
              <span key={m.emotion} className="flex items-center gap-1.5 text-[10px] text-fg-3">
                <span className="w-2 h-2 rounded-full" style={{ background: EMO_COLOR[m.emotion] }} />
                {m.emotion} <span className="text-fg-2 numeric">{m.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
