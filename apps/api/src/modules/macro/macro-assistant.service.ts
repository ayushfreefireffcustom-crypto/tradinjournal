// Macro AI assistant — answers from injected /api/macro/state only.
import { isMacroAssistantEnabled, anthropicComplete, anthropicStream } from '../../lib/macro/anthropic.js';
import { getMacroState } from './macro.service.js';
import {
  NFA_DISCLAIMER,
  PERSONALIZED_REFUSAL,
  buildSystemPrompt,
  templateFallback,
  looksPersonalized,
} from './macro-assistant.prompt.js';

export {
  NFA_DISCLAIMER,
  buildSystemPrompt,
  templateFallback,
  looksPersonalized,
} from './macro-assistant.prompt.js';

export async function answerMacroQuestion(question: string): Promise<{ answer: string; streamed: false }> {
  const state = await getMacroState();
  if (looksPersonalized(question)) {
    return { answer: `${PERSONALIZED_REFUSAL}\n\n${NFA_DISCLAIMER}`, streamed: false };
  }
  if (!isMacroAssistantEnabled()) {
    return { answer: templateFallback(question, state), streamed: false };
  }
  const system = buildSystemPrompt(state);
  const answer = await anthropicComplete(system, [{ role: 'user', content: question }]);
  const withDisclaimer = answer.toLowerCase().includes('not financial advice')
    ? answer
    : `${answer.trim()}\n\n${NFA_DISCLAIMER}`;
  return { answer: withDisclaimer, streamed: false };
}

export async function* streamMacroAnswer(question: string): AsyncGenerator<string> {
  const state = await getMacroState();
  if (looksPersonalized(question)) {
    yield `${PERSONALIZED_REFUSAL}\n\n${NFA_DISCLAIMER}`;
    return;
  }
  if (!isMacroAssistantEnabled()) {
    yield templateFallback(question, state);
    return;
  }
  const system = buildSystemPrompt(state);
  let sawDisclaimer = false;
  for await (const chunk of anthropicStream(system, [{ role: 'user', content: question }])) {
    if (chunk.toLowerCase().includes('not financial advice')) sawDisclaimer = true;
    yield chunk;
  }
  if (!sawDisclaimer) yield `\n\n${NFA_DISCLAIMER}`;
}
