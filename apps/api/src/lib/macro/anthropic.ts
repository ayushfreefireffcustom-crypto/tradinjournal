// Anthropic Messages API client for the macro assistant (server-only).
// Separate from the Groq/OpenAI trading coach. Degrades when no key is set.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AiUnavailableError } from '../../http/errors.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function isMacroAssistantEnabled(): boolean {
  return env.MACRO_ASSISTANT_ENABLED && !!env.ANTHROPIC_API_KEY;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/** Non-streaming completion. */
export async function anthropicComplete(
  system: string,
  messages: AnthropicMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError('Macro assistant is unavailable.');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 1024,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn(`[macro/anthropic] HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new AiUnavailableError('Macro assistant request failed.');
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (json.content ?? [])
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text!)
    .join('');
  return text;
}

/**
 * Stream text deltas via Anthropic SSE. Yields plain text chunks.
 */
export async function* anthropicStream(
  system: string,
  messages: AnthropicMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError('Macro assistant is unavailable.');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 1024,
      stream: true,
      system,
      messages,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    logger.warn(`[macro/anthropic] stream HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new AiUnavailableError('Macro assistant stream failed.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          yield evt.delta.text;
        }
      } catch {
        /* ignore malformed SSE chunks */
      }
    }
  }
}
