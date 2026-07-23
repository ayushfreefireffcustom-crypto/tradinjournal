'use client';

// Thread list for the AI Coach: switch between past conversations, start a new
// one, or delete a thread. Rendered as a fixed column on desktop and as a slide-in
// drawer on small screens (the parent owns the open/close state).
import { useEffect, useState } from 'react';
import { Plus, Trash, Check, ChatCircle, X } from '@phosphor-icons/react';
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

/** Compact "when" label: today shows a time, this year a day/month, else a year. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ConversationSidebar({
  conversations, activeId, loading, busy, onSelect, onNew, onDelete, onClose,
}: Props) {
  // Deleting a thread is irreversible, so the trash icon arms first and only
  // deletes on a second click — a confirmation without a blocking dialog.
  const [armedId, setArmedId] = useState<string | null>(null);

  useEffect(() => {
    if (!armedId) return;
    const t = setTimeout(() => setArmedId(null), 3500);
    return () => clearTimeout(t);
  }, [armedId]);

  return (
    <aside className="flex flex-col h-full w-full bg-surface/30" data-testid="coach-sidebar">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border-soft">
        <button
          onClick={onNew}
          disabled={busy}
          data-testid="coach-new-chat"
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border-soft bg-surface/60 px-3 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase text-fg-2 hover:border-profit/40 hover:text-fg transition-colors disabled:opacity-40"
        >
          <Plus size={13} weight="bold" />
          New chat
        </button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close history"
            className="lg:hidden shrink-0 rounded-[var(--radius-btn)] border border-border-soft p-2 text-fg-3 hover:text-fg transition-colors"
          >
            <X size={13} weight="bold" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 py-3 text-[11px] text-fg-3">Loading threads…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-fg-3 leading-relaxed">
            No conversations yet. Ask something to start one.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map(c => {
              const active = c.id === activeId;
              const armed = armedId === c.id;
              return (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => onSelect(c.id)}
                    disabled={busy}
                    data-testid="coach-thread"
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left rounded-[var(--radius-btn)] pl-2.5 pr-8 py-2 transition-colors disabled:opacity-50 ${
                      active ? 'bg-profit/12 text-fg' : 'text-fg-2 hover:bg-surface-hover hover:text-fg'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <ChatCircle size={12} weight={active ? 'fill' : 'regular'} className={active ? 'text-profit shrink-0' : 'text-fg-3 shrink-0'} />
                      <span className="truncate text-[12px]">{c.title?.trim() || 'Untitled chat'}</span>
                    </span>
                    <span className="block pl-[18px] text-[9.5px] tracking-[0.14em] uppercase text-fg-3 mt-0.5">
                      {whenLabel(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (armed) { setArmedId(null); onDelete(c.id); }
                      else setArmedId(c.id);
                    }}
                    disabled={busy}
                    title={armed ? 'Click again to delete' : 'Delete conversation'}
                    aria-label={armed ? 'Confirm delete' : `Delete ${c.title?.trim() || 'conversation'}`}
                    data-testid="coach-thread-delete"
                    className={`absolute right-1.5 top-1.5 rounded-[var(--radius-btn)] p-1.5 transition-all disabled:opacity-0 ${
                      armed
                        ? 'opacity-100 text-loss bg-loss/15'
                        : 'text-fg-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-loss hover:bg-loss/10'
                    }`}
                  >
                    {armed ? <Check size={12} weight="bold" /> : <Trash size={12} weight="bold" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
