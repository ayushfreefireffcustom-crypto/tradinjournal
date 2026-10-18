'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { toCsv, downloadCsv, dateStamp } from '@/lib/csv';
import { useToast } from '@/components/toast';
import { IDownload, IClose, IPlus, ISearch, IJournal } from '@/components/v3/icons';

const EMOTIONS = ['Disciplined', 'Patient', 'Confident', 'FOMO', 'Revenge', 'Hesitant'];
const POSITIVE = ['Disciplined', 'Confident', 'Patient'];
// One hue per mindset; green family = calm, amber = hesitant, red family = reactive.
const EMO: Record<string, { c: string; tone: 'g' | 'v' | 'a' | 'r' }> = {
  Disciplined: { c: '#19C37D', tone: 'g' }, Patient: { c: '#7ED9AE', tone: 'g' }, Confident: { c: '#9479FF', tone: 'v' },
  Hesitant: { c: '#F2B53A', tone: 'a' }, FOMO: { c: '#F77A8D', tone: 'r' }, Revenge: { c: '#F4435E', tone: 'r' },
};
const BAD_TAG = /revenge|fomo|tilt|hold.?loser|mistake|overtrad|chase/i;
const tagLabel = (t: string) => `#${t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')}`;

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function toDateInput(iso: string) { return localDay(new Date(iso)); }
function fromDateInput(v: string) { const [y, m, d] = v.split('-').map(Number); return new Date(y!, m! - 1, d!, 12).toISOString(); }
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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

