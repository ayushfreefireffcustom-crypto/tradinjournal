'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';
import { useToast } from '@/components/toast';
import { IDownload, IClose, ISearch, IJournal } from '@/components/v3/icons';
import { EmotionChips, POSITIVE_EMOTIONS, TagEditor, tagClass, tagLabel } from '@/components/v6/journal/chips';
import JournalViewSwitch from '@/components/v6/journal/view-switch';
import '@/styles/v6/journal.css';

const EMOTIONS = ['Disciplined', 'Patient', 'Confident', 'FOMO', 'Revenge', 'Hesitant'];
// Mindset mix: calm emotions in the green family, reactive ones in red, strongest first.
const MIX: Record<string, { c: string; o: number }> = {
  Disciplined: { c: 'var(--g)', o: 1 }, Patient: { c: 'var(--g)', o: 0.7 }, Confident: { c: 'var(--g)', o: 0.45 },
  Revenge: { c: 'var(--r)', o: 1 }, FOMO: { c: 'var(--r)', o: 0.7 }, Hesitant: { c: 'var(--r)', o: 0.45 },
};

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function toDateInput(iso: string) { return localDay(new Date(iso)); }
function fromDateInput(v: string) { const [y, m, d] = v.split('-').map(Number); return new Date(y!, m! - 1, d!, 12).toISOString(); }
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

interface Draft { id: string | null; title: string; body: string; emotion: string; tags: string[]; entryDate: string }
const emptyDraft = (): Draft => ({ id: null, title: '', body: '', emotion: '', tags: [], entryDate: localDay(new Date()) });

