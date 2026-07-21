// AI provider abstraction. The wire protocol is OpenAI-compatible, so a single
// adapter serves Groq (default), OpenAI, or any compatible host by swapping the
// base URL + key (see packages/config). Callers depend only on the AiProvider
// interface, never on a concrete SDK — so switching hosts is one env change.
//
// When no provider/key is configured, getProvider() throws AiUnavailableError so
// the caller can fall back to the rule-based insight engine.
import OpenAI from 'openai';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AiUnavailableError } from '../../http/errors.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  readonly model: string;
  /** Stream the assistant reply token-by-token. */
  stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
  /** Non-streaming completion (used for one-shot generation). */
  complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
}

class OpenAiCompatProvider implements AiProvider {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string, model: string) {
    this.model = model;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
    const completion = await this.client.chat.completions.create(
      { model: this.model, messages, stream: true, temperature: 0.4 },
      { signal },
    );
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const completion = await this.client.chat.completions.create(
      { model: this.model, messages, temperature: 0.4 },
      { signal },
    );
    return completion.choices[0]?.message?.content ?? '';
  }
}

let cached: AiProvider | null = null;

/** Returns the configured provider, or throws AiUnavailableError when AI is off. */
export function getProvider(): AiProvider {
  if (!env.AI_ENABLED || !env.AI_API_KEY) {
    throw new AiUnavailableError();
  }
  if (!cached) {
    cached = new OpenAiCompatProvider(env.AI_API_KEY, env.AI_BASE_URL_RESOLVED, env.AI_MODEL_RESOLVED);
    logger.info(`AI provider ready: ${env.AI_PROVIDER} · ${env.AI_MODEL_RESOLVED}`);
  }
  return cached;
}

/** Cheap check callers use to decide whether to attempt AI at all. */
export function isAiEnabled(): boolean {
  return env.AI_ENABLED && !!env.AI_API_KEY;
}
