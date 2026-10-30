'use client';

// Macro AI assistant on the v6 chat surface. This component owns only the macro transport: stream over SSE, and
// fall back to the JSON endpoint (which itself degrades to a deterministic
// template) when the stream yields nothing.
import { useCallback, useState } from 'react';
import MacroChat, { type ChatVM } from '@/components/v6/macro/chat';
import { macroApi } from '@/lib/macro-api';

const STARTERS = [
  'Why is gold’s bias bearish today?',
  'What’s driving the confluence net bias?',
  'Explain the current liquidity backdrop.',
  'Which asset has the strongest macro alignment?',
];

export default function MacroAssistant() {
  const [messages, setMessages] = useState<ChatVM[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;
      setError('');
      setInput('');
      setSending(true);
      setThinking(true);
      setMessages(m => [...m, { role: 'user', content: question }, { role: 'assistant', content: '' }]);

      const append = (chunk: string) => {
        setThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      };

      try {
        const streamed = await macroApi.assistantStream(question, append);
        if (!streamed) {
          const res = await macroApi.assistant(question);
          setThinking(false);
          setMessages(m => {
            const next = [...m];
            next[next.length - 1] = { role: 'assistant', content: res.answer };
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Assistant failed');
        // Drop the empty assistant bubble on hard failure.
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last.content === '') next.pop();
          return next;
        });
      } finally {
        setSending(false);
        setThinking(false);
      }
    },
    [sending],
  );

  return (
    <MacroChat
      data-testid="macro-assistant"
      title="Macro AI"
      sub="Grounded on live dashboard state"
      messages={messages}
      sending={sending}
      thinking={thinking}
      input={input}
      onInput={setInput}
      onSend={send}
      placeholder="Ask a macro question"
      starters={STARTERS}
      emptyTitle="Ask the macro desk"
      emptyText="Answers cite the dashboard’s own indicators, regime and confluence scores."
      disclaimer="Not financial advice. Answers are grounded on the live dashboard state."
      error={error}
    />
  );
}
