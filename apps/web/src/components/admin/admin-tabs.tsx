'use client';

export type AdminTab = 'overview' | 'users' | 'access' | 'system';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'users', label: 'USERS' },
  { id: 'access', label: 'ACCESS' },
  { id: 'system', label: 'SYSTEM' },
];

export function AdminTabs({
  tab,
  onChange,
}: {
  tab: AdminTab;
  onChange: (t: AdminTab) => void;
}) {
  return (
    <div
      className="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-5 px-3 sm:px-4 lg:px-5 py-2 bg-app/90 backdrop-blur-xl border-b border-border"
      data-testid="admin-tabs"
    >
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`shrink-0 px-3 sm:px-4 py-2 text-[10px] tracking-[0.2em] rounded-md border transition-colors ${
              tab === t.id
                ? 'border-fg bg-surface text-fg'
                : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
