'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { Plus, BookOpen, X } from 'lucide-react';

const { useSession } = authClient;

const EMOTIONS = [
  { value: 'confident',  emoji: '😤', label: 'Confident' },
  { value: 'calm',       emoji: '😌', label: 'Calm' },
  { value: 'anxious',    emoji: '😰', label: 'Anxious' },
  { value: 'greedy',     emoji: '🤑', label: 'Greedy' },
  { value: 'fearful',    emoji: '😨', label: 'Fearful' },
  { value: 'frustrated', emoji: '😤', label: 'Frustrated' },
  { value: 'neutral',    emoji: '😐', label: 'Neutral' },
];

function emotionEmoji(v: string) {
  return EMOTIONS.find(e => e.value === v)?.emoji ?? '📝';
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface FormState {
  title: string;
  body: string;
  emotion: string;
  tags: string;
  entryDate: string;
}

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  emotion: '',
  tags: '',
  entryDate: new Date().toISOString().slice(0, 10),
});

export default function JournalPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [savingDeleteId, setSavingDeleteId] = useState<string | null>(null);

  useEffect(() => { if (!isPending && !session) router.push('/login'); }, [session, isPending, router]);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.accounts.list();
      setAccounts(data);
      if (data.length > 0) setSelected(data[0] ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) loadAccounts(); }, [session, loadAccounts]);

  const loadEntries = useCallback(async (acc?: BrokerAccount | null) => {
    setLoading(true);
    try { setEntries(await api.journal.list(acc?.id)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session) loadEntries(selected); }, [session, selected, loadEntries]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => { const e = prev.find(a => a.id === account.id); return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]; });
    setSelected(account);
    setShowConnect(false);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setShowEditor(true);
  }

  function openEdit(entry: JournalEntry) {
    setEditing(entry);
    setForm({
      title: entry.title ?? '',
      body: entry.body,
      emotion: entry.emotion ?? '',
      tags: entry.tags.join(', '),
      entryDate: entry.entryDate.slice(0, 10),
    });
    setShowEditor(true);
  }

  async function handleSave() {
    if (!form.body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        emotion: form.emotion || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        entryDate: form.entryDate,
        brokerAccountId: selected?.id,
      };

      if (editing) {
        const updated = await api.journal.update(editing.id, payload);
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      } else {
        const created = await api.journal.create(payload);
        setEntries(prev => [created, ...prev]);
      }
      setShowEditor(false);
      setEditing(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setSavingDeleteId(id);
    try {
      await api.journal.delete(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch { /* ignore */ }
    finally { setSavingDeleteId(null); }
  }

  if (isPending || (!session && !isPending)) return null;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={setSelected} onConnectClick={() => setShowConnect(true)}>
      <div className="w-full max-w-4xl mx-auto px-6 py-8 md:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Journal</h1>
            <p className="text-sm text-on-surface-variant mt-1">Record your trading thoughts, emotions, and lessons</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary-fixed hover:bg-primary-fixed-dim text-on-primary-fixed text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New Entry
          </button>
        </div>

        {/* Entry list */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl p-5 shadow-2xl">
                <div className="h-4 bg-neutral-800/50 rounded animate-pulse w-40 mb-3" />
                <div className="h-3 bg-neutral-800/50 rounded animate-pulse w-11/12 mb-2" />
                <div className="h-3 bg-neutral-800/50 rounded animate-pulse w-3/4" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-white/5 flex items-center justify-center mb-5">
              <BookOpen className="w-8 h-8 text-primary-fixed-dim" />
            </div>
            <h3 className="font-headline-md text-white font-bold mb-2">No journal entries yet</h3>
            <p className="text-on-surface-variant max-w-sm text-sm mb-6">
              Write your first entry to track your trading mindset
            </p>
            <button 
              onClick={openNew} 
              className="px-5 py-2.5 bg-primary-fixed hover:bg-primary-fixed-dim text-on-primary-fixed text-sm font-semibold rounded-lg transition-colors"
            >
              Write First Entry
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="bg-[#09090b]/80 backdrop-blur-md border border-neutral-800/80 rounded-xl p-5 shadow-xl hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2.5 mb-2.5">
                      {entry.emotion && <span className="text-lg leading-none">{emotionEmoji(entry.emotion)}</span>}
                      <span className="text-[11px] font-semibold text-neutral-400 tracking-wide uppercase">{fmtDate(entry.entryDate)}</span>
                      {entry.tags.length > 0 && entry.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {entry.title && (
                      <p className="text-base font-bold text-white mb-2 tracking-tight">{entry.title}</p>
                    )}
                    <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap break-words">
                      {entry.body.length > 280 ? entry.body.slice(0, 280) + '…' : entry.body}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(entry)}
                      className="px-3 py-1.5 rounded-lg border border-neutral-800/50 hover:border-neutral-700 text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/[0.02] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={savingDeleteId === entry.id}
                      className="px-3 py-1.5 rounded-lg border border-transparent text-xs font-semibold text-neutral-500 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/5 transition-colors disabled:opacity-50"
                    >
                      {savingDeleteId === entry.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {showEditor && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6"
          onClick={e => { if (e.target === e.currentTarget) setShowEditor(false); }}
        >
          <div className="bg-[#09090b] border border-neutral-800 rounded-2xl p-6 md:p-8 w-full max-w-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white tracking-tight">
                {editing ? 'Edit Entry' : 'New Journal Entry'}
              </h2>
              <button 
                onClick={() => setShowEditor(false)} 
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Date</label>
                <input 
                  type="date" 
                  value={form.entryDate} 
                  onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} 
                  className="w-full bg-surface-container-low border border-outline-variant hover:border-outline/50 focus:border-primary/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Title (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Revenge traded the NFP move"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-container-low border border-outline-variant hover:border-outline/50 focus:border-primary/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Notes <span className="text-red-500">*</span></label>
                <textarea
                  placeholder="What happened today? What did you learn? How are you feeling about your trades?"
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={6}
                  className="w-full bg-surface-container-low border border-outline-variant hover:border-outline/50 focus:border-primary/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors resize-y font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-2 uppercase tracking-wider">How are you feeling?</label>
                <div className="flex flex-wrap gap-2">
                  {EMOTIONS.map(({ value, emoji, label }) => {
                    const active = form.emotion === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setForm(f => ({ ...f, emotion: active ? '' : value }))}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                          active 
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' 
                            : 'border-neutral-800 bg-transparent text-neutral-400 hover:bg-white/[0.02] hover:border-neutral-700 hover:text-neutral-300'
                        }`}
                      >
                        <span className="text-sm">{emoji}</span> {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. XAUUSD, news-trade, mistake"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="w-full bg-surface-container-low border border-outline-variant hover:border-outline/50 focus:border-primary/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-transparent text-neutral-400 hover:text-white text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.body.trim()}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  form.body.trim() 
                    ? 'bg-primary-fixed hover:bg-primary-fixed-dim text-on-primary-fixed shadow-[0_0_15px_rgba(34,212,114,0.15)]' 
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
