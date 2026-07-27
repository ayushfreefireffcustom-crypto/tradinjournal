'use client';

// Source picker — the "customize your feed" modal. Lists the outlet catalog
// grouped by category with checkboxes; saving replaces the user's preferred
// sources, which pins those outlets to the top of the feed.
import { useEffect, useMemo, useState } from 'react';
import { X, Check } from '@phosphor-icons/react';
import type { NewsSource, NewsCategory } from '@/lib/api';

const CATEGORY_ORDER: NewsCategory[] = ['CRYPTO', 'MACRO', 'MARKETS', 'REGULATORY', 'GEOPOLITICAL'];

export default function SourcePicker({
  catalog,
  initial,
  saving,
  onSave,
  onClose,
}: {
  catalog: NewsSource[];
  initial: string[];
  saving?: boolean;
  onSave: (next: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const by = new Map<NewsCategory, NewsSource[]>();
    for (const s of catalog) {
      const arr = by.get(s.category) ?? [];
      arr.push(s);
      by.set(s.category, arr);
    }
    return CATEGORY_ORDER.filter(c => by.has(c)).map(c => [c, by.get(c)!] as const);
  }, [catalog]);

  const toggle = (key: string) =>
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="source-picker">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85dvh] flex flex-col rounded-[var(--radius-card)] border border-border-strong bg-app shadow-2xl fade-up">
        <div className="shrink-0 flex items-start justify-between gap-3 p-5 pb-3 border-b border-border-soft">
          <div>
            <h2 className="font-display font-bold text-[16px] tracking-tight text-fg">Customize your feed</h2>
            <p className="text-[11.5px] text-fg-3 mt-1">Pick the outlets you follow — their headlines pin to the top.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 -mt-1 -mr-1 rounded-md border border-border-soft flex items-center justify-center text-fg-3 hover:text-fg hover:border-border-strong transition-colors">
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {groups.map(([cat, sources]) => (
            <div key={cat}>
              <div className="text-[9px] tracking-[0.2em] uppercase text-fg-3 mb-2">{cat}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {sources.map(s => {
                  const on = sel.has(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggle(s.key)}
                      data-testid={`source-opt-${s.key}`}
                      className={`flex items-center gap-2.5 rounded-[var(--radius-btn)] border px-3 py-2 text-left transition-colors ${
                        on ? 'border-profit/40 bg-profit/10 text-fg' : 'border-border-soft text-fg-2 hover:border-border-strong'
                      }`}
                    >
                      <span className={`shrink-0 w-4 h-4 rounded-[4px] border flex items-center justify-center ${on ? 'bg-profit border-profit text-black' : 'border-border-strong'}`}>
                        {on && <Check size={11} weight="bold" />}
                      </span>
                      <span className="text-[13px] font-medium truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 flex items-center gap-3 p-4 border-t border-border-soft">
          <span className="text-[11px] text-fg-3">{sel.size} selected</span>
          {sel.size > 0 && (
            <button onClick={() => setSel(new Set())} className="text-[11px] text-fg-3 hover:text-fg transition-colors">Clear all</button>
          )}
          <button
            onClick={() => onSave([...sel])}
            disabled={saving}
            data-testid="source-picker-save"
            className="ml-auto btn btn-primary py-2 px-4 text-[12px] rounded-[var(--radius-btn)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
