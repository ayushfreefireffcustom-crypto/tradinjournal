import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod';

// Resolve .env from monorepo root regardless of which app's CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().default('dev-secret-change-in-production'),
  AUTH_URL: z.string().url().default('http://localhost:4000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ── Transactional email (Resend) ─────────────────────────────────────────
  // When RESEND_API_KEY is absent (typical in local dev) the email layer logs
  // OTP codes to the server console instead of sending, so the full verify
  // flow is testable without a real Resend account.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('TRADElogs <onboarding@resend.dev>'),
  // Where "verify your email" links/buttons point the user (the web app).
  // Optional here: when unset we fall back to CORS_ORIGIN (the web app's real
  // origin, always configured in prod) so emails never link to localhost.
  APP_URL: z.string().url().optional(),

  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),

  // ── AI trading coach (LLM) ───────────────────────────────────────────────
  // Provider is OpenAI-wire-compatible so one adapter serves Groq (default),
  // OpenAI, or any compatible host via AI_BASE_URL. When no key is set (typical
  // in local dev) the AI layer degrades gracefully to the rule-based insight
  // engine — same optional-with-fallback approach as RESEND_API_KEY above.
  AI_PROVIDER: z.enum(['groq', 'openai', 'none']).default('none'),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // ── Web search for the AI coach ──────────────────────────────────────────
  // Same optional-with-fallback approach as the AI block above. When TAVILY_API_KEY
  // is set we use Tavily (purpose-built LLM search); otherwise, when AI is enabled,
  // we fall back to Groq's agentic model (SEARCH_FALLBACK_MODEL). When neither is
  // available the coach simply stays grounded on the trader's own data (no search).
  SEARCH_PROVIDER: z.enum(['tavily', 'compound', 'none']).optional(),
  TAVILY_API_KEY: z.string().optional(),
  SEARCH_FALLBACK_MODEL: z.string().default('groq/compound-mini'),

  MT5_BRIDGE_URL: z.string().url().default('http://localhost:8000'),
  MT5_BRIDGE_SHARED_SECRET: z.string().default('dev-secret-change-in-production'),

  // ── Background jobs (weekly AI review) ───────────────────────────────────
  // The worker schedules; the API executes. The worker never touches the MT5
  // bridge itself — the bridge serialises on one terminal, so a second process
  // fetching deals concurrently would break both. Instead the worker calls the
  // API's internal endpoint, authenticated with a shared token.
  //
  // Same optional-with-fallback approach as the AI/Resend blocks: without
  // REDIS_URL + INTERNAL_API_TOKEN the feature is simply off. The worker idles
  // and the API is unaffected — nothing that already works can break.
  INTERNAL_API_TOKEN: z.string().min(16).optional(),
  // Where the worker reaches the API. On Railway this is the private URL.
  API_INTERNAL_URL: z.string().url().optional(),
  // Saturday 09:00 UTC. Standard 5-field cron.
  WEEKLY_REVIEW_CRON: z.string().default('0 9 * * 6'),
  // Deliberately 1: report generation reads the MT5 bridge, which serialises on
  // a single terminal. Raise only when the bridge is horizontally scaled.
  WEEKLY_REVIEW_CONCURRENCY: z.coerce.number().int().positive().default(1),
  // Sends per minute, so a Saturday batch trickles instead of stampeding.
  WEEKLY_REVIEW_PER_MINUTE: z.coerce.number().int().positive().default(6),
});

export type Env = z.infer<typeof envSchema> & {
  APP_URL: string;
  /** True when a usable AI provider + key are configured. */
  AI_ENABLED: boolean;
  /** Resolved model id (provider default applied when AI_MODEL is unset). */
  AI_MODEL_RESOLVED: string;
  /** Resolved OpenAI-compatible base URL (provider default applied when unset). */
  AI_BASE_URL_RESOLVED: string;
  /** The API key for the selected provider (Groq or OpenAI), if present. */
  AI_API_KEY?: string;
  /** Resolved search backend: Tavily when keyed, else compound fallback when AI is on, else none. */
  SEARCH_PROVIDER_RESOLVED: 'tavily' | 'compound' | 'none';
  /** True when the coach can perform a web search (Tavily key set OR AI enabled for the fallback). */
  SEARCH_ENABLED: boolean;
  /** Base URL the worker uses to reach the API (private URL in prod, API_HOST/PORT locally). */
  API_INTERNAL_URL_RESOLVED: string;
  /** True when the weekly-review worker can run: Redis to queue on, token to authenticate with. */
  WEEKLY_REVIEW_ENABLED: boolean;
};