function streak(entries: JournalEntry[]) {
  const days = new Set(entries.map(e => localDay(new Date(e.entryDate))));
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  if (!days.has(localDay(cur))) cur.setDate(cur.getDate() - 1); // still counts if you logged yesterday
  let n = 0;
  while (days.has(localDay(cur))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

/** Journal › Notes: the free-form logbook (was /notebook). */
export default function NotesView() {
  const toast = useToast();
  const { accounts, selected, select, setAccounts } = useAccounts();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [emoFilter, setEmoFilter] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // The notebook is a global logbook: every entry for the user, not just the
  // selected account's, so standalone notes are never hidden.
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setEntries(await api.journal.list()); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load journal entries'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const sorted = useMemo(() => [...entries].sort((a, b) => +new Date(b.entryDate) - +new Date(a.entryDate)), [entries]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sorted.filter(e => (!emoFilter || e.emotion === emoFilter) && (!s || `${e.title ?? ''} ${e.body} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(s)));
  }, [sorted, q, emoFilter]);
  const accountName = useCallback((id: string | null) => (id ? accounts.find(a => a.id === id)?.broker ?? null : null), [accounts]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = entries.filter(e => { const d = new Date(e.entryDate); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    const counts = new Map<string, number>();
    for (const e of entries) if (e.emotion) counts.set(e.emotion, (counts.get(e.emotion) ?? 0) + 1);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const mix = EMOTIONS.filter(e => counts.has(e)).map(e => ({ e, n: counts.get(e)!, pct: (counts.get(e)! / total) * 100 }));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const calm = [...counts.entries()].filter(([e]) => POSITIVE_EMOTIONS.includes(e)).reduce((a, [, c]) => a + c, 0);
    return { thisMonth, streak: streak(entries), mix, top: top?.[0] ?? null, topPct: top && total ? Math.round((top[1] / total) * 100) : 0, discipline: total ? Math.round((calm / total) * 100) : null };
  }, [entries]);

  const isEditing = draft.id !== null;
  const startNew = () => { setDraft(emptyDraft()); setTagDraft(null); };
  function startEdit(e: JournalEntry) {
    setDraft({ id: e.id, title: e.title ?? '', body: e.body, emotion: e.emotion ?? '', tags: e.tags ?? [], entryDate: toDateInput(e.entryDate) });
    setTagDraft(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => bodyRef.current?.focus({ preventScroll: true }), 350);
  }
  function commitTagDraft() {
    const t = tagDraft?.trim().replace(/^#/, '');
    if (t && !draft.tags.some(x => x.toLowerCase() === t.toLowerCase())) setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    setTagDraft(null);
  }

  async function handleSave() {
    if (!draft.body.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = { title: draft.title.trim() || undefined, body: draft.body, emotion: draft.emotion || undefined, tags: draft.tags, entryDate: fromDateInput(draft.entryDate) };
      const saved = draft.id ? await api.journal.update(draft.id, payload) : await api.journal.create({ ...payload, brokerAccountId: selected?.id });
      setEntries(prev => [saved, ...prev.filter(e => e.id !== saved.id)]);
      setFlash(saved.id);
      toast.success(draft.id ? 'Entry updated' : 'Entry saved');
      startNew();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
      toast.error('Failed to save entry');
    } finally { setSaving(false); }
  }
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1600); return () => clearTimeout(t); }, [flash]);

  async function handleDelete(id: string) {
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
    } finally { setDeletingId(null); setConfirmDel(null); }
  }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a);
    setShowConnect(false);
  }

  function exportCsv() {
    const headers = ['Date', 'Title', 'Emotion', 'Tags', 'Trade ID', 'Account', 'Body'];
    const rows = sorted.map(e => [e.entryDate, e.title ?? '', e.emotion ?? '', (e.tags ?? []).join('; '), e.tradeId ?? '', accountName(e.brokerAccountId) ?? '', e.body]);
    downloadCsv(`tradelogs-journal-${dateStamp()}.csv`, toCsv(headers, rows));
    toast.success(`Exported ${sorted.length} entries to CSV`);
  }

  const actions = (
    <>
      <JournalViewSwitch view="notes" />
      <button className="x-btn" onClick={exportCsv} disabled={entries.length === 0} title={entries.length === 0 ? 'Nothing to export yet' : undefined} data-testid="export-csv">
        <IDownload size={15} /><span>Export CSV</span>
      </button>
    </>
  );
  const subtitle = loading ? 'Your trading logbook' : <><span className="m">{entries.length}</span> {entries.length === 1 ? 'entry' : 'entries'} · your trading logbook</>;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Journal" pageSubtitle={subtitle} actions={actions}>
      <div className="jn-page" data-testid="notebook-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="notebook-error">
            <span>{error}</span><button className="x-btn x-btn--sm" onClick={loadEntries}>Retry</button>
          </div>
        )}

        {/* Stats only once there's something to count (zero-data rule, A0.29). */}
        {!loading && entries.length > 0 && <section className="x-strip x-strip--card jn-stats" style={{ ['--n' as string]: 5 }} aria-label="Journal stats">
          <div><span>This month</span><b className="m">{loading ? '—' : stats.thisMonth}</b><small>entr{stats.thisMonth === 1 ? 'y' : 'ies'}</small></div>
          <div><span>Day streak</span><b className="m">{loading ? '—' : stats.streak}</b><small>{stats.streak ? `day${stats.streak === 1 ? '' : 's'} in a row` : 'Write today to start one'}</small></div>
          <div><span>Top mindset</span><b>{stats.top ?? '—'}</b><small>{stats.top ? `${stats.topPct}% of tagged entries` : 'Tag an emotion to see this'}</small></div>
          <div><span>Discipline</span><b className={`m ${stats.discipline != null ? (stats.discipline >= 50 ? 'pos' : 'neg') : ''}`}>{stats.discipline == null ? '—' : `${stats.discipline}%`}</b><small>calm vs reactive</small></div>
          <div className="jn-mix">
            <span>Mindset mix</span>
            <div className="jn-mixbar" role="group" aria-label={stats.mix.map(m => `${m.e} ${m.n}`).join(', ') || 'No emotions logged'}>
              {stats.mix.map(m => (
                <button key={m.e} style={{ width: `${m.pct}%`, background: MIX[m.e]!.c, opacity: MIX[m.e]!.o }} title={`${m.e} · ${m.n}`} aria-label={`Filter by ${m.e}`} aria-pressed={emoFilter === m.e}
                  className={emoFilter && emoFilter !== m.e ? 'dim' : ''} onClick={() => setEmoFilter(f => (f === m.e ? null : m.e))} />
              ))}
            </div>
            <small>{stats.mix.length ? stats.mix.map(m => m.e).join(' · ') : 'No emotions logged yet'}</small>
          </div>
        </section>}

        <div className="jn-nb">
          {/* ── Composer ── */}
          <section ref={formRef} className={`x-card jn-form ${isEditing ? 'is-editing' : ''}`} data-testid="journal-form" aria-labelledby="jn-form-t">
            <div className="x-ch">
              <h2 id="jn-form-t">{isEditing ? 'Edit entry' : 'New entry'}</h2>
              {isEditing && <span className="x-tag">Editing</span>}
              {isEditing && <div className="x-r"><button className="x-btn x-btn--ghost x-btn--sm" onClick={startNew}>Cancel</button></div>}
            </div>
            <div className="jn-row2">
              <div className="x-field"><label htmlFor="jn-date">Date</label>
                <input id="jn-date" type="date" className="x-input" value={draft.entryDate} max={localDay(new Date())} onChange={e => setDraft(d => ({ ...d, entryDate: e.target.value }))} data-testid="entry-date" />
              </div>
              <div className="x-field"><label htmlFor="jn-title">Title <span className="jn-opt">· optional</span></label>
                <input id="jn-title" className="x-input" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="London session review" maxLength={120} data-testid="entry-title" />
              </div>
            </div>
            <div className="x-field"><span className="x-label">Emotion <span className="jn-opt">· optional</span></span>
              <EmotionChips options={EMOTIONS} value={draft.emotion} onChange={v => setDraft(d => ({ ...d, emotion: v }))} />
            </div>
            <div className="x-field"><span className="x-label">Tags <span className="jn-opt">· optional</span></span>
              <TagEditor tags={draft.tags} onRemove={t => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))} draft={tagDraft} setDraft={setTagDraft} onCommit={commitTagDraft} placeholder="plan" />
            </div>
            <div className="x-field"><label htmlFor="jn-body">Notes</label>
              <textarea id="jn-body" ref={bodyRef} className="x-textarea" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} data-testid="entry-body"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
                placeholder="What happened, how you felt, and what you’ll do next time." />
            </div>
            <div className="jn-form-ft">
              <button className="x-btn x-btn--hi" onClick={handleSave} disabled={saving || !draft.body.trim()} data-testid="save-entry">
                {saving ? 'Saving…' : isEditing ? 'Update entry' : 'Save entry'}
              </button>
              <span className="jn-hint">⌘ Enter to save</span>
            </div>
          </section>

          {/* ── Entries ── */}
          <section className="x-card jn-entries" aria-label="Entries">
            <div className="x-ch">
              <h2>Entries</h2>
              {entries.length > 0 && <span className="x-sub">{shown.length} of {entries.length}</span>}
              {entries.length > 0 && (
                <div className="x-r">
                  <label className="x-search jn-esearch">
                    <ISearch size={15} />
                    <input className="x-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes and tags" aria-label="Search notes and tags" onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} />
                    {q && <button className="jn-clear" aria-label="Clear" onClick={() => setQ('')}><IClose size={14} /></button>}
                  </label>
                </div>
              )}
            </div>
            {emoFilter && (
              <div className="jn-filter">Showing
                <button className={`x-tag jn-chip jn-chip--x ${POSITIVE_EMOTIONS.includes(emoFilter) ? 'x-tag--g' : 'x-tag--r'}`} onClick={() => setEmoFilter(null)} aria-label={`Clear ${emoFilter} filter`}>{emoFilter}<IClose size={12} /></button>
              </div>
            )}
            {loading ? (
              <div aria-busy="true" style={{ display: 'grid', gap: 18 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ display: 'grid', gap: 8 }}><i className="x-skel x-skel--in" style={{ height: 12, width: '30%' }} /><i className="x-skel x-skel--in" style={{ height: 14, width: '90%' }} /><i className="x-skel x-skel--in" style={{ height: 14, width: '70%' }} /></div>)}
              </div>
            ) : entries.length === 0 ? (
              <div className="x-empty" data-testid="journal-empty">
                <span className="x-ic"><IJournal size={22} /></span>
                <b>Your logbook is empty</b>
                <p>Write one honest line after each session: the plan, the feeling, and what you’d change.</p>
                <button className="x-btn" onClick={() => bodyRef.current?.focus()}>Start writing</button>
              </div>
            ) : shown.length === 0 ? (
              <div className="x-empty"><b>No entries match</b><button className="x-btn x-btn--sm" onClick={() => { setQ(''); setEmoFilter(null); }}>Clear filters</button></div>
            ) : (
              <div>
                {shown.map(e => {
                  const acct = accountName(e.brokerAccountId);
                  const confirming = confirmDel === e.id;
                  return (
                    <article key={e.id} className={`jn-entry ${flash === e.id ? 'is-flash' : ''} ${draft.id === e.id ? 'is-editing' : ''}`} data-testid={`entry-${e.id}`}>
                      <div className="jn-meta">
                        <span>{fmtDate(e.entryDate)}</span>
                        {e.tradeId && <><span className="jn-sep">·</span><Link href={`/trades/${e.tradeId}${e.brokerAccountId ? `?account=${encodeURIComponent(e.brokerAccountId)}` : ''}`} className="x-link">Trade #{e.tradeId}</Link></>}
                        {acct && <><span className="jn-sep">·</span><span>{acct}</span></>}
                        {e.emotion && <span className={`x-tag ${POSITIVE_EMOTIONS.includes(e.emotion) ? 'x-tag--g' : 'x-tag--r'}`}>{e.emotion}</span>}
                        <span className="jn-acts">
                          {confirming ? (
                            <><span>Delete?</span>
                              <button className="x-btn x-btn--danger x-btn--sm" onClick={() => handleDelete(e.id)} disabled={deletingId === e.id} data-testid={`confirm-delete-${e.id}`}>{deletingId === e.id ? 'Deleting…' : 'Delete'}</button>
                              <button className="x-btn x-btn--sm" onClick={() => setConfirmDel(null)}>Keep</button></>
                          ) : (
                            <><button className="x-btn x-btn--ghost x-btn--sm" onClick={() => startEdit(e)} data-testid={`edit-${e.id}`}>Edit</button>
                              <button className="x-btn x-btn--ghost x-btn--sm" onClick={() => setConfirmDel(e.id)} data-testid={`delete-${e.id}`}>Delete</button></>
                          )}
                        </span>
                      </div>
                      {e.title && <h3 className="jn-title">{e.title}</h3>}
                      <p className="jn-body">{e.body}</p>
                      {(e.tags ?? []).length > 0 && (
                        <div className="jn-tags">{e.tags.map(t => <span key={t} className={tagClass(t)}>{tagLabel(t)}</span>)}</div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
