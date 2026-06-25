'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';

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

  const inputStyle = { width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.07em' };

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={setSelected} onConnectClick={() => setShowConnect(true)}>
      <div style={{ padding: '28px 28px', maxWidth: 860, margin: '0 auto' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>Journal</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Record your trading thoughts, emotions, and lessons</p>
          </div>
          <button
            onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            New Entry
          </button>
        </div>

        {/* Entry list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <div className="skeleton" style={{ height: 14, width: 160, borderRadius: 5, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 11, width: '90%', borderRadius: 4, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 11, width: '70%', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No journal entries yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Write your first entry to track your trading mindset</p>
            <button onClick={openNew} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Write First Entry
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {entries.map(entry => (
              <div
                key={entry.id}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      {entry.emotion && <span style={{ fontSize: 16 }}>{emotionEmoji(entry.emotion)}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{fmtDate(entry.entryDate)}</span>
                      {entry.tags.length > 0 && entry.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontWeight: 600 }}>{tag}</span>
                      ))}
                    </div>
                    {entry.title && (
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.2px' }}>{entry.title}</p>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {entry.body.length > 280 ? entry.body.slice(0, 280) + '…' : entry.body}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(entry)}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={savingDeleteId === entry.id}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid transparent', background: 'transparent', color: 'var(--text-subtle)', fontSize: 11, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(240,82,82,0.3)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowEditor(false); }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '24px 26px', width: '100%', maxWidth: 560 }} className="fade-up">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                {editing ? 'Edit Entry' : 'New Journal Entry'}
              </h2>
              <button onClick={() => setShowEditor(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>

              <div>
                <label style={labelStyle}>Title (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Revenge traded the NFP move"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={labelStyle}>Notes <span style={{ color: 'var(--red)' }}>*</span></label>
                <textarea
                  placeholder="What happened today? What did you learn? How are you feeling about your trades?"
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div>
                <label style={labelStyle}>How are you feeling?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EMOTIONS.map(({ value, emoji, label }) => {
                    const active = form.emotion === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setForm(f => ({ ...f, emotion: active ? '' : value }))}
                        style={{
                          padding: '5px 11px', borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: 12, cursor: 'pointer', transition: 'all 0.12s',
                        }}
                      >
                        {emoji} {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. XAUUSD, news-trade, mistake"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button
                onClick={() => setShowEditor(false)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.body.trim()}
                style={{ padding: '7px 18px', borderRadius: 8, background: form.body.trim() ? 'var(--accent)' : 'var(--surface-3)', border: 'none', color: form.body.trim() ? '#fff' : 'var(--text-subtle)', fontSize: 13, fontWeight: 600, cursor: form.body.trim() ? 'pointer' : 'default', transition: 'all 0.12s' }}
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
