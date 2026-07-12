'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';
import { useToast } from '@/components/toast';
import EmptyState from '@/components/empty-state';
import { NotePencil } from '@phosphor-icons/react';

const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const NEGATIVE = ['FOMO', 'Revenge', 'Hesitant'];

function emotionClass(e: string, active: boolean): string {
  const base = 'transition-colors duration-[var(--dur-hover)] press focus-ring';
  if (!active) return `${base} border-border-soft text-fg-3 hover:text-fg hover:border-border-strong`;
  return `${base} ${NEGATIVE.includes(e) ? 'bg-loss/15 border-loss text-loss' : 'bg-profit/15 border-profit text-profit'}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// yyyy-mm-dd for <input type="date">, in local time
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

interface Draft {
  id: string | null;
  title: string;
  body: string;
  emotion: string;
  tags: string[];
  entryDate: string; // yyyy-mm-dd
}

function emptyDraft(): Draft {
  return { id: null, title: '', body: '', emotion: '', tags: [], entryDate: toDateInput(new Date().toISOString()) };
}

export default function NotebookPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const initAccounts = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { initAccounts(); }, [initAccounts]);

  // The notebook is a global logbook: load every entry for the user, not just
  // the selected account's, so standalone notes are never hidden.
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await api.journal.list());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => +new Date(b.entryDate) - +new Date(a.entryDate)),
    [entries],
  );

  const accountName = useCallback(
    (id: string | null) => (id ? accounts.find(a => a.id === id)?.broker ?? null : null),
    [accounts],
  );

  const isEditing = draft.id !== null;

  function startNew() {
    setDraft(emptyDraft());
    setTagDraft(null);
  }

  function startEdit(e: JournalEntry) {
    setDraft({
      id: e.id,
      title: e.title ?? '',
      body: e.body,
      emotion: e.emotion ?? '',
      tags: e.tags ?? [],
      entryDate: toDateInput(e.entryDate),
    });
    setTagDraft(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function commitTagDraft() {
    const t = tagDraft?.trim();
    if (t && !draft.tags.includes(t)) setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    setTagDraft(null);
  }

  async function handleSave() {
    if (!draft.body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: draft.title.trim() || undefined,
        body: draft.body,
        emotion: draft.emotion || undefined,
        tags: draft.tags,
        entryDate: new Date(draft.entryDate).toISOString(),
      };
      const saved = draft.id
        ? await api.journal.update(draft.id, payload)
        : await api.journal.create({ ...payload, brokerAccountId: selected?.id });
      setEntries(prev => {
        const rest = prev.filter(e => e.id !== saved.id);
        return [saved, ...rest];
      });
      toast.success(draft.id ? 'Entry updated' : 'Entry saved');
      startNew();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
      toast.error('Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this journal entry? This cannot be undone.')) return;
    setDeletingId(id);
    setError('');
    try {
      await api.journal.delete(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      if (draft.id === id) startNew();
      toast.success('Entry deleted');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
      toast.error('Failed to delete entry');
    } finally {
      setDeletingId(null);
    }
  }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    setSelected(a);
    setShowConnect(false);
  }

  function exportCsv() {
    const headers = ['Date', 'Title', 'Emotion', 'Tags', 'Trade ID', 'Account', 'Body'];
    const rows = sorted.map(e => [
      e.entryDate, e.title ?? '', e.emotion ?? '', (e.tags ?? []).join('; '),
      e.tradeId ?? '', accountName(e.brokerAccountId) ?? '', e.body,
    ]);
    downloadCsv(`tradelogs-journal-${dateStamp()}.csv`, toCsv(headers, rows));
    toast.success(`Exported ${sorted.length} entries to CSV`);
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Journal"
      pageSubtitle="// TRADING LOGBOOK"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="notebook-page">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">[ JOURNAL // LOGBOOK ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">{entries.length} ENTRIES</h1>
            <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest mt-1">FREEFORM NOTES · REVIEWS · TRADE PLANS</div>
          </div>
          <button
            onClick={exportCsv}
            disabled={entries.length === 0}
            data-testid="export-csv"
            className="btn btn-ghost py-2 text-[10px] tracking-[0.22em] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↓ EXPORT CSV
          </button>
        </div>

        {error && (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 text-[12px]" data-testid="notebook-error">
            <span className="text-loss">{error}</span>
            <button onClick={loadEntries} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        <div className="grid grid-cols-12 gap-3">
          {/* Composer */}
          <section className="col-span-12 lg:col-span-5 xl:col-span-4">
            <div className="tcard p-0 lg:sticky lg:top-4" data-testid="notebook-composer">
              <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">{isEditing ? 'EDIT_ENTRY' : 'NEW_ENTRY'}</div>
                {isEditing && (
                  <button onClick={startNew} data-testid="composer-cancel" className="text-[10px] tracking-widest text-fg-3 hover:text-fg">
                    + NEW
                  </button>
                )}
              </div>

              <div className="p-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-widest text-fg-3">DATE</span>
                  <input
                    type="date"
                    value={draft.entryDate}
                    onChange={e => setDraft(d => ({ ...d, entryDate: e.target.value }))}
                    data-testid="composer-date"
                    className="tinput"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-widest text-fg-3">TITLE · OPTIONAL</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                    placeholder="e.g. London session review"
                    data-testid="composer-title"
                    className="tinput"
                  />
                </label>

                <div>
                  <div className="text-[10px] tracking-widest text-fg-3 mb-2">EMOTION · OPTIONAL</div>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOTIONS.map(e => (
                      <button
                        key={e}
                        onClick={() => setDraft(d => ({ ...d, emotion: d.emotion === e ? '' : e }))}
                        data-testid={`composer-emotion-${e.toLowerCase()}`}
                        className={`px-2.5 py-1 text-[10px] tracking-widest border transition-colors ${emotionClass(e, draft.emotion === e)}`}
                      >
                        {e.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-widest text-fg-3 mb-2">TAGS · OPTIONAL</div>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.tags.map(t => (
                      <button
                        key={t}
                        onClick={() => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))}
                        title="Remove tag"
                        data-testid={`composer-tag-${t.toLowerCase()}`}
                        className="px-2 py-1 text-[10px] tracking-widest border border-border-soft text-fg-2 hover:border-loss hover:text-loss"
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                    {tagDraft !== null ? (
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={e => setTagDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitTagDraft(); }
                          if (e.key === 'Escape') setTagDraft(null);
                        }}
                        onBlur={commitTagDraft}
                        placeholder="Tag name…"
                        data-testid="composer-tag-input"
                        className="px-2 py-1 text-[10px] tracking-widest border border-border-strong bg-transparent text-fg w-24 focus:outline-none"
                      />
                    ) : (
                      <button onClick={() => setTagDraft('')} data-testid="composer-add-tag" className="px-2 py-1 text-[10px] tracking-widest border border-dashed border-border-strong text-fg-3 hover:text-fg">
                        + ADD
                      </button>
                    )}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-widest text-fg-3">NOTES</span>
                  <textarea
                    value={draft.body}
                    onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                    placeholder="What happened, what you saw, what you'll do differently…"
                    data-testid="composer-body"
                    className="tinput min-h-[160px] resize-y leading-relaxed"
                  />
                </label>

                <button
                  onClick={handleSave}
                  disabled={saving || !draft.body.trim()}
                  data-testid="composer-save"
                  className={`btn btn-primary justify-center py-2.5 text-[11px] tracking-[0.22em] ${saving || !draft.body.trim() ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {saving ? 'SAVING…' : isEditing ? 'UPDATE ENTRY' : 'SAVE ENTRY'}
                </button>
              </div>
            </div>
          </section>

          {/* Entries list */}
          <section className="col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-3" data-testid="notebook-list">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="tcard p-5 h-28 animate-pulse bg-surface" />
              ))
            ) : sorted.length === 0 ? (
              <div className="tcard" data-testid="notebook-empty">
                <EmptyState icon={NotePencil} title="No journal entries yet" hint="Capture your trade rationale, emotions and lessons — write your first note on the left." />
              </div>
            ) : (
              sorted.map(e => {
                const acc = accountName(e.brokerAccountId);
                return (
                  <article key={e.id} className="tcard tcard-hover p-4 sm:p-5" data-testid={`entry-${e.id}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-[10px] tracking-widest text-fg-3">
                          <span className="numeric">{fmtDate(e.entryDate)}</span>
                          {e.tradeId && <span className="text-fg-2">· TRADE #{e.tradeId}</span>}
                          {acc && <span className="text-fg-2">· {acc.toUpperCase()}</span>}
                        </div>
                        {e.title && <h3 className="font-display font-bold text-[16px] tracking-tight mt-1.5">{e.title}</h3>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.emotion && (
                          <span className={`px-2 py-1 text-[9px] tracking-widest border ${NEGATIVE.includes(e.emotion) ? 'border-loss/50 text-loss' : 'border-profit/50 text-profit'}`}>
                            {e.emotion.toUpperCase()}
                          </span>
                        )}
                        <button
                          onClick={() => startEdit(e)}
                          data-testid={`entry-edit-${e.id}`}
                          className="px-2 py-1 rounded text-[9px] tracking-widest border border-border-soft text-fg-3 hover:text-fg hover:border-border-strong transition-colors duration-[var(--dur-hover)] press focus-ring"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deletingId === e.id}
                          data-testid={`entry-delete-${e.id}`}
                          className="px-2 py-1 rounded text-[9px] tracking-widest border border-border-soft text-fg-3 hover:text-loss hover:border-loss transition-colors duration-[var(--dur-hover)] press focus-ring disabled:opacity-50"
                        >
                          {deletingId === e.id ? '…' : 'DEL'}
                        </button>
                      </div>
                    </div>

                    {e.body && (
                      <p className="text-[13px] text-fg-2 leading-relaxed mt-3 whitespace-pre-wrap break-words">{e.body}</p>
                    )}

                    {e.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {e.tags.map(t => (
                          <span key={t} className="px-2 py-0.5 text-[9px] tracking-widest border border-border-soft text-fg-3">{t.toUpperCase()}</span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </div>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
