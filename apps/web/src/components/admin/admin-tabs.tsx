'use client';

export type AdminTab = 'overview' | 'users' | 'access' | 'system';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'access', label: 'Access' },
  { id: 'system', label: 'System' },
];

export function AdminTabs({ tab, onChange }: { tab: AdminTab; onChange: (t: AdminTab) => void }) {
  return (
    <div className="x-tabs ad-tabs" role="tablist" aria-label="Admin sections" data-testid="admin-tabs">
      {TABS.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onChange(t.id)} data-testid={`admin-tab-${t.id}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
