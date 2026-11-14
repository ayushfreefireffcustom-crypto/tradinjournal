'use client';

// The trade's journal note, on the existing journal API: read it, edit it,
// save it. "Draft note" asks the existing AI coach for at most two sentences
// built only from the computed facts; the draft goes into the editor and is
// never saved until you press Save.
import { useEffect, useRef, useState } from 'react';
import { CaretDown, CaretUp, PencilSimple } from '@phosphor-icons/react';
import Link from '@/components/v6/ui/link';
import { api, type JournalEntry } from '@/lib/api';
import { tagTone } from '@/lib/desk';
import { draftPrompt, twoSentences } from '@/lib/trade-review-api';
import { useToast } from '@/components/toast';
import { AiMark } from '@/components/dashboard-v2/ui';

const NEGATIVE = ['FOMO', 'Revenge', 'Hesitant'];

export default function JournalNote({ accountId, positionId, entry, onSaved, facts, entryDate }: {
  accountId: string; positionId: string; entry: JournalEntry | null; onSaved: (e: JournalEntry) => void;
  /** Computed facts for the coach (null until the review has loaded). */
  facts: string | null;
  /** Date to file a new note under (the trade's close or open). */
  entryDate: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(entry?.body ?? '');
  const [drafted, setDrafted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(entry?.body ?? ''); setDrafted(false); }, [entry?.id, entry?.body, positionId]);
  useEffect(() => () => ctl.current?.abort(), []);
  const dirty = text.trim() !== (entry?.body ?? '').trim();

  const draft = async () => {
    if (!facts) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setOpen(true);
    setDrafting(true);
    let out = '';
    try {
      await api.ai.chat({ accountId, messages: [{ role: 'user', content: draftPrompt(facts).slice(0, 3900) }] }, tok => { out += tok; }, {
        signal: c.signal, onError: m => { if (!out) toast.error(m); },
      });
      if (c.signal.aborted) return;
      const s = twoSentences(out);
      if (s) {
        setText(prev => (prev.trim() ? `${prev.trim()}\n\n${s}` : s));
        setDrafted(true);
        requestAnimationFrame(() => area.current?.focus());
      } else toast.error('The coach had no draft. Try again.');
    } catch (err) {
      if (!c.signal.aborted) toast.error(err instanceof Error ? err.message : 'The coach is unavailable right now.');
    } finally { if (ctl.current === c) setDrafting(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = entry
        ? await api.journal.update(entry.id, { body: text })
        : await api.journal.create({ body: text, tradeId: positionId, brokerAccountId: accountId, entryDate });
      onSaved(saved);
      setDrafted(false);
      setOpen(false);
      toast.success('Note saved');
    } catch (err) {
      toast.error(`Couldn’t save · ${err instanceof Error ? err.message : 'try again'}`);
    } finally { setSaving(false); }
  };

  const journalHref = `/journal?trade=${encodeURIComponent(positionId)}`;
  const hasTags = !!(entry?.emotion || entry?.tags?.length);
  const preview = (text || '').replace(/\s+/g, ' ').trim();

  return (
    <section className={`d2-card trv-jr${open ? ' open' : ''}`} data-testid="trade-journal" aria-label="Journal note">
      <div className="trv-jrow">
        {drafted ? <AiMark /> : null}
        <span className="trv-jt" data-testid="journal-preview">
          <b>{drafted ? 'Journal draft:' : 'Journal note:'}</b>{' '}
          {preview ? preview : <span className="trv-muted">No note yet. A line on why you took it, and whether you followed the plan.</span>}
        </span>
        <div className="trv-jb">
          <button type="button" className="d2-fp" onClick={draft} disabled={!facts || drafting} data-testid="draft-note" data-ai>
            {drafting ? 'Drafting…' : 'Draft note'}
          </button>
          <button type="button" className="d2-fp" onClick={() => { setOpen(o => !o); if (!open) requestAnimationFrame(() => area.current?.focus()); }} aria-expanded={open} data-testid="journal-expand">
            {open ? <CaretUp size={12} /> : preview ? <CaretDown size={12} /> : <PencilSimple size={12} />}{open ? 'Collapse' : preview ? 'Expand' : 'Write'}
          </button>
          <button type="button" className="x-btn x-btn--hi x-btn--sm trv-save" onClick={save} disabled={saving || !dirty || !text.trim()} data-testid="journal-save">{saving ? 'Saving…' : 'Save note'}</button>
        </div>
      </div>
      {open && (
        <div className="trv-jed">
          {hasTags && (
            <div className="trv-jtags">
              {entry?.emotion && <span className={`trv-jtag ${NEGATIVE.includes(entry.emotion) || tagTone(entry.emotion) === 'r' ? 'dn' : tagTone(entry.emotion) === 'g' ? 'up' : ''}`}>{entry.emotion}</span>}
              {(entry?.tags ?? []).map(t => <span key={t} className={`trv-jtag ${tagTone(t) === 'g' ? 'up' : tagTone(t) === 'r' ? 'dn' : ''}`}>{t}</span>)}
            </div>
          )}
          <textarea ref={area} value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={50_000} placeholder="Why you took it, what you saw, whether you followed the plan…" aria-label="Note" data-testid="journal-text" />
          <div className="trv-jf">
            <span className="trv-muted">{drafted ? 'Drafted by the coach from this trade’s numbers. Edit it before you save.' : entry ? 'Saved in your journal.' : 'Saved to your journal, linked to this trade.'}</span>
            <Link href={journalHref} className="d2-wl">Tags &amp; emotions in Journal</Link>
            {dirty && <button type="button" className="d2-fp" onClick={() => { setText(entry?.body ?? ''); setDrafted(false); }}>Discard</button>}
          </div>
        </div>
      )}
    </section>
  );
}