const AI_DEFAULTS = {
  groq: { model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
} as const;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  // Emails and auth redirects must point at the real web app. If APP_URL isn't
  // set explicitly, reuse CORS_ORIGIN (first origin if comma-separated) — it's
  // always the deployed web origin in prod, so links never point to localhost.
  const APP_URL = parsed.data.APP_URL ?? parsed.data.CORS_ORIGIN.split(',')[0]!.trim();

  // Resolve AI provider settings. Key comes from the provider-specific env var;
  // model / base URL fall back to the provider's default when unset.
  const provider = parsed.data.AI_PROVIDER;
  const AI_API_KEY =
    provider === 'groq' ? parsed.data.GROQ_API_KEY : provider === 'openai' ? parsed.data.OPENAI_API_KEY : undefined;
  const defaults = provider === 'none' ? AI_DEFAULTS.groq : AI_DEFAULTS[provider];
  const AI_MODEL_RESOLVED = parsed.data.AI_MODEL ?? defaults.model;
  const AI_BASE_URL_RESOLVED = parsed.data.AI_BASE_URL ?? defaults.baseUrl;
  const AI_ENABLED = provider !== 'none' && !!AI_API_KEY;

  // Resolve the search backend. An explicit SEARCH_PROVIDER wins (as long as its
  // prerequisites are met); otherwise Tavily when its key is present, else the
  // compound fallback when AI is enabled, else none. Compound reuses the AI client
  // so it needs AI_ENABLED; Tavily only needs its own key.
  const hasTavily = !!parsed.data.TAVILY_API_KEY;
  let SEARCH_PROVIDER_RESOLVED: 'tavily' | 'compound' | 'none';
  const explicit = parsed.data.SEARCH_PROVIDER;
  if (explicit === 'tavily' && hasTavily) SEARCH_PROVIDER_RESOLVED = 'tavily';
  else if (explicit === 'compound' && AI_ENABLED) SEARCH_PROVIDER_RESOLVED = 'compound';
  else if (explicit === 'none') SEARCH_PROVIDER_RESOLVED = 'none';
  else if (hasTavily) SEARCH_PROVIDER_RESOLVED = 'tavily';
  else if (AI_ENABLED) SEARCH_PROVIDER_RESOLVED = 'compound';
  else SEARCH_PROVIDER_RESOLVED = 'none';
  const SEARCH_ENABLED = SEARCH_PROVIDER_RESOLVED !== 'none';

  // The worker reaches the API over the private network in prod; locally the
  // API's own host/port is the right guess. API_HOST is a bind address, so
  // 0.0.0.0 is rewritten to a dialable loopback.
  const localHost = parsed.data.API_HOST === '0.0.0.0' ? '127.0.0.1' : parsed.data.API_HOST;
  const API_INTERNAL_URL_RESOLVED =
    parsed.data.API_INTERNAL_URL ?? `http://${localHost}:${parsed.data.API_PORT}`;

  // Both halves are required: Redis to schedule on, and a token so the worker
  // can prove itself to the API. Missing either means the feature stays off
  // rather than half-working.
  const WEEKLY_REVIEW_ENABLED = !!parsed.data.REDIS_URL && !!parsed.data.INTERNAL_API_TOKEN;

  return {
    ...parsed.data,
    APP_URL,
    AI_ENABLED,
    AI_MODEL_RESOLVED,
    AI_BASE_URL_RESOLVED,
    AI_API_KEY,
    SEARCH_PROVIDER_RESOLVED,
    SEARCH_ENABLED,
    API_INTERNAL_URL_RESOLVED,
    WEEKLY_REVIEW_ENABLED,
  };
}

export const env: Env = loadEnv();
