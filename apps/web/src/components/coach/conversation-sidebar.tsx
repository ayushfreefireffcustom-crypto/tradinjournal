'use client';

// Thread list for the AI Coach: switch between past conversations, start a new
// one, or delete a thread. Rendered as a fixed column on desktop and as a slide-in
// drawer on small screens (the parent owns the open/close state).
import { useEffect, useState } from 'react';
import { IClose, ICheck, IPlus } from '@/components/v3/icons';
import type { AiConversationSummary } from '@/lib/api';

interface Props {
  conversations: AiConversationSummary[];
  activeId?: string;
  loading: boolean;
  /** True while a reply is streaming — switching threads mid-stream is blocked. */
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  /** Mobile drawer only — omitted on the desktop column. */
  onClose?: () => void;
}

/** "2m ago" today, weekday this week, else "12 Oct". */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = (Date.now() - d.getTime()) / 60000;
  if (m < 1) return 'Just now';
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (d.toDateString() === new Date().toDateString()) return `${Math.floor(m / 60)}h ago`;
  if (m < 60 * 24 * 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function groupOf(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return Date.now() - d.getTime() < 7 * 864e5 ? 'This week' : 'Earlier';
}

export default function ConversationSidebar({
  conversations, activeId, loading, busy, onSelect, onNew, onDelete, onClose,
}: Props) {
  // Deleting is irreversible, so the × arms first and deletes on a second click.
  const [armedId, setArmedId] = useState<string | null>(null);
  useEffect(() => {
    if (!armedId) return;
    const t = setTimeout(() => setArmedId(null), 3500);
    return () => clearTimeout(t);
  }, [armedId]);

  const groups: [string, AiConversationSummary[]][] = [];
  for (const c of conversations) {
    const k = groupOf(c.updatedAt);
    const g = groups.find(x => x[0] === k);
    if (g) g[1].push(c); else groups.push([k, [c]]);
  }

  return (
    <aside className="cs" data-testid="coach-sidebar">
      <div className="cs-top">
        <button onClick={onNew} disabled={busy} data-testid="coach-new-chat" className="v3-btn v3-btn--ink cs-new"><IPlus size={16} /> New chat</button>
        {onClose && <button onClick={onClose} aria-label="Close history" className="v3-modal-x"><IClose size={15} /></button>}
      </div>
      <div className="cs-list">
        {loading ? <div style={{ display: 'grid', gap: 8, padding: '6px 4px' }}>{[0, 1, 2].map(i => <div key={i} className="skel d-sk" style={{ height: 44 }} />)}</div>
          : conversations.length === 0 ? <p className="cs-none">No conversations yet. Ask something to start one.</p>
          : groups.map(([label, rows]) => (
            <div key={label} className="cs-g">
              <h4>{label}</h4>
              <ul>
                {rows.map(c => {
                  const active = c.id === activeId, armed = armedId === c.id;
                  return (
                    <li key={c.id}>
                      <button onClick={() => onSelect(c.id)} disabled={busy} data-testid="coach-thread" aria-current={active ? 'true' : undefined} className="cs-t">
                        <b>{c.title?.trim() || 'Untitled chat'}</b><small>{whenLabel(c.updatedAt)}</small>
                      </button>
                      <button onClick={() => { if (armed) { setArmedId(null); onDelete(c.id); } else setArmedId(c.id); }} disabled={busy}
                        title={armed ? 'Click again to delete' : 'Delete conversation'} aria-label={armed ? 'Confirm delete' : `Delete ${c.title?.trim() || 'conversation'}`}
                        data-testid="coach-thread-delete" className={`cs-del ${armed ? 'armed' : ''}`}>
                        {armed ? <ICheck size={14} /> : <IClose size={14} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
    </aside>
  );
}
