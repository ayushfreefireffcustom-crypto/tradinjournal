'use client';

// Emotion picker and tag editor shared by chart replay and the notebook.
import { IClose, IPlus } from '@/components/v6/icons';
import '@/styles/v6/journal.css';

export const POSITIVE_EMOTIONS = ['Disciplined', 'Confident', 'Patient'];
export const tagLabel = (t: string) => `#${t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')}`;
const BAD_TAG = /revenge|fomo|tilt|hold.?loser|mistake|overtrad|chase|moved.?stop|greed|fear/i;
export const tagClass = (t: string) => `x-tag ${BAD_TAG.test(t) ? 'x-tag--r' : ''}`;

export function EmotionChips({ options, value, onChange, label = 'Emotion' }: { options: string[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="jn-chips" role="group" aria-label={label}>
      {options.map(e => {
        const on = value === e;
        const tone = POSITIVE_EMOTIONS.includes(e) ? 'x-tag--g' : 'x-tag--r';
        return (
          <button key={e} type="button" aria-pressed={on} className={`x-tag jn-chip ${on ? tone : ''}`} onClick={() => onChange(on ? '' : e)} data-testid={`emotion-${e.toLowerCase()}`}>
            {on && <i className="jn-chip-dot" aria-hidden />}{e}
          </button>
        );
      })}
    </div>
  );
}

export function TagEditor({ tags, onRemove, draft, setDraft, onCommit, placeholder }: {
  tags: string[]; onRemove: (t: string) => void; draft: string | null; setDraft: (v: string | null) => void; onCommit: () => void; placeholder: string;
}) {
  return (
    <div className="jn-chips">
      {tags.map(t => (
        <button key={t} type="button" className={`${tagClass(t)} jn-chip jn-chip--x`} onClick={() => onRemove(t)} data-testid={`tag-${t.toLowerCase()}`} aria-label={`Remove ${tagLabel(t)}`}>
          {tagLabel(t)}<IClose size={12} />
        </button>
      ))}
      {draft !== null ? (
        <input autoFocus className="jn-tagin" value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder} aria-label="New tag"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onCommit(); } if (e.key === 'Escape') setDraft(null); }}
          onBlur={onCommit} data-testid="tag-draft-input" />
      ) : (
        <button type="button" className="x-btn x-btn--dash x-btn--sm jn-add" onClick={() => setDraft('')} data-testid="add-tag"><IPlus size={13} />Add tag</button>
      )}
    </div>
  );
}