export default function NotebookPage() {
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
    const calm = [...counts.entries()].filter(([e]) => POSITIVE.includes(e)).reduce((a, [, c]) => a + c, 0);
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
    <button className="v3-btn v3-btn--o t-export" onClick={exportCsv} disabled={entries.length === 0} data-testid="export-csv">
      <IDownload size={16} /><span>Export CSV</span>
    </button>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Journal" actions={actions}>
      <div className="v3-page" data-testid="notebook-page">
        <header className="n-head">
          <p className="v3-sub" style={{ marginTop: 0 }}>Trading logbook</p>
          <h1 className="v3-h1 t-h1"><span className="num">{loading ? '—' : entries.length}</span> <em>{entries.length === 1 ? 'entry.' : 'entries.'}</em></h1>
          <p className="v3-sub" style={{ fontSize: 15 }}>Your trading psychology, one note at a time.</p>
        </header>

        {error && (
          <div className="d-err" role="alert" data-testid="notebook-error" style={{ marginBottom: 18 }}>
            <span>{error}</span><button className="v3-btn v3-btn--o" onClick={loadEntries}>Retry</button>
          </div>
        )}

        <section className="v3-card a-kpis n-kpis" aria-label="Journal stats">
          <div><span>This month</span><b className="num">{stats.thisMonth}</b><small>entr{stats.thisMonth === 1 ? 'y' : 'ies'}</small></div>
          <div><span>Day streak</span><b className="num">{stats.streak}</b><small>{stats.streak ? `day${stats.streak === 1 ? '' : 's'} in a row` : 'Write today to start one'}</small></div>
          <div><span>Top mindset</span><b>{stats.top ?? '—'}</b><small>{stats.top ? `${stats.topPct}% of tagged entries` : 'Tag an emotion to see this'}</small></div>
          <div><span>Discipline</span><b className={`num ${stats.discipline != null && stats.discipline >= 50 ? 'lg' : stats.discipline != null ? 'sh' : ''}`}>{stats.discipline == null ? '—' : `${stats.discipline}%`}</b><small>calm vs reactive</small></div>
          <div className="n-mix">
            <span>Mindset mix</span>
            <div className="n-bar" role="img" aria-label={stats.mix.map(m => `${m.e} ${m.n}`).join(', ') || 'No emotions logged'}>
              {stats.mix.length ? stats.mix.map(m => (
                <button key={m.e} style={{ width: `${m.pct}%`, background: EMO[m.e]!.c }} title={`${m.e} · ${m.n}`} aria-pressed={emoFilter === m.e}
                  className={emoFilter && emoFilter !== m.e ? 'dim' : ''} onClick={() => setEmoFilter(f => (f === m.e ? null : m.e))} />
              )) : <i />}
            </div>
            <small>{stats.mix.length ? stats.mix.map(m => m.e).join(' · ') : 'No emotions logged yet'}</small>
          </div>
        </section>

        <div className="n-grid">
          {/* ── Composer ── */}
          <section ref={formRef} className={`v3-card n-form ${isEditing ? 'editing' : ''}`} data-testid="journal-form" aria-labelledby="n-form-t">
            <div className="n-form-hd">
              <h3 id="n-form-t">{isEditing ? 'Edit entry' : 'New entry'}</h3>
              {isEditing && <button className="v3-link" onClick={startNew} style={{ margin: 0 }}>Cancel</button>}
            </div>
            <div className="n-row2">
              <label className="n-fld"><span>Date</span>
                <input type="date" className="n-in" value={draft.entryDate} max={localDay(new Date())} onChange={e => setDraft(d => ({ ...d, entryDate: e.target.value }))} data-testid="entry-date" />
              </label>
              <label className="n-fld"><span>Title <em>· optional</em></span>
                <input className="n-in" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="London session review" maxLength={120} data-testid="entry-title" />
              </label>
            </div>
            <div className="n-fld"><span>Emotion <em>· optional</em></span>
              <div className="r-emo">
                {EMOTIONS.map(e => (
                  <button key={e} aria-pressed={draft.emotion === e} className={EMO[e]!.tone === 'r' ? 'neg' : ''} onClick={() => setDraft(d => ({ ...d, emotion: d.emotion === e ? '' : e }))} data-testid={`emotion-${e.toLowerCase()}`}>{e}</button>
                ))}
              </div>
            </div>
            <div className="n-fld"><span>Tags <em>· optional</em></span>
              <div className="r-tags">
                {draft.tags.map(t => <button key={t} className="r-tag" onClick={() => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))} aria-label={`Remove ${tagLabel(t)}`}>{tagLabel(t)} <IClose size={13} /></button>)}
                {tagDraft !== null ? (
                  <input autoFocus className="r-tag-in" value={tagDraft} onChange={e => setTagDraft(e.target.value)} placeholder="plan" data-testid="tag-draft-input"
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTagDraft(); } if (e.key === 'Escape') setTagDraft(null); }} onBlur={commitTagDraft} />
                ) : <button className="r-tag add" onClick={() => setTagDraft('')} data-testid="add-tag"><IPlus size={13} /> Add</button>}
              </div>
            </div>
            <label className="n-fld r-notes"><span>Notes</span>
              <textarea ref={bodyRef} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} data-testid="entry-body"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
                placeholder="What happened, how you felt, and what you’ll do next time." />
            </label>
            <button className="r-save" onClick={handleSave} disabled={saving || !draft.body.trim()} data-testid="save-entry">
              {saving ? 'Saving…' : isEditing ? 'Update entry' : 'Save entry'}
            </button>
            <small className="r-hint">⌘ Enter to save</small>
          </section>

          {/* ── Entries ── */}
          <section className="n-list" aria-label="Entries">
            {entries.length > 0 && (
              <div className="n-tools">
                <label className="v3-field n-search"><ISearch size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes and tags…" onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} />
                  {q && <button aria-label="Clear" onClick={() => setQ('')}><IClose size={14} /></button>}</label>
                {emoFilter && <button className="v3-pill v n-filter" onClick={() => setEmoFilter(null)}>{emoFilter} <IClose size={12} /></button>}
                <span className="t-count">{shown.length} of {entries.length}</span>
              </div>
            )}
            {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 170, borderRadius: 20 }} />)
              : entries.length === 0 ? (
                <div className="v3-card n-empty" data-testid="journal-empty">
                  <span className="r-empty-ic"><IJournal size={22} /></span>
                  <h3>Your logbook is empty</h3>
                  <p>Write one honest line after each session. Patterns show up faster than you’d think.</p>
                  <ul>
                    <li>What was my plan before entering?</li>
                    <li>What emotion drove the exit?</li>
                    <li>What will I do differently next time?</li>
                  </ul>
                  <button className="v3-btn v3-btn--o" onClick={() => bodyRef.current?.focus()}>Start writing</button>
                </div>
              ) : shown.length === 0 ? (
                <div className="v3-card d-empty"><b>No entries match</b><button className="v3-link" onClick={() => { setQ(''); setEmoFilter(null); }}>Clear filters</button></div>
              ) : shown.map(e => {
                const meta = e.emotion ? EMO[e.emotion] : null;
                const acct = accountName(e.brokerAccountId);
                const confirming = confirmDel === e.id;
                return (
                  <article key={e.id} className={`v3-card n-entry ${flash === e.id ? 'flash' : ''} ${draft.id === e.id ? 'editing' : ''}`} style={{ ['--edge' as string]: meta?.c ?? '#E4E2E6' }} data-testid={`entry-${e.id}`}>
                    <div className="n-meta">
                      <span className="num">{fmtDate(e.entryDate)}</span>
                      {e.tradeId && <> · <Link href={`/trades/${e.tradeId}${e.brokerAccountId ? `?account=${encodeURIComponent(e.brokerAccountId)}` : ''}`} className="n-trade">Trade #{e.tradeId}</Link></>}
                      {acct && <> · {acct}</>}
                      {e.emotion && meta && <span className={`v3-pill ${meta.tone}`}>{e.emotion}</span>}
                      <span className="n-acts">
                        {confirming ? (
                          <><span className="mute">Delete?</span>
                            <button className="n-del" onClick={() => handleDelete(e.id)} disabled={deletingId === e.id} data-testid={`confirm-delete-${e.id}`}>{deletingId === e.id ? 'Deleting…' : 'Delete'}</button>
                            <button onClick={() => setConfirmDel(null)}>Keep</button></>
                        ) : (
                          <><button className="ed" onClick={() => startEdit(e)} data-testid={`edit-${e.id}`}>Edit</button>
                            <button onClick={() => setConfirmDel(e.id)} data-testid={`delete-${e.id}`}>Del</button></>
                        )}
                      </span>
                    </div>
                    {e.title && <h3 className="n-title">{e.title}</h3>}
                    <p className="n-body">{e.body}</p>
                    {(e.tags ?? []).length > 0 && (
                      <div className="n-tags">{e.tags.map(t => <span key={t} className={`t-tag ${BAD_TAG.test(t) ? 'bad' : ''}`}>{tagLabel(t)}</span>)}</div>
                    )}
                  </article>
                );
              })}
          </section>
        </div>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
