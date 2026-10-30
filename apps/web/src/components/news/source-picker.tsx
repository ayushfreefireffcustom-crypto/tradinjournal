'use client';

// Source picker: the "customize your feed" modal. Lists the outlet catalog
// grouped by category with checkboxes; saving replaces the user's preferred
// sources, which pins those outlets to the top of the feed.
import { useMemo, useState } from 'react';
import { ICheck } from '@/components/v3/icons';
import MkDialog, { MkClose } from '@/components/v6/markets/dialog';
import type { NewsSource, NewsCategory } from '@/lib/api';

const CATEGORY_ORDER: NewsCategory[] = ['CRYPTO', 'MACRO', 'MARKETS', 'REGULATORY', 'GEOPOLITICAL'];
const CAT: Record<string, string> = { CRYPTO: 'Crypto', MACRO: 'Macro', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory', MARKETS: 'Markets' };

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
    <MkDialog onClose={onClose} labelledBy="mk-sp-t" testId="source-picker" className="mk-dlg--wide">
      <div className="mk-dh">
        <div className="mk-dh-m">
          <h2 id="mk-sp-t">Choose your sources</h2>
          <p className="x-muted">Headlines from these outlets pin to the top of your feed.</p>
        </div>
        <MkClose onClose={onClose} />
      </div>
      <div className="mk-dbody">
        {groups.length === 0 && <p className="mk-none">The outlet list isn’t available right now.</p>}
        {groups.map(([cat, sources]) => (
          <div key={cat} className="mk-sp-g">
            <h4>{CAT[cat] ?? cat}</h4>
            <div className="mk-sp-grid">
              {sources.map(s => {
                const on = sel.has(s.key);
                return (
                  <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s.key)} data-testid={`source-opt-${s.key}`} className="mk-sp-opt">
                    <span className="mk-sp-box" aria-hidden>{on && <ICheck size={12} />}</span><span className="mk-ell">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mk-dfoot mk-dfoot--split">
        {error ? <span className="mk-err" role="alert" data-testid="source-picker-error">{error}</span> : <span className="x-muted">{sel.size} selected</span>}
        {sel.size > 0 && <button onClick={() => setSel(new Set())} className="x-btn x-btn--sm x-btn--ghost">Clear</button>}
        <button onClick={() => onSave([...sel])} disabled={saving} data-testid="source-picker-save" className="x-btn x-btn--hi mk-push">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </MkDialog>
  );
}
