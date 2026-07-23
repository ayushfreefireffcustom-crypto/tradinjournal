'use client';

// AI Coach — a live chatbot grounded on the user's own trading-journal data.
// Ask about your behaviour ("why do I lose on Fridays?") and get suggestions.
// Streams the reply token-by-token over SSE and persists the conversation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Robot, PaperPlaneRight, Sparkle, MagnifyingGlass, LinkSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { api, type AiChatMessage, type BrokerAccount } from '@/lib/api';

const STARTERS = [
  "What's my biggest leak right now?",
  'Why do I lose on certain days?',
  'Am I cutting winners too early?',
  'How disciplined is my risk?',
];

export default function CoachPage() {
  const { accounts, selected, select } = useAccounts();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const accountId = selected?.id ?? null;

  // Auto-scroll to the newest message / token.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load the most recent conversation for the selected account.
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setHistoryLoading(true);
    setMessages([]);
    setConversationId(undefined);
    setError('');
    (async () => {
      try {
        const convos = await api.ai.conversations();
        const latest = convos.find(c => c.brokerAccountId === accountId);
        if (!alive) return;
        if (latest) {
          const detail = await api.ai.conversation(latest.id);
          if (!alive) return;
          setConversationId(detail.id);
          setMessages(detail.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
        }
      } catch {
        // No history is fine — start fresh.
      } finally {
        if (alive) setHistoryLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accountId]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending || !accountId) return;

      setError('');
      setInput('');
      const history: AiChatMessage[] = [...messages, { role: 'user', content }];
      // Optimistically render the user message + an empty assistant bubble to fill.
      setMessages([...history, { role: 'assistant', content: '' }]);
      setSending(true);
      setSearching(false);

      const appendToAssistant = (chunk: string) => {
        // First token means the answer is streaming — clear the "searching" state.
        setSearching(false);
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      };

      try {
        const result = await api.ai.chat(
          { accountId, conversationId, messages: history },
          appendToAssistant,
          msg => setError(msg),
          () => setSearching(true),
        );
        if (result.conversationId) setConversationId(result.conversationId);
        // Attach any web citations to the assistant message we just streamed.
        if (result.sources && result.sources.length > 0) {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') next[next.length - 1] = { ...last, sources: result.sources };
            return next;
          });
        }
      } catch (err) {
        const e = err as Error & { code?: string };
        setError(e.message || 'The coach could not respond. Please try again.');
        // Drop the empty assistant bubble on hard failure.
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && last.content === '') next.pop();
          return next;
        });
      } finally {
        setSending(false);
        setSearching(false);
      }
    },
    [messages, sending, accountId, conversationId],
  );

  const isEmpty = messages.length === 0;

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="AI Coach"
      pageSubtitle="// TRAINED ON YOUR DATA"
    >
      <div className="flex flex-col h-[calc(100vh-var(--topbar-h,7rem))] min-h-0" data-testid="coach-page">
        {/* Message stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4" data-testid="coach-messages">
          {isEmpty ? (
            <div className="max-w-2xl mx-auto mt-6 sm:mt-10" data-testid="coach-empty">
              <div className="flex items-center gap-2 mb-3">
                <Robot size={22} weight="fill" className="text-profit" />
                <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tighter">
                  ASK YOUR <span className="text-profit">COACH.</span>
                </h2>
              </div>
              <p className="text-fg-2 text-[13px] sm:text-[14px] leading-relaxed max-w-lg">
                {historyLoading
                  ? 'Loading your history…'
                  : 'I read your closed trades, stats and journal. Ask about your behaviour and I’ll tell you what the data actually shows — no market predictions, just your own edge and leaks.'}
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 mt-6">
                {STARTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={sending || !accountId}
                    data-testid="coach-starter"
                    className="text-left rounded-[var(--radius-btn)] border border-border-soft bg-app/40 px-3.5 py-3 text-[12.5px] text-fg-2 hover:border-border-strong hover:text-fg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Sparkle size={14} weight="fill" className="text-profit shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  data-testid={`coach-msg-${m.role}`}
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-[var(--radius-btn)] bg-profit/15 border border-profit/30 px-3.5 py-2.5 text-[13px] text-fg whitespace-pre-wrap'
                        : 'max-w-[90%] rounded-[var(--radius-btn)] border border-border-soft bg-app/40 px-3.5 py-2.5 text-[13px] text-fg-2 whitespace-pre-wrap leading-relaxed'
                    }
                  >
                    {m.content ? (
                      m.content
                    ) : sending && i === messages.length - 1 && searching ? (
                      <span className="inline-flex items-center gap-1.5 text-fg-3 text-[12px]" data-testid="coach-searching">
                        <MagnifyingGlass size={13} className="animate-pulse" />
                        Searching the web…
                      </span>
                    ) : sending && i === messages.length - 1 ? (
                      <span className="pulse-dot inline-block w-2 h-2 rounded-full bg-profit" />
                    ) : (
                      ''
                    )}
                    {/* Sources footer — web citations the coach used for this answer. */}
                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border-soft" data-testid="coach-sources">
                        <p className="text-[9px] tracking-[0.2em] text-fg-3 mb-1.5">SOURCES</p>
                        <div className="flex flex-col gap-1">
                          {m.sources.map((s, si) => {
                            let domain = s.url;
                            try { domain = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
                            return (
                              <a
                                key={si}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] text-fg-3 hover:text-profit transition-colors truncate"
                              >
                                <LinkSimple size={11} className="shrink-0" />
                                <span className="truncate">{s.title}</span>
                                <span className="text-fg-3/60 shrink-0">· {domain}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 sm:mx-4 lg:mx-6 mb-2 border border-loss/30 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-wide rounded-[var(--radius-btn)]" data-testid="coach-error">
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="border-t border-border px-3 sm:px-4 lg:px-6 py-3"
          data-testid="coach-form"
        >
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              rows={1}
              placeholder={accountId ? 'Ask about your trading…' : 'Connect a broker to start'}
              disabled={sending || !accountId}
              data-testid="coach-input"
              className="tinput flex-1 resize-none max-h-32 py-2.5"
            />
            <button
              type="submit"
              disabled={sending || !accountId || !input.trim()}
              data-testid="coach-send"
              className="btn btn-primary py-2.5 px-3.5 shrink-0 disabled:opacity-50"
              aria-label="Send"
            >
              <PaperPlaneRight size={16} weight="fill" />
            </button>
          </div>
          <p className="max-w-2xl mx-auto text-[9px] tracking-[0.2em] text-fg-3 mt-2">
            NOT FINANCIAL ADVICE · REVIEWS YOUR PAST BEHAVIOUR ONLY
          </p>
        </form>
      </div>
    </AppShell>
  );
}
