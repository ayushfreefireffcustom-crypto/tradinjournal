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

  // ── Phase 2: Economic calendar ────────────────────────────────────────────
  // Free-first with a swappable provider layer. Any subset of keys may be set;
  // more providers = a richer merge. With none of these AND no feed URL the
  // calendar stays empty (CALENDAR_ENABLED=false) — nothing crashes.
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(), // shared with news
  // Public weekly JSON feed; isolated behind its own opt-in for ToS clarity.
  FOREXFACTORY_FEED_URL: z.string().url().optional(),
  // Field-merge precedence when several providers describe the same event.
  CALENDAR_PROVIDER_PRIORITY: z.string().default('forexfactory,fmp,finnhub'),
  CALENDAR_INGEST_CRON: z.string().default('*/15 * * * *'),

  // ── Phase 2: News feed ────────────────────────────────────────────────────
  // RSS baseline is always available (no key); keyed aggregators enrich coverage.
  MARKETAUX_API_KEY: z.string().optional(),
  CRYPTOPANIC_API_KEY: z.string().optional(),
  // Optional CSV override of the built-in licensed RSS defaults.
  NEWS_RSS_FEEDS: z.string().optional(),
  // Ingest is now LLM-free (bulk insert only), so a 1-min cadence is fine;
  // BullMQ concurrency 1 prevents overlap.
  NEWS_INGEST_CRON: z.string().default('*/1 * * * *'),
  // Enrichment runs on its own cron, decoupled from ingest, draining the
  // un-enriched backlog a batch at a time.
  NEWS_ENRICH_CRON: z.string().default('*/2 * * * *'),
  // Hard cap on LLM enrichment per enrich tick — bounds spend.
  NEWS_ENRICH_MAX_PER_TICK: z.coerce.number().int().positive().default(40),

  // ── Phase 2: Web Push (VAPID) ─────────────────────────────────────────────
  // Absent keys → push simply isn't offered (PUSH_ENABLED=false).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:hello@tradelogs.com'),
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
  /** True when at least one economic-calendar provider is configured. */
  CALENDAR_ENABLED: boolean;
  /** Ordered list of calendar providers for field-merge precedence. */
  CALENDAR_PROVIDER_PRIORITY_LIST: string[];
  /** True when the news feed can run — RSS is always available, so this is effectively always on. */
  NEWS_ENABLED: boolean;
  /** True when news items can be LLM-enriched (news on AND an AI provider configured). */
  NEWS_ENRICH_ENABLED: boolean;
  /** True when Web Push is fully configured (both VAPID keys present). */
  PUSH_ENABLED: boolean;
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

  // Phase 2 feature gates — same optional-with-fallback pattern as AI_ENABLED.
  // Calendar needs at least one source; news has an always-on RSS baseline;
  // enrichment additionally needs the LLM; push needs both VAPID keys.
  const CALENDAR_ENABLED =
    !!parsed.data.FMP_API_KEY || !!parsed.data.FINNHUB_API_KEY || !!parsed.data.FOREXFACTORY_FEED_URL;
  const CALENDAR_PROVIDER_PRIORITY_LIST = parsed.data.CALENDAR_PROVIDER_PRIORITY
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const NEWS_ENABLED = true; // RSS baseline requires no key
  const NEWS_ENRICH_ENABLED = NEWS_ENABLED && AI_ENABLED;
  const PUSH_ENABLED = !!parsed.data.VAPID_PUBLIC_KEY && !!parsed.data.VAPID_PRIVATE_KEY;

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
    CALENDAR_ENABLED,
    CALENDAR_PROVIDER_PRIORITY_LIST,
    NEWS_ENABLED,
    NEWS_ENRICH_ENABLED,
    PUSH_ENABLED,
  };
}

export const env: Env = loadEnv();
