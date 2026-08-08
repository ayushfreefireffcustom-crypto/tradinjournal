// Macro AI assistant — answers from injected /api/macro/state only.
// Uses the SAME provider layer as the trading coach: OpenAI-wire-compatible, so
// one adapter serves Groq (default), OpenAI, or any compatible host, chosen by
// AI_PROVIDER + the matching key in packages/config. No key → AI_ENABLED is false
// and we fall back to a deterministic template summary. Same behaviour as the coach.
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
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

function buildMessages(question: string, system: string): ChatMessage[] {
  // State goes in the system prompt as trusted data; the user question is a
  // separate user turn (injection-safe — the model can't be told to ignore
  // instructions via the question).
  return [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
}

export async function answerMacroQuestion(question: string): Promise<{ answer: string; streamed: false }> {
  const state = await getMacroState();
  if (looksPersonalized(question)) {
    return { answer: `${PERSONALIZED_REFUSAL}\n\n${NFA_DISCLAIMER}`, streamed: false };
  }
  if (!isAiEnabled()) {
    return { answer: templateFallback(question, state), streamed: false };
  }
  const answer = await getProvider().complete(buildMessages(question, buildSystemPrompt(state)));
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
  if (!isAiEnabled()) {
    yield templateFallback(question, state);
    return;
  }
  let sawDisclaimer = false;
  for await (const chunk of getProvider().stream(buildMessages(question, buildSystemPrompt(state)))) {
    if (chunk.toLowerCase().includes('not financial advice')) sawDisclaimer = true;
    yield chunk;
  }
  if (!sawDisclaimer) yield `\n\n${NFA_DISCLAIMER}`;
}
