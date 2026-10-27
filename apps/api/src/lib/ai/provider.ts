// AI provider abstraction. Callers depend only on the AiProvider interface, never
// on a concrete SDK, so switching hosts is one env change (see packages/config):
//   • anthropic — Claude through the official SDK (primary). Native system
//     prompts with prompt caching, structured JSON output, adaptive thinking.
//   • groq / openai — the OpenAI-wire-compatible adapter (alternatives).
//
// Every call names a tier instead of a model: `quality` for user-facing writing
// and analysis (coach, SignalX, reviews, macro, brief), `fast` for high-volume
// plumbing (query routing, news tagging, strategy parsing).
//
// When no provider/key is configured, getProvider() throws AiUnavailableError so
// the caller can fall back to the rule-based engines.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { AiUnavailableError } from '../../http/errors.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AiTier = 'quality' | 'fast';

export interface AiCallOptions {
  /** `quality` (default) for user-facing output, `fast` for routing/tagging. */
  tier?: AiTier;
  /** How much reasoning to spend. Lower is faster and cheaper. */
  effort?: 'low' | 'medium' | 'high';
  /** false turns reasoning off for latency-sensitive calls. Default: on. */
  thinking?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** JSON Schema for a structured reply. Root must be an object. */
export type JsonSchema = Record<string, unknown>;

export interface AiProvider {
  readonly model: string;
  /** Stream the assistant reply token-by-token. */
  stream(messages: ChatMessage[], opts?: AiCallOptions): AsyncIterable<string>;
  /** Non-streaming completion (used for one-shot generation). */
  complete(messages: ChatMessage[], opts?: AiCallOptions): Promise<string>;
  /** A JSON object shaped by `schema`. Still validate it — it's model output. */
  json(messages: ChatMessage[], schema: JsonSchema, opts?: AiCallOptions): Promise<unknown>;
}

/** The model declined (Claude `stop_reason: "refusal"`). Callers fall back. */
export class AiRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Model declined the request${category ? ` (${category})` : ''}`);
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

class AnthropicProvider implements AiProvider {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string, private readonly fastModel: string) {
    this.model = model;
    // SDK retries 429/5xx/connection errors twice with backoff on its own.
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  private modelFor(tier: AiTier = 'quality'): string {
    return tier === 'fast' ? this.fastModel : this.model;
  }

  /**
   * Leading system messages become the top-level system prompt, cached so the
   * static instructions (and per-account TRADER_DATA) are read from cache on
   * later calls. Any later system message stays in place as a mid-conversation
   * system message (web results, notes), which keeps the cached prefix intact.
   */
  private buildParams(messages: ChatMessage[], opts: AiCallOptions): Anthropic.MessageCreateParamsNonStreaming {
    const lead = messages.findIndex(m => m.role !== 'system');
    const head = lead === -1 ? messages : messages.slice(0, lead);
    const rest = lead === -1 ? [] : messages.slice(lead);

    const system: Anthropic.TextBlockParam[] = head.map(m => ({ type: 'text', text: m.content }));
    if (system.length) system[system.length - 1]!.cache_control = { type: 'ephemeral' };

    const model = this.modelFor(opts.tier);
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: opts.maxTokens ?? 8000,
      system,
      messages: rest.map(m => ({ role: m.role, content: m.content })) as Anthropic.MessageParam[],
      output_config: { effort: opts.effort ?? 'medium' },
    };
    // Sonnet turns reasoning off with `between_tools`; Haiku with `disabled`.
    if (opts.thinking === false) params.thinking = model.includes('sonnet') ? { type: 'between_tools' } : { type: 'disabled' };
    // Multi-turn chat: cache the conversation so the next turn reads it back.
    if (rest.some(m => m.role === 'assistant')) params.cache_control = { type: 'ephemeral' };
    return params;
  }

  private check(msg: Anthropic.Message): void {
    logger.debug(
      `[ai] ${msg.model} in=${msg.usage.input_tokens} cacheRead=${msg.usage.cache_read_input_tokens ?? 0} ` +
        `cacheWrite=${msg.usage.cache_creation_input_tokens ?? 0} out=${msg.usage.output_tokens} stop=${msg.stop_reason}`,
    );
    if (msg.stop_reason === 'refusal') throw new AiRefusalError(msg.stop_details?.category ?? null);
  }

  private static text(msg: Anthropic.Message): string {
    return msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  }

  async *stream(messages: ChatMessage[], opts: AiCallOptions = {}): AsyncIterable<string> {
    const stream = this.client.messages.stream(this.buildParams(messages, opts), { signal: opts.signal });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
    }
    this.check(await stream.finalMessage());
  }

  async complete(messages: ChatMessage[], opts: AiCallOptions = {}): Promise<string> {
    const msg = await this.client.messages.create(this.buildParams(messages, opts), { signal: opts.signal });
    this.check(msg);
    return AnthropicProvider.text(msg);
  }

  async json(messages: ChatMessage[], schema: JsonSchema, opts: AiCallOptions = {}): Promise<unknown> {
    const params = this.buildParams(messages, opts);
    params.output_config = { ...params.output_config, format: { type: 'json_schema', schema } };
    const msg = await this.client.messages.create(params, { signal: opts.signal });
    this.check(msg);
    if (msg.stop_reason === 'max_tokens') throw new Error('Structured reply was cut off at max_tokens');
    return JSON.parse(AnthropicProvider.text(msg));
  }
}

// ── OpenAI-wire-compatible (Groq / OpenAI) ────────────────────────────────────

/** Parse the first JSON object out of free text (fences/prose tolerated). */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model reply');
  return JSON.parse(body.slice(start, end + 1));
}

class OpenAiCompatProvider implements AiProvider {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL: string, model: string, private readonly fastModel: string) {
    this.model = model;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async *stream(messages: ChatMessage[], opts: AiCallOptions = {}): AsyncIterable<string> {
    const completion = await this.client.chat.completions.create(
      { model: opts.tier === 'fast' ? this.fastModel : this.model, messages, stream: true, temperature: 0.4 },
      { signal: opts.signal },
    );
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async complete(messages: ChatMessage[], opts: AiCallOptions = {}): Promise<string> {
    const completion = await this.client.chat.completions.create(
      { model: opts.tier === 'fast' ? this.fastModel : this.model, messages, temperature: 0.4 },
      { signal: opts.signal },
    );
    return completion.choices[0]?.message?.content ?? '';
  }

  async json(messages: ChatMessage[], schema: JsonSchema, opts: AiCallOptions = {}): Promise<unknown> {
    const shaped: ChatMessage[] = [
      ...messages,
      { role: 'system', content: `Reply with ONLY a JSON object matching this JSON Schema, no prose:\n${JSON.stringify(schema)}` },
    ];
    return extractJson(await this.complete(shaped, opts));
  }
}

// ── Selection ─────────────────────────────────────────────────────────────────

let cached: AiProvider | null = null;

/** Returns the configured provider, or throws AiUnavailableError when AI is off. */
export function getProvider(): AiProvider {
  if (!env.AI_ENABLED || !env.AI_API_KEY) {
    throw new AiUnavailableError();
  }
  if (!cached) {
    cached =
      env.AI_PROVIDER_RESOLVED === 'anthropic'
        ? new AnthropicProvider(env.AI_API_KEY, env.AI_MODEL_RESOLVED, env.AI_FAST_MODEL_RESOLVED)
        : new OpenAiCompatProvider(env.AI_API_KEY, env.AI_BASE_URL_RESOLVED, env.AI_MODEL_RESOLVED, env.AI_FAST_MODEL_RESOLVED);
    logger.info(`AI provider ready: ${env.AI_PROVIDER_RESOLVED} · ${env.AI_MODEL_RESOLVED} / ${env.AI_FAST_MODEL_RESOLVED}`);
  }
  return cached;
}

/** Cheap check callers use to decide whether to attempt AI at all. */
export function isAiEnabled(): boolean {
  return env.AI_ENABLED && !!env.AI_API_KEY;
}

/** The Anthropic client, for Claude-only features (server-side web search). */
export function getAnthropicClient(): Anthropic | null {
  if (env.AI_PROVIDER_RESOLVED !== 'anthropic' || !env.AI_API_KEY) return null;
  return new Anthropic({ apiKey: env.AI_API_KEY, maxRetries: 1 });
}
