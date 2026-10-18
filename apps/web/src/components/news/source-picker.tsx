'use client';

// Source picker — the "customize your feed" modal. Lists the outlet catalog
// grouped by category with checkboxes; saving replaces the user's preferred
// sources, which pins those outlets to the top of the feed.
import { useEffect, useMemo, useState } from 'react';
import { IClose, ICheck } from '@/components/v3/icons';
import type { NewsSource, NewsCategory } from '@/lib/api';

const CATEGORY_ORDER: NewsCategory[] = ['CRYPTO', 'MACRO', 'MARKETS', 'REGULATORY', 'GEOPOLITICAL'];

export default function SourcePicker({
  catalog,
  initial,
  saving,
  error,
  onSave,
  onClose,
}: {
  catalog: NewsSource[];
  initial: string[];
  saving?: boolean;
  error?: string;
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

  const CAT: Record<string, string> = { CRYPTO: 'Crypto', MACRO: 'Macro', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory', MARKETS: 'Markets' };
  return (
    <div className="v3 v3-modal" role="dialog" aria-modal="true" aria-labelledby="sp-t" data-testid="source-picker">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className="v3-modal-card">
        <header className="v3-modal-hd">
          <div><small>Your feed</small><h2 id="sp-t">Choose your sources</h2><p>Headlines from these outlets pin to the top.</p></div>
          <button onClick={onClose} aria-label="Close" className="v3-modal-x" style={{ marginLeft: 'auto' }}><IClose size={16} /></button>
        </header>
        <div className="v3-modal-bd sp-bd">
          {groups.map(([cat, sources]) => (
            <div key={cat} className="sp-g">
              <h4>{CAT[cat] ?? cat}</h4>
              <div className="sp-grid">
                {sources.map(s => {
                  const on = sel.has(s.key);
                  return (
                    <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s.key)} data-testid={`source-opt-${s.key}`} className="sp-opt">
                      <span className="box">{on && <ICheck size={13} />}</span><span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <footer className="v3-modal-ft" style={{ justifyContent: 'flex-start', gap: 12 }}>
          {error ? <span className="r-err" style={{ margin: 0 }} data-testid="source-picker-error">{error}</span> : <span className="mute" style={{ fontSize: 14 }}>{sel.size} selected</span>}
          {sel.size > 0 && <button onClick={() => setSel(new Set())} className="v3-link" style={{ margin: 0 }}>Clear</button>}
          <button onClick={() => onSave([...sel])} disabled={saving} data-testid="source-picker-save" className="v3-btn v3-btn--ink" style={{ marginLeft: 'auto', paddingRight: 18 }}>{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </div>
    </div>
  );
}
